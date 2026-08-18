"""Firebase Admin SDK initialization and Firestore/Auth/Storage client access."""

import asyncio
import json
import os
from typing import Any, Optional

import firebase_admin
from firebase_admin import auth, credentials, firestore_async, storage

from ...config.settings import get_settings

_app: Optional[firebase_admin.App] = None


def initialize_firebase() -> firebase_admin.App:
    """
    Initialize Firebase Admin SDK.

    Credentials are resolved in this order:
    1. FIREBASE_SERVICE_ACCOUNT_KEY_JSON env var (JSON string – ideal for production)
    2. FIREBASE_SERVICE_ACCOUNT_KEY_PATH env var (path to JSON file – local dev)
    3. Application Default Credentials (Google Cloud / CI environments)
    """
    global _app
    if _app is not None:
        return _app

    settings = get_settings()

    # Configure emulators before initializing the app
    if settings.firebase_use_emulator:
        os.environ.setdefault(
            "FIRESTORE_EMULATOR_HOST",
            f"{settings.firebase_emulator_host}:{settings.firebase_firestore_emulator_port}",
        )
        os.environ.setdefault(
            "FIREBASE_AUTH_EMULATOR_HOST",
            f"{settings.firebase_emulator_host}:{settings.firebase_auth_emulator_port}",
        )
        os.environ.setdefault(
            "FIREBASE_STORAGE_EMULATOR_HOST",
            f"{settings.firebase_emulator_host}:{settings.firebase_storage_emulator_port}",
        )

    # Resolve credentials
    cred: credentials.Base
    if settings.firebase_service_account_key_json:
        key_dict = json.loads(settings.firebase_service_account_key_json)
        cred = credentials.Certificate(key_dict)
    elif settings.firebase_service_account_key_path:
        cred = credentials.Certificate(settings.firebase_service_account_key_path)
    else:
        cred = credentials.ApplicationDefault()

    options: dict = {"projectId": settings.firebase_project_id}
    if settings.firebase_storage_bucket:
        options["storageBucket"] = settings.firebase_storage_bucket

    _app = firebase_admin.initialize_app(cred, options)
    return _app


def get_firestore() -> firestore_async.AsyncClient:
    """Return the async Firestore client. Requires initialize_firebase() first."""
    return firestore_async.client()


def get_auth() -> auth.Client:
    """Return the Firebase Auth client. Requires initialize_firebase() first."""
    return auth.Client(_app)


def get_storage_bucket() -> Any:
    """Return the Firebase Storage bucket. Requires initialize_firebase() first."""
    return storage.bucket()


async def verify_firebase_token(id_token: str) -> dict:
    """
    Verify a Firebase ID token and return the decoded claims.

    Raises firebase_admin.auth.InvalidIdTokenError on failure.

    `auth.verify_id_token` is synchronous and does network I/O — it fetches and
    refreshes Google's signing keys, and with `check_revoked` it also looks the
    user up. Awaiting it directly from a coroutine blocked the event loop for the
    duration, so one slow key refresh stalled every other in-flight request on
    the worker. `to_thread` keeps the loop free.

    `check_revoked=True` so signing out, or an admin disabling a compromised
    account, takes effect immediately rather than whenever the hour-long ID
    token happens to expire. It matches the frontend's `requireUser`.
    """
    decoded: dict[Any, Any] = await asyncio.to_thread(
        auth.verify_id_token, id_token, check_revoked=True
    )
    return decoded
