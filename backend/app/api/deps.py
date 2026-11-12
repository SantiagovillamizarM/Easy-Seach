"""Dependencias reutilizables de la API: usuario actual y control de roles."""
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="No autenticado o sesión expirada",
    headers={"WWW-Authenticate": "Bearer"},
)


def _user_from_token(token: str, db: Session) -> User:
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _credentials_error
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _credentials_error
    return user


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Exige un usuario autenticado."""
    return _user_from_token(token, db)


def get_optional_user(
    token: str | None = Depends(oauth2_scheme_optional), db: Session = Depends(get_db)
) -> User | None:
    """Devuelve el usuario si envió token válido; None si es anónimo (ej. búsquedas)."""
    if not token:
        return None
    return _user_from_token(token, db)


def require_roles(*roles: str) -> Callable[..., User]:
    """Crea una dependencia que solo deja pasar a usuarios con alguno de los roles indicados.

    Uso: `user: User = Depends(require_roles("admin"))`
    """

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para esta acción")
        return user

    return checker
