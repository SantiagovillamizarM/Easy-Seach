"""Usuarios y roles."""
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

# Roles del sistema:
#   user  -> busca, guarda favoritos, escribe reseñas
#   owner -> además administra los establecimientos que le fueron asignados
#   admin -> administra toda la plataforma
ROLES = ("user", "owner", "admin")


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(f"role IN {ROLES}", name="role_valid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(10), default="user", server_default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Los tokens emitidos antes de esta fecha dejan de ser válidos (cierra las demás sesiones al cambiar la clave)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Confirmación del correo con un código de 6 dígitos. Se guarda solo el hash del código (nunca el código).
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_code_hash: Mapped[str | None] = mapped_column(String(64))
    verification_code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Recuperar la contraseña con un código de 6 dígitos (también solo el hash). Separado de la confirmación
    # del correo para que pedir uno no anule el otro.
    reset_code_hash: Mapped[str | None] = mapped_column(String(64))
    reset_code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reset_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Avisos por correo (se apagan desde "Mi perfil" o con el enlace "dejar de recibir" de cada aviso)
    notify_new_reviews: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")     # dueños
    notify_review_replies: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")  # clientes

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None
