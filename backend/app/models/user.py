"""Usuarios y roles."""
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String
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
