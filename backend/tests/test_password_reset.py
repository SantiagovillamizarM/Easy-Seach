"""Recuperar la contraseña con un código de 6 dígitos enviado al correo."""
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core.config import get_settings
from app.models import User
from app.services import email as email_service
from app.services.email_templates import build_reset_email
from tests.conftest import _make_user

EMAIL = "olvido@test.com"


@pytest.fixture()
def outbox(monkeypatch):
    """Captura los códigos "enviados" en lugar de mandar correos reales."""
    sent = []
    monkeypatch.setattr(email_service, "send_reset_code",
                        lambda to, name, code, minutes: sent.append({"to": to, "code": code}))
    return sent


@pytest.fixture()
def account(db):
    return _make_user(db, EMAIL, "user")


def _forgot(client, email=EMAIL):
    return client.post("/api/auth/forgot-password", json={"email": email})


def _reset(client, code, password="nueva5678", email=EMAIL):
    return client.post("/api/auth/reset-password", json={"email": email, "code": code, "new_password": password})


def _wrong(code):
    return "000000" if code != "000000" else "111111"


def _old_session(user):
    """Un token emitido hace un minuto (en otro dispositivo)."""
    settings = get_settings()
    return jwt.encode({"sub": str(user.id), "role": "user", "iat": datetime.now(timezone.utc) - timedelta(minutes=1),
                       "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                      settings.secret_key, algorithm=settings.jwt_algorithm)


def test_reset_password_with_code_logs_in_and_closes_other_sessions(client, account, outbox):
    old_token = _old_session(account)
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 200
    r = _forgot(client, "  Olvido@Test.com ")
    assert r.status_code == 202
    assert len(outbox) == 1 and outbox[0]["to"] == EMAIL and len(outbox[0]["code"]) == 6

    r = _reset(client, outbox[0]["code"])
    assert r.status_code == 200 and r.json()["user"]["email"] == EMAIL
    new = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=new).status_code == 200
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 401

    assert client.post("/api/auth/login", data={"username": EMAIL, "password": "clave1234"}).status_code == 401
    assert client.post("/api/auth/login", data={"username": EMAIL, "password": "nueva5678"}).status_code == 200
    # El código sirve una sola vez
    assert _reset(client, outbox[0]["code"], "otra9999").status_code == 400


def test_unknown_email_gets_same_answer_and_no_mail(client, account, outbox):
    known, unknown = _forgot(client), _forgot(client, "nadie@test.com")
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert [m["to"] for m in outbox] == [EMAIL]
    # Restablecer con un correo inexistente: el mismo error que un código incorrecto
    assert _reset(client, "123456", email="nadie@test.com").json() == _reset(client, _wrong(outbox[0]["code"])).json()


def test_five_wrong_codes_burn_the_code(client, account, outbox):
    _forgot(client)
    code = outbox[0]["code"]
    for _ in range(5):
        assert _reset(client, _wrong(code)).status_code == 400
    assert _reset(client, code).status_code == 400          # ya no sirve, ni siquiera el correcto


def test_expired_code_fails(client, db, account, outbox):
    _forgot(client)
    account.reset_code_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.flush()
    assert _reset(client, outbox[0]["code"]).status_code == 400


def test_mail_flood_is_limited_per_email(client, account, outbox):
    for _ in range(3):
        assert _forgot(client).status_code == 202
    assert len(outbox) == 1                                  # máximo 1 código por minuto


def test_weak_new_password_is_rejected(client, account, outbox):
    _forgot(client)
    assert _reset(client, outbox[0]["code"], "solotexto").status_code == 422


def test_verification_code_cannot_reset_password(client, db, outbox):
    """Los códigos de confirmar correo y de recuperar contraseña no se mezclan."""
    from app.services.verification import issue_code
    user = _make_user(db, "mezcla@test.com", "user", verified=False)
    verify_code = issue_code(user)
    db.flush()
    assert _reset(client, verify_code, email="mezcla@test.com").status_code == 400


def test_reset_confirms_unverified_email(client, db, outbox):
    """Quien recibió el código en su correo demostró que es suyo."""
    user = _make_user(db, "sinconfirmar@test.com", "user", verified=False)
    _forgot(client, "sinconfirmar@test.com")
    assert _reset(client, outbox[0]["code"], email="sinconfirmar@test.com").json()["user"]["email_verified"] is True
    assert db.get(User, user.id).email_verified_at is not None


def test_reset_email_content_and_escaping():
    subject, text, html = build_reset_email("<b>Ana</b> Pérez", "654321", 15)
    assert "654321" in subject and "654321" in text
    assert "&lt;b&gt;Ana&lt;/b&gt;" in html and "<b>Ana</b>" not in html
    assert "Recupera tu contraseña" in html
