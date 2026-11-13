"""Fase 8: límite de intentos, cierre de sesiones, cabeceras, tamaño máximo y configuración de producción."""
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.core.rate_limit import RateLimiter
from app.main import unexpected_error
from tests.conftest import _make_user

LOGIN = "/api/auth/login"


def _login(client, email, password):
    return client.post(LOGIN, data={"username": email, "password": password})


# ------------------------------- Límite de intentos ---------------------------------------

def test_rate_limiter_window():
    rl = RateLimiter()
    assert rl.hit("k", 2, 60) is None
    assert rl.hit("k", 2, 60) is None
    retry = rl.hit("k", 2, 60)
    assert retry is not None and 1 <= retry <= 60   # tercer intento bloqueado, con tiempo de espera
    assert rl.hit("otra", 2, 60) is None             # otra clave no se ve afectada
    rl.clear("k")
    assert rl.hit("k", 2, 60) is None


def test_login_locks_email_after_failures(client, db):
    _make_user(db, "victima@test.com", "user")
    for _ in range(5):
        assert _login(client, "victima@test.com", "mala1234").status_code == 401
    blocked = _login(client, "victima@test.com", "clave1234")   # ni siquiera con la clave correcta
    assert blocked.status_code == 429 and int(blocked.headers["Retry-After"]) > 0
    assert "intentos fallidos" in blocked.json()["detail"]
    # Un correo inexistente recibe el mismo trato (no revela qué cuentas existen)
    for _ in range(5):
        _login(client, "noexiste@test.com", "mala1234")
    assert _login(client, "noexiste@test.com", "mala1234").status_code == 429
    # Otras cuentas siguen funcionando
    _make_user(db, "otra@test.com", "user")
    assert _login(client, "otra@test.com", "clave1234").status_code == 200


def test_successful_login_resets_failures(client, db):
    _make_user(db, "olvidadiza@test.com", "user")
    for _ in range(4):
        _login(client, "olvidadiza@test.com", "mala1234")
    assert _login(client, "olvidadiza@test.com", "clave1234").status_code == 200
    for _ in range(4):   # el contador volvió a cero
        assert _login(client, "olvidadiza@test.com", "mala1234").status_code == 401


def test_login_limit_per_ip(client):
    codes = [_login(client, f"u{i}@test.com", "mala1234").status_code for i in range(21)]
    assert codes[:20] == [401] * 20 and codes[20] == 429


def test_register_limit_per_ip(client):
    def register(i):
        return client.post("/api/auth/register",
                           json={"email": f"nuevo{i}@test.com", "password": "clave1234", "full_name": "Nuevo"})
    assert all(register(i).status_code == 201 for i in range(5))
    assert register(5).status_code == 429


# ------------------------------- Sesiones -------------------------------------------------

def test_password_change_closes_other_sessions(client, db):
    user = _make_user(db, "segura@test.com", "user")
    settings = get_settings()
    # Token emitido "hace 1 minuto" (p. ej. el de otro dispositivo o uno robado)
    old = jwt.encode({"sub": str(user.id), "role": "user", "iat": datetime.now(timezone.utc) - timedelta(minutes=1),
                      "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                     settings.secret_key, algorithm=settings.jwt_algorithm)
    old_h = {"Authorization": f"Bearer {old}"}
    assert client.get("/api/auth/me", headers=old_h).status_code == 200

    r = client.post("/api/auth/change-password", headers=old_h,
                    json={"current_password": "clave1234", "new_password": "nueva5678"})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=old_h).status_code == 401           # sesión vieja cerrada
    new_h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=new_h).status_code == 200           # este dispositivo sigue


def test_token_without_iat_is_rejected(client, db):
    user = _make_user(db, "sin-iat@test.com", "user")
    s = get_settings()
    token = jwt.encode({"sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                       s.secret_key, algorithm=s.jwt_algorithm)
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


# ------------------------------- Cabeceras y tamaño ---------------------------------------

def test_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]
    assert "geolocation=(self)" in r.headers["Permissions-Policy"]
    assert "Content-Security-Policy" not in client.get("/docs").headers   # Swagger necesita sus scripts


def test_body_too_large(client):
    r = client.post("/api/search", content=b"x" * 10, headers={"Content-Length": str(7 * 1024 * 1024),
                                                                  "Content-Type": "application/json"})
    assert r.status_code == 413


def test_unexpected_errors_hide_details():
    mini = FastAPI()
    mini.add_exception_handler(Exception, unexpected_error)

    @mini.get("/boom")
    def boom():
        raise RuntimeError("password=secreta en /ruta/interna.py")

    r = TestClient(mini, raise_server_exceptions=False).get("/boom")
    assert r.status_code == 500
    assert "secreta" not in r.text and "interna" not in r.text


# ------------------------------- Configuración de producción ------------------------------

BASE = {"database_url": "postgresql+psycopg://u:p@127.0.0.1/db", "_env_file": None}


def test_production_rejects_weak_config():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(**BASE, app_env="production", secret_key="cambia_esta_clave_secreta",
                 cors_origins="https://easysearch.co")
    with pytest.raises(ValidationError, match="https"):
        Settings(**BASE, app_env="production", secret_key="x" * 48, cors_origins="http://easysearch.co")
    with pytest.raises(ValidationError, match="'\\*'"):
        Settings(**BASE, app_env="production", secret_key="x" * 48, cors_origins="*")


def test_production_accepts_good_config_and_dev_is_relaxed():
    ok = Settings(**BASE, app_env="production", secret_key="k" * 48, cors_origins="https://easysearch.co")
    assert ok.is_production
    assert Settings(**BASE, app_env="development", secret_key="corta").app_env == "development"
