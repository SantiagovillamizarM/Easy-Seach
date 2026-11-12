"""Registro, inicio de sesión y datos del usuario actual."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import DUMMY_HASH, create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas.user import PasswordChange, Token, UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)) -> Token:
    """Crea una cuenta con rol "user". Nadie puede registrarse como admin u owner."""
    if db.scalar(select(User.id).where(User.email == data.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Ya existe una cuenta con ese correo")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return Token(access_token=create_access_token(user.id, user.role), user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> Token:
    """Inicia sesión. El campo "username" es el correo electrónico.

    Usa el formato estándar OAuth2 (form-data) para que funcione el botón "Authorize" de /docs.
    """
    email = form.username.strip().lower()
    user = db.scalar(select(User).where(User.email == email))

    # Siempre se verifica un hash (real o ficticio) para no revelar si el correo existe.
    password_ok = verify_password(form.password, user.password_hash if user else DUMMY_HASH)
    if not user or not password_ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Correo o contraseña incorrectos")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="La cuenta está desactivada")

    return Token(access_token=create_access_token(user.id, user.role), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    """Actualiza los datos del perfil propio. El correo y el rol no se pueden cambiar aquí."""
    user.full_name = data.full_name
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="La contraseña actual no es correcta")
    if data.current_password == data.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="La nueva contraseña debe ser distinta de la actual")
    user.password_hash = hash_password(data.new_password)
    db.commit()
