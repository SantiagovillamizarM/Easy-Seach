"""Fase 1: registro, inicio de sesión, protección de rutas y roles."""
from sqlalchemy import select

from app.models import User

NEW_USER = {"email": "  Ana@Correo.com ", "password": "segura123", "full_name": "Ana Pérez"}


def test_register_creates_user_with_role_user(client, db):
    r = client.post("/api/auth/register", json=NEW_USER)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["access_token"]
    assert body["user"]["email"] == "ana@correo.com"  # normalizado
    assert body["user"]["role"] == "user"

    user = db.scalar(select(User).where(User.email == "ana@correo.com"))
    assert user.password_hash != "segura123"           # nunca en texto plano
    assert user.password_hash.startswith("$argon2")    # hash Argon2


def test_register_cannot_choose_role(client):
    r = client.post("/api/auth/register", json={**NEW_USER, "role": "admin"})
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "user"


def test_register_duplicate_email(client):
    assert client.post("/api/auth/register", json=NEW_USER).status_code == 201
    r = client.post("/api/auth/register", json={**NEW_USER, "email": "ANA@correo.com"})
    assert r.status_code == 409


def test_register_validation(client):
    assert client.post("/api/auth/register", json={**NEW_USER, "email": "no-es-correo"}).status_code == 422
    assert client.post("/api/auth/register", json={**NEW_USER, "password": "corta1"}).status_code == 422
    assert client.post("/api/auth/register", json={**NEW_USER, "password": "sololetras"}).status_code == 422


def test_login_and_me(client):
    client.post("/api/auth/register", json=NEW_USER)
    r = client.post("/api/auth/login", data={"username": "ana@correo.com", "password": "segura123"})
    assert r.status_code == 200
    token = r.json()["access_token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["full_name"] == "Ana Pérez"


def test_login_wrong_password_same_message_as_unknown_email(client):
    client.post("/api/auth/register", json=NEW_USER)
    wrong_pass = client.post("/api/auth/login", data={"username": "ana@correo.com", "password": "otra1234"})
    unknown = client.post("/api/auth/login", data={"username": "nadie@correo.com", "password": "otra1234"})
    assert wrong_pass.status_code == unknown.status_code == 401
    assert wrong_pass.json() == unknown.json()  # no revela si el correo existe


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401
    bad = client.get("/api/auth/me", headers={"Authorization": "Bearer token-falso"})
    assert bad.status_code == 401


def test_admin_route_rejects_normal_user(client, user_headers):
    assert client.get("/api/admin/users", headers=user_headers).status_code == 403


def test_admin_route_rejects_anonymous(client):
    assert client.get("/api/admin/users").status_code == 401


def test_admin_route_allows_admin(client, admin_headers):
    r = client.get("/api/admin/users", headers=admin_headers)
    assert r.status_code == 200
    assert any(u["email"] == "admin@test.com" for u in r.json())
    assert "password_hash" not in r.json()[0]  # nunca se expone el hash
