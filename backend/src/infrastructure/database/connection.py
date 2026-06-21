"""Firebase Admin SDK initialization and Firestore/Auth/Storage client access."""

import json
import os
from typing import Optional

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


def get_storage_bucket():
    """Return the Firebase Storage bucket. Requires initialize_firebase() first."""
    return storage.bucket()


async def verify_firebase_token(id_token: str) -> dict:
    """
    Verify a Firebase ID token and return the decoded claims.

    Raises firebase_admin.auth.InvalidIdTokenError on failure.
    """
    decoded = auth.verify_id_token(id_token)
    return decoded
