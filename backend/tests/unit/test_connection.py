"""Unit tests for Firebase connection bootstrap logic."""

import json

import pytest

from src.infrastructure.database import connection


@pytest.fixture(autouse=True)
def reset_firebase_app_state() -> None:
    """Ensure each test starts with a fresh singleton state."""
    connection._app = None
    yield
    connection._app = None


@pytest.mark.unit
def test_initialize_firebase_uses_json_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    """When JSON credentials are provided, Certificate should be constructed from dict."""
    creds = {"type": "service_account", "project_id": "fit-ready-iq-test"}
    fake_settings = type(
        "FakeSettings",
        (),
        {
            "firebase_use_emulator": False,
            "firebase_emulator_host": "localhost",
            "firebase_firestore_emulator_port": 8080,
            "firebase_auth_emulator_port": 9099,
            "firebase_storage_emulator_port": 9199,
            "firebase_service_account_key_json": json.dumps(creds),
            "firebase_service_account_key_path": None,
            "firebase_project_id": "fit-ready-iq-test",
            "firebase_storage_bucket": None,
        },
    )()

    calls: dict[str, object] = {}

    monkeypatch.setattr(connection, "get_settings", lambda: fake_settings)
    monkeypatch.setattr(connection.credentials, "Certificate", lambda payload: ("cert", payload))
    monkeypatch.setattr(
        connection.firebase_admin,
        "initialize_app",
        lambda cred, options: calls.update({"cred": cred, "options": options}) or object(),
    )

    app = connection.initialize_firebase()

    assert app is not None
    assert calls["cred"] == ("cert", creds)
    assert calls["options"] == {"projectId": "fit-ready-iq-test"}


@pytest.mark.unit
def test_initialize_firebase_uses_application_default_when_no_explicit_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When no explicit credential source exists, ApplicationDefault should be used."""
    fake_settings = type(
        "FakeSettings",
        (),
        {
            "firebase_use_emulator": True,
            "firebase_emulator_host": "localhost",
            "firebase_firestore_emulator_port": 8080,
            "firebase_auth_emulator_port": 9099,
            "firebase_storage_emulator_port": 9199,
            "firebase_service_account_key_json": None,
            "firebase_service_account_key_path": None,
            "firebase_project_id": "fit-ready-iq-test",
            "firebase_storage_bucket": "fit-ready-iq-test.appspot.com",
        },
    )()

    monkeypatch.setattr(connection, "get_settings", lambda: fake_settings)
    monkeypatch.setattr(connection.credentials, "ApplicationDefault", lambda: "app-default")
    monkeypatch.setattr(connection.firebase_admin, "initialize_app", lambda cred, options: {"cred": cred, "options": options})

    app = connection.initialize_firebase()

    assert app["cred"] == "app-default"
    assert app["options"] == {
        "projectId": "fit-ready-iq-test",
        "storageBucket": "fit-ready-iq-test.appspot.com",
    }
