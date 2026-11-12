"""Configuración de pruebas.

Las pruebas usan una base de datos SEPARADA ("<nombre>_test") que se crea y se migra automáticamente,
para no tocar los datos de desarrollo. Cada prueba se ejecuta dentro de una transacción que se
deshace al final, así las pruebas no dependen unas de otras.
"""
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import ROOT_DIR, get_settings
from app.core.security import hash_password
from app.db.session import get_db
from app.main import app
from app.models import User

BACKEND_DIR = ROOT_DIR / "backend"


def _test_database_url() -> str:
    url = make_url(get_settings().database_url)
    return url.set(database=f"{url.database}_test").render_as_string(hide_password=False)


@pytest.fixture(scope="session")
def engine():
    test_url = _test_database_url()
    db_name = make_url(test_url).database

    # Crear la base de datos de pruebas si no existe (conectándose a la base "postgres")
    admin_url = make_url(test_url).set(database="postgres")
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": db_name})
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    admin_engine.dispose()

    # Aplicar todas las migraciones (mismo esquema que desarrollo)
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", test_url.replace("%", "%%"))
    command.upgrade(cfg, "head")

    eng = create_engine(test_url)
    yield eng
    eng.dispose()


@pytest.fixture()
def db(engine):
    """Sesión dentro de una transacción que se deshace al terminar la prueba."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _make_user(db, email: str, role: str, password: str = "clave1234") -> User:
    user = User(email=email, password_hash=hash_password(password), full_name=f"Prueba {role}", role=role)
    db.add(user)
    db.flush()
    return user


def _token(client, email: str, password: str = "clave1234") -> str:
    r = client.post("/api/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture()
def user_headers(client, db):
    _make_user(db, "usuario@test.com", "user")
    return {"Authorization": f"Bearer {_token(client, 'usuario@test.com')}"}


@pytest.fixture()
def admin_headers(client, db):
    _make_user(db, "admin@test.com", "admin")
    return {"Authorization": f"Bearer {_token(client, 'admin@test.com')}"}
