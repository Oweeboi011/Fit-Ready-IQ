"""Unit tests for the Firebase bearer-token dependency.

These cover the header handling only — token verification itself is stubbed,
because what is under test is how a malformed or absent credential is reported,
not whether Firebase can validate a signature.
"""

import pytest
from fastapi import HTTPException

from src.presentation import dependencies
from src.presentation.dependencies import firebase_uid_to_user_id, get_current_user_id


@pytest.fixture
def accept_any_token(monkeypatch):
    """Stub verification so header parsing is the only thing being exercised."""

    async def _verify(token: str) -> dict:
        return {"uid": f"uid-for-{token}"}

    monkeypatch.setattr(dependencies, "verify_firebase_token", _verify)


@pytest.fixture
def reject_any_token(monkeypatch):
    async def _verify(token: str) -> dict:
        raise ValueError("bad token")

    monkeypatch.setattr(dependencies, "verify_firebase_token", _verify)


class TestGetCurrentUserId:
    async def test_missing_header_is_401_not_422(self):
        """A missing credential is an auth failure, not a malformed request.

        FastAPI's default for a required Header is 422, which tells the caller
        their request was wrong when in fact they simply were not signed in.
        """
        with pytest.raises(HTTPException) as exc:
            await get_current_user_id(authorization=None)
        assert exc.value.status_code == 401

    @pytest.mark.parametrize(
        "header",
        [
            "",
            "Bearer",
            "Bearer ",
            "Bearer    ",
            "Basic abc123",
            "token abc123",
        ],
    )
    async def test_rejects_headers_that_carry_no_bearer_token(self, header):
        with pytest.raises(HTTPException) as exc:
            await get_current_user_id(authorization=header)
        assert exc.value.status_code == 401

    @pytest.mark.parametrize("scheme", ["Bearer", "bearer", "BEARER", "BeArEr"])
    async def test_scheme_is_case_insensitive(self, scheme, accept_any_token):
        """RFC 7235 makes the scheme case-insensitive, and the frontend's
        requireUser already treats it so. Disagreeing would mean a token that
        works against one runtime is rejected by the other."""
        assert await get_current_user_id(f"{scheme} abc123") == "uid-for-abc123"

    async def test_surrounding_whitespace_is_not_part_of_the_token(
        self, accept_any_token
    ):
        assert await get_current_user_id("Bearer  abc123  ") == "uid-for-abc123"

    async def test_rejected_token_is_401_and_does_not_leak_the_reason(
        self, reject_any_token
    ):
        with pytest.raises(HTTPException) as exc:
            await get_current_user_id("Bearer abc123")
        assert exc.value.status_code == 401
        # "expired" vs "forged" vs "revoked" is free information for a prober.
        assert exc.value.detail == "Invalid or expired token"


class TestFirebaseUidToUserId:
    def test_is_deterministic(self):
        assert firebase_uid_to_user_id("abc") == firebase_uid_to_user_id("abc")

    def test_distinct_uids_do_not_collide(self):
        assert firebase_uid_to_user_id("abc") != firebase_uid_to_user_id("abd")
