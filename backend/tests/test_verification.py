"""Confirmación de correo con código, anti-robots (Turnstile) y búsqueda solo para cuentas confirmadas."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models import User
from app.services import captcha as captcha_service
from app.services import email as email_service
from tests.conftest import _make_user, _token

NEW = {"email": "Nueva@Test.com", "password": "clave1234", "full_name": "Laura Gómez"}


@pytest.fixture()
def outbox(monkeypatch):
    """Captura los códigos "enviados" en lugar de mandar correos reales."""
    sent = []
    monkeypatch.setattr(email_service, "send_verification_code",
                        lambda to, name, code, minutes: sent.append({"to": to, "code": code}))
    return sent


def _register(client):
    r = client.post("/api/auth/register", json=NEW)
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user"]


def test_register_sends_code_and_blocks_search_until_verified(client, outbox):
    h, user = _register(client)
    assert user["email_verified"] is False
    assert len(outbox) == 1 and outbox[0]["to"] == "nueva@test.com" and len(outbox[0]["code"]) == 6

    blocked = client.post("/api/search", json={"q": "pizza"}, headers=h)
    assert blocked.status_code == 403 and blocked.headers["X-Error-Code"] == "email_not_verified"

    wrong = "000000" if outbox[0]["code"] != "000000" else "111111"
    bad = client.post("/api/auth/verify-email", json={"code": wrong}, headers=h)
    assert bad.status_code == 400 and "Te quedan 4" in bad.json()["detail"]

    ok = client.post("/api/auth/verify-email", json={"code": outbox[0]["code"]}, headers=h)
    assert ok.status_code == 200 and ok.json()["email_verified"] is True
    assert client.post("/api/search", json={"q": "pizza"}, headers=h).status_code == 200
    assert client.get("/api/auth/me", headers=h).json()["email_verified"] is True


def test_anonymous_gets_only_trial_searches(client):
    """Sin cuenta se puede probar unas pocas veces (detalle en test_guest_search.py)."""
    first = client.post("/api/search", json={"q": "pizza"})
    assert first.status_code == 200 and first.json()["guest_remaining"] == 2


def test_code_is_stored_hashed_and_expires(client, db, outbox):
    h, _ = _register(client)
    user = db.scalar(select(User).where(User.email == "nueva@test.com"))
    assert outbox[0]["code"] not in (user.verification_code_hash or "")   # nunca el código en claro
    user.verification_code_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.flush()
    r = client.post("/api/auth/verify-email", json={"code": outbox[0]["code"]}, headers=h)
    assert r.status_code == 400 and "venció" in r.json()["detail"]


def test_max_attempts_then_resend(client, outbox):
    h, _ = _register(client)
    real = outbox[0]["code"]
    wrong = "000000" if real != "000000" else "111111"
    for _ in range(5):
        client.post("/api/auth/verify-email", json={"code": wrong}, headers=h)
    locked = client.post("/api/auth/verify-email", json={"code": real}, headers=h)
    assert locked.status_code == 400 and "Pide uno nuevo" in locked.json()["detail"]

    assert client.post("/api/auth/resend-code", headers=h).status_code == 202
    assert client.post("/api/auth/resend-code", headers=h).status_code == 429   # máximo 1 por minuto
    new_code = outbox[-1]["code"]
    if new_code != real:   # el código viejo quedó invalidado
        assert client.post("/api/auth/verify-email", json={"code": real}, headers=h).status_code == 400
    assert client.post("/api/auth/verify-email", json={"code": new_code}, headers=h).status_code == 200


def test_stale_unverified_account_can_be_registered_again(client, db, outbox):
    _register(client)
    assert client.post("/api/auth/register", json=NEW).status_code == 409          # recién creada: no
    user = db.scalar(select(User).where(User.email == "nueva@test.com"))
    user.created_at = datetime.now(timezone.utc) - timedelta(hours=2)               # nunca se confirmó
    db.flush()
    again = client.post("/api/auth/register", json={**NEW, "full_name": "Dueña Real"})
    assert again.status_code == 201 and again.json()["user"]["full_name"] == "Dueña Real"
    # Una cuenta confirmada nunca se reemplaza
    _make_user(db, "confirmada@test.com", "user")
    assert client.post("/api/auth/register", json={**NEW, "email": "confirmada@test.com"}).status_code == 409


def test_verify_code_format(client, outbox):
    h, _ = _register(client)
    for bad in ("12345", "abcdef", "1234567"):
        assert client.post("/api/auth/verify-email", json={"code": bad}, headers=h).status_code == 422


def test_unverified_cannot_review_or_claim(client, db):
    _make_user(db, "sinconfirmar@test.com", "user", verified=False)
    h = {"Authorization": f"Bearer {_token(client, 'sinconfirmar@test.com')}"}
    assert client.post("/api/establishments/1/reviews", json={"rating": 5}, headers=h).status_code == 403
    claim = {"message": "Soy el dueño desde hace años y tengo los papeles.", "contact_phone": "3001234567"}
    assert client.post("/api/establishments/1/claims", json=claim, headers=h).status_code == 403
    # Pero sí puede ver su perfil y sus favoritos
    assert client.get("/api/auth/me", headers=h).status_code == 200


# ------------------------------- Anti-robots ----------------------------------------------

@pytest.fixture()
def captcha_on(monkeypatch):
    """Activa Turnstile con una clave falsa y simula la respuesta de Cloudflare (sin red)."""
    monkeypatch.setattr(captcha_service, "get_settings", lambda: SimpleNamespace(turnstile_secret_key="secreta"))
    calls = []

    def fake_post(url, data, timeout):
        calls.append(data)
        return SimpleNamespace(json=lambda: {"success": data["response"] == "token-humano"})

    monkeypatch.setattr(captcha_service.httpx, "post", fake_post)
    return calls


def test_register_and_login_require_captcha(client, db, outbox, captcha_on):
    no_token = client.post("/api/auth/register", json=NEW)
    assert no_token.status_code == 400 and no_token.headers["X-Error-Code"] == "captcha_failed"
    robot = client.post("/api/auth/register", json={**NEW, "captcha_token": "token-robot"})
    assert robot.status_code == 400
    human = client.post("/api/auth/register", json={**NEW, "captcha_token": "token-humano"})
    assert human.status_code == 201
    assert captcha_on[-1]["secret"] == "secreta" and "remoteip" in captcha_on[-1]

    login = {"username": "nueva@test.com", "password": "clave1234"}
    assert client.post("/api/auth/login", data=login).status_code == 400
    assert client.post("/api/auth/login", data={**login, "captcha_token": "token-humano"}).status_code == 200


def test_verification_email_content_and_escaping():
    subject, text, html = email_service.build_verification_email("<b>Hacker</b> Pérez", "482913", 15)
    assert subject.startswith("482913")
    assert "482913" in text and "15 minutos" in text
    assert all(f">{d}</div>" in html for d in "482913")       # un recuadro por número
    assert "<b>Hacker</b>" not in html and "&lt;b&gt;Hacker&lt;/b&gt;" in html   # el nombre no inyecta HTML


def test_captcha_config_exposes_only_public_key(client):
    assert client.get("/api/auth/captcha-config").json() == {"site_key": None}   # desactivado en pruebas
