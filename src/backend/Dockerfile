# Two stages: Poetry and a compiler exist only to build the virtualenv, and
# neither ships in the image that runs.
#
# The previous single stage pinned Poetry 1.7.1, which cannot read this lock
# (written by Poetry 2.x, format 2.1) and predates `package-mode = false`, so
# the image did not build at all. 3.11 matches CI and `python = "^3.11"`.

FROM python:3.11-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "poetry>=2.1,<3"

WORKDIR /app
COPY pyproject.toml poetry.lock ./

# The virtualenv goes inside /app so the runtime stage can copy it whole.
RUN poetry config virtualenvs.in-project true \
    && poetry install --no-interaction --no-ansi --no-root --only main


FROM python:3.11-slim

WORKDIR /app

RUN useradd -m -u 1000 appuser

COPY --from=build /app/.venv /app/.venv
COPY --chown=appuser:appuser src ./src

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

USER appuser
EXPOSE 8000

# urlopen raises on any non-2xx, so a 500 fails the check. The old one called
# httpx.get and ignored the status, which passed on every response, errors
# included.
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=5)"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
