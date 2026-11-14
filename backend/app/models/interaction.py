"""Interacción de los usuarios: favoritos, historial, reseñas, reportes y solicitudes de propiedad."""
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

REVIEW_STATUSES = ("pending", "approved", "rejected")
REPORT_TYPES = ("incorrect_info", "duplicate", "closed", "inappropriate_review", "other")
REPORT_STATUSES = ("open", "resolved", "dismissed")
CLAIM_STATUSES = ("pending", "approved", "rejected")


class Favorite(Base):
    __tablename__ = "favorites"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    establishment_id: Mapped[int] = mapped_column(
        ForeignKey("establishments.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SearchHistory(Base):
    """Búsquedas realizadas.

    Privacidad: NO se guardan las coordenadas del usuario, solo el texto, la interpretación
    y el nombre del lugar de búsqueda. user_id es NULL para búsquedas anónimas.
    """

    __tablename__ = "search_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    query_text: Mapped[str] = mapped_column(String(500))
    parsed_query: Mapped[dict | None] = mapped_column(JSONB)
    location_label: Mapped[str | None] = mapped_column(String(200))
    results_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Ocultar del historial del usuario sin perder el dato para estadísticas
    hidden_by_user: Mapped[bool] = mapped_column(default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Review(TimestampMixin, Base):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),
        CheckConstraint(f"status IN {REVIEW_STATUSES}", name="status_valid"),
        # Una reseña por usuario y establecimiento
        UniqueConstraint("user_id", "establishment_id", name="uq_reviews_user_establishment"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    establishment_id: Mapped[int] = mapped_column(ForeignKey("establishments.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    rating: Mapped[int] = mapped_column(SmallInteger)
    comment: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    moderation_reason: Mapped[str | None] = mapped_column(String(300))
    # Respuesta pública del propietario del establecimiento (una por reseña; se puede editar o borrar)
    owner_reply: Mapped[str | None] = mapped_column(Text)
    owner_reply_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Report(TimestampMixin, Base):
    """Reporte de información incorrecta, duplicada o contenido inapropiado."""

    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint(f"report_type IN {REPORT_TYPES}", name="type_valid"),
        CheckConstraint(f"status IN {REPORT_STATUSES}", name="status_valid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    establishment_id: Mapped[int | None] = mapped_column(ForeignKey("establishments.id", ondelete="CASCADE"))
    review_id: Mapped[int | None] = mapped_column(ForeignKey("reviews.id", ondelete="CASCADE"))
    report_type: Mapped[str] = mapped_column(String(30))
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open")
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class OwnershipClaim(TimestampMixin, Base):
    """Solicitud de un usuario para administrar/verificar un establecimiento."""

    __tablename__ = "ownership_claims"
    __table_args__ = (
        CheckConstraint(f"status IN {CLAIM_STATUSES}", name="status_valid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    establishment_id: Mapped[int] = mapped_column(ForeignKey("establishments.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    message: Mapped[str | None] = mapped_column(Text)
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(String(300))
