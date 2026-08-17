"""Pytest configuration and fixtures."""

import os

# Point the backend at the Firebase emulator before any app imports.
# These must be set before firebase_admin is imported.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("FIREBASE_PROJECT_ID", "fit-ready-iq-test")
os.environ.setdefault("FIREBASE_USE_EMULATOR", "true")
os.environ.setdefault("FIREBASE_EMULATOR_HOST", "localhost")
os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "localhost:8080")
os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")
os.environ.setdefault("FIREBASE_STORAGE_EMULATOR_HOST", "localhost:9199")

# No API-key stubs needed any more: the five required-but-unused settings they
# existed to satisfy have been removed. `firebase_project_id` above is now the
# only setting without a default, and it is one the app actually reads.

# Pin CORS rather than inheriting it from the developer's .env.
#
# `Settings` reads `src/backend/.env`, so without this the suite asserts against
# whatever origins the machine running it happens to have configured — a test
# that passes on CI and fails locally, or the reverse, for reasons that have
# nothing to do with the code. Environment variables outrank the dotenv file in
# pydantic-settings, so setting it here wins. JSON, not comma-separated: it is a
# `list[str]`, and complex types are JSON-decoded before any validator runs.
os.environ.setdefault(
    "CORS_ORIGINS", '["http://localhost:3000", "http://localhost:3001"]'
)

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture(scope="module")
def client():
    """Create a TestClient for the FastAPI app backed by the Firebase emulator."""
    with TestClient(app) as c:
        yield c
