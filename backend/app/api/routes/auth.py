"""Registro, inicio de sesión, confirmación de correo, recuperación de contraseña y datos del usuario actual."""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.rate_limit import client_ip, limit_by_ip, limit_by_user, limiter, too_many
from app.core.security import DUMMY_HASH, create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas.user import (
    ForgotPasswordIn,
    PasswordChange,
    ResetPasswordIn,
    Token,
    UserCreate,
    UserOut,
    UserUpdate,
    VerifyEmailIn,
)
from app.services import email as email_service
from app.services.captcha import verify_captcha
from app.services.verification import CODE_TTL_MINUTES, check_code, check_reset_code, issue_code, issue_reset_code

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger("easysearch.auth")
UNVERIFIED_TTL = timedelta(hours=1)


def _require_captcha(token: str | None, request: Request) -> None:
    if not verify_captcha(token, client_ip(request)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="No pudimos comprobar que no eres un robot. Intenta de nuevo.",
                            headers={"X-Error-Code": "captcha_failed"})


def _send_code_safely(email: str, name: str, code: str) -> None:
    """Se ejecuta en segundo plano (no hace esperar al usuario). Si falla, puede pedir otro código."""
    try:
        email_service.send_verification_code(email, name, code, CODE_TTL_MINUTES)
    except email_service.EmailError:
        logger.error("Falló el envío del código de confirmación")


@router.get("/captcha-config")
def captcha_config() -> dict:
    """Clave PÚBLICA del widget anti-robots (la secreta nunca sale del servidor). null = desactivado."""
    s = get_settings()
    return {"site_key": s.turnstile_site_key if s.turnstile_secret_key else None}


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limit_by_ip("register", 5, 60 * 60))])
def register(data: UserCreate, request: Request, background: BackgroundTasks,
             db: Session = Depends(get_db)) -> Token:
    """Crea una cuenta con rol "user" y envía un código de 6 dígitos para confirmar el correo.

    La sesión queda iniciada, pero buscar, usar la IA o publicar exige confirmar el correo primero.
    """
    _require_captcha(data.captcha_token, request)
    existing = db.scalar(select(User).where(User.email == data.email))
    if existing:
        # Una cuenta que nunca se confirmó (p. ej. alguien escribió mal SU correo y quedó el de otra persona)
        # no puede bloquear ese correo para siempre: pasada 1 hora se reemplaza.
        stale = (not existing.email_verified and existing.role == "user"
                 and existing.created_at < datetime.now(timezone.utc) - UNVERIFIED_TTL)
        if not stale:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Ya existe una cuenta con ese correo")
        db.delete(existing)
        db.flush()

    user = User(email=data.email, password_hash=hash_password(data.password), full_name=data.full_name, role="user")
    db.add(user)
    db.flush()
    code = issue_code(user)
    db.commit()
    db.refresh(user)
    background.add_task(_send_code_safely, user.email, user.full_name, code)
    return Token(access_token=create_access_token(user.id, user.role), user=UserOut.model_validate(user))


@router.post("/verify-email", response_model=UserOut,
             dependencies=[Depends(limit_by_user("verify-email", 10, 15 * 60))])
def verify_email(data: VerifyEmailIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    error = check_code(user, data.code)
    db.commit()  # guarda también los intentos fallidos
    if error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=error)
    db.refresh(user)
    return user


@router.post("/resend-code", status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(limit_by_user("resend-code-min", 1, 60)),
                           Depends(limit_by_user("resend-code", 5, 60 * 60))])
def resend_code(background: BackgroundTasks, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)) -> dict:
    """Envía un código nuevo (máximo 1 por minuto y 5 por hora)."""
    if user.email_verified:
        return {"detail": "Tu correo ya está confirmado."}
    code = issue_code(user)
    db.commit()
    background.add_task(_send_code_safely, user.email, user.full_name, code)
    return {"detail": f"Te enviamos un código nuevo a {user.email}."}


LOGIN_FAILS_PER_EMAIL = 5      # fallos permitidos por correo…
LOGIN_FAILS_WINDOW = 15 * 60   # …cada 15 minutos


