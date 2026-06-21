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

# Stub required API keys so Settings validation passes in tests
os.environ.setdefault("STRAVA_CLIENT_ID", "test-strava-id")
os.environ.setdefault("STRAVA_CLIENT_SECRET", "test-strava-secret")
os.environ.setdefault("STRAVA_REDIRECT_URI", "http://localhost:8000/auth/strava/callback")
os.environ.setdefault("MAPBOX_ACCESS_TOKEN", "test-mapbox-token")
os.environ.setdefault("OPENWEATHER_API_KEY", "test-weather-key")

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture(scope="module")
def client():
    """Create a TestClient for the FastAPI app backed by the Firebase emulator."""
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

