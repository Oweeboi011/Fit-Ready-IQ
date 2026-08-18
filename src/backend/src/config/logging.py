"""Structured logging configuration.

Two things were wrong with configuring structlog inline in ``main.py``.

**Credentials reached the logs.** Every API client calls
``response.raise_for_status()`` and then ``logger.error(..., error=str(e))``.
httpx puts the full request URL in that exception message, and these clients
pass their credential as a query parameter — so a stringified error reads::

    Client error '403 Forbidden' for url
    'https://maps.googleapis.com/maps/api/geocode/json?address=Manila&key=AIza...'

That is the Google Maps API key, in plaintext, in the logs. A 403 is the
*common* failure here — quota exhausted, or a key restriction misfiring — so it
leaked precisely when something had gone wrong and somebody was reading.

Nineteen call sites across five clients had this shape. Fixing them one by one
would fix today's and not tomorrow's, so the redaction is a **processor**: it
runs over every event dictionary on its way out, and a new client cannot opt out
of it by forgetting.

**``LOG_LEVEL`` did nothing.** ``structlog.configure(processors=[...])`` with no
``wrapper_class`` leaves the default, which does no level filtering at all. The
setting was plumbed only into uvicorn's own logger, so application ``debug``
calls printed in production regardless of what the environment said. A level
control that does not control the level is worse than none, because it is
believed.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import structlog
from structlog.typing import EventDict, WrappedLogger

REDACTED = "[redacted]"

#: Field names whose values never belong in a log line. Matched loosely so
#: ``api_key``, ``apiKey`` and ``X-Api-Key`` are all caught.
SECRET_KEY_PATTERN = re.compile(
    r"(token|secret|password|passwd|credential|authorization|auth|api_?key"
    r"|private_?key|client_?secret|cookie|session)",
    re.IGNORECASE,
)

#: Credentials embedded in a URL query string inside otherwise free text.
#: This is the one that catches stringified httpx exceptions, where the secret
#: is not a field of its own but a substring of a message.
URL_SECRET_PATTERN = re.compile(
    r"([?&](?:key|api_?key|access_token|refresh_token|token|signature|password|secret)=)"
    r"([^&\s'\"]+)",
    re.IGNORECASE,
)

#: A log line is a signal, not a payload store.
MAX_STRING = 512

#: Deep structures are almost always an object we should not be unwrapping.
MAX_DEPTH = 4


def _scrub_text(value: str) -> str:
    """Removes URL-embedded credentials and bounds length."""
    cleaned = URL_SECRET_PATTERN.sub(rf"\1{REDACTED}", value)
    if len(cleaned) > MAX_STRING:
        return f"{cleaned[:MAX_STRING]}…[+{len(cleaned) - MAX_STRING} chars]"
    return cleaned


def _scrub_value(value: Any, depth: int = 0) -> Any:
    """Recursively redacts by key name and scrubs credentials out of strings."""
    if isinstance(value, str):
        return _scrub_text(value)
    if depth >= MAX_DEPTH:
        return "[depth limit]"
    if isinstance(value, dict):
        return {
            key: (
                REDACTED
                if isinstance(key, str) and SECRET_KEY_PATTERN.search(key)
                else _scrub_value(item, depth + 1)
            )
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        # Bounded: one long list must not become one very long log line.
        return [_scrub_value(item, depth + 1) for item in list(value)[:20]]
    return value


def scrub_secrets(
    _logger: WrappedLogger, _method_name: str, event_dict: EventDict
) -> EventDict:
    """structlog processor: redact credentials from every outgoing event.

    Applied to the whole event dictionary rather than to chosen fields, because
    the leak this exists to stop arrives inside ``error=str(e)`` — an ordinary
    looking field whose *value* happens to quote a URL with a key in it.
    """
    return {
        key: (
            REDACTED
            if isinstance(key, str) and SECRET_KEY_PATTERN.search(key)
            else _scrub_value(value)
        )
        for key, value in event_dict.items()
    }


def resolve_level(name: str) -> int:
    """``LOG_LEVEL`` as a numeric level, defaulting to INFO if it is nonsense."""
    level = logging.getLevelName(name.strip().upper())
    return level if isinstance(level, int) else logging.INFO


def configure_logging(log_level: str = "INFO") -> None:
    """Installs the processor chain. Call once, at import time in ``main``.

    Order matters: the scrubber runs *before* the renderer, so it sees the
    structured event dictionary while the values are still separate fields,
    rather than a single formatted string it would have to parse back apart.
    """
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.stdlib.add_log_level,
            scrub_secrets,
            structlog.processors.JSONRenderer(),
        ],
        # Without this, structlog does no level filtering whatsoever and
        # LOG_LEVEL is decorative.
        wrapper_class=structlog.make_filtering_bound_logger(resolve_level(log_level)),
        cache_logger_on_first_use=True,
    )