@router.post("/login", response_model=Token, dependencies=[Depends(limit_by_ip("login", 20, 5 * 60))])
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(),
          captcha_token: str | None = Form(None, max_length=2048), db: Session = Depends(get_db)) -> Token:
    """Inicia sesión. El campo "username" es el correo electrónico.

    Usa el formato estándar OAuth2 (form-data). Si el anti-robots está activo, exige `captcha_token`
    (por eso el botón "Authorize" de /docs solo funciona cuando Turnstile está desactivado).
    Protección contra fuerza bruta: 20 intentos por IP cada 5 min y 5 fallos por correo cada 15 min.
    """
    _require_captcha(captcha_token, request)
    email = form.username.strip().lower()
    fails_key = f"login-fails:{email}"
    retry = limiter.retry_after(fails_key, LOGIN_FAILS_PER_EMAIL, LOGIN_FAILS_WINDOW)
    if retry:
        # Mismo mensaje exista o no la cuenta: no revela qué correos están registrados
        raise too_many(retry, f"Demasiados intentos fallidos. Por seguridad, espera {max(1, -(-retry // 60))} "
                              "minutos antes de volver a intentarlo.")
    user = db.scalar(select(User).where(User.email == email))

    # Siempre se verifica un hash (real o ficticio) para no revelar si el correo existe.
    password_ok = verify_password(form.password, user.password_hash if user else DUMMY_HASH)
    if not user or not password_ok:
        limiter.record(fails_key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Correo o contraseña incorrectos")
    limiter.clear(fails_key)
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="La cuenta está desactivada")

    return Token(access_token=create_access_token(user.id, user.role), user=UserOut.model_validate(user))


# ------------------------------- Recuperar la contraseña ---------------------------------

FORGOT_SENT = ("Si existe una cuenta con ese correo, te enviamos un código para crear una contraseña nueva. "
               "Revisa también la carpeta de spam.")
RESET_FAILED = "El código no es correcto o ya venció. Revísalo o pide uno nuevo."


def _send_reset_safely(email: str, name: str, code: str) -> None:
    try:
        email_service.send_reset_code(email, name, code, CODE_TTL_MINUTES)
    except email_service.EmailError:
        logger.error("Falló el envío del código de recuperación")


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(limit_by_ip("forgot-password", 10, 60 * 60))])
def forgot_password(data: ForgotPasswordIn, request: Request, background: BackgroundTasks,
                    db: Session = Depends(get_db)) -> dict:
    """Envía un código de 6 dígitos para crear una contraseña nueva.

    Responde lo mismo exista o no la cuenta (no revela qué correos están registrados). Por correo: máximo
    1 código por minuto y 5 por hora, para que nadie llene de mensajes la bandeja de otra persona.
    """
    _require_captcha(data.captcha_token, request)
    user = db.scalar(select(User).where(User.email == data.email))
    if user is None or not user.is_active:
        return {"detail": FORGOT_SENT}
    if limiter.hit(f"forgot-min:{data.email}", 1, 60) or limiter.hit(f"forgot-hour:{data.email}", 5, 60 * 60):
        return {"detail": FORGOT_SENT}   # sin correo nuevo, pero el mismo mensaje
    code = issue_reset_code(user)
    db.commit()
    background.add_task(_send_reset_safely, user.email, user.full_name, code)
    return {"detail": FORGOT_SENT}


@router.post("/reset-password", response_model=Token,
             dependencies=[Depends(limit_by_ip("reset-password", 20, 15 * 60))])
def reset_password(data: ResetPasswordIn, db: Session = Depends(get_db)) -> Token:
    """Cambia la contraseña con el código del correo e inicia la sesión.

    El código sirve una sola vez y máximo 5 intentos. Cierra las sesiones abiertas en otros dispositivos.
    """
    user = db.scalar(select(User).where(User.email == data.email))
    if user is None or not user.is_active:
        verify_password(data.new_password, DUMMY_HASH)   # mismo tiempo de respuesta exista o no la cuenta
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=RESET_FAILED)
    ok = check_reset_code(user, data.code)
    if not ok:
        db.commit()   # guarda el intento fallido
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=RESET_FAILED)
    user.password_hash = hash_password(data.new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    limiter.clear(f"login-fails:{user.email}")   # quien recuperó su cuenta puede entrar de inmediato
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


@router.post("/change-password", response_model=Token,
             dependencies=[Depends(limit_by_user("change-password", 5, 15 * 60))])
def change_password(data: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cambia la contraseña y cierra las demás sesiones abiertas (otros dispositivos o un token robado).

    Devuelve un token nuevo para que este dispositivo siga conectado.
    """
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="La contraseña actual no es correcta")
    if data.current_password == data.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="La nueva contraseña debe ser distinta de la actual")
    user.password_hash = hash_password(data.new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return Token(access_token=create_access_token(user.id, user.role), user=UserOut.model_validate(user))
