"""Analítica propia y anónima: cada página que se abre en la web.

No se guarda la IP, ni el navegador completo, ni cookies. El visitante se identifica con un código que cambia
cada día (huella de IP + navegador + fecha + clave del servidor), así que sirve para contar visitantes únicos
de un día, pero no para seguir a nadie entre días.
"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

DEVICES = ("mobile", "tablet", "desktop")


class PageView(Base):
    __tablename__ = "page_views"
    __table_args__ = (
        CheckConstraint(f"device IN {DEVICES}", name="device_valid"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    # Sección de la web (inicio, buscar, lugar, asistente…) y ruta sin parámetros
    section: Mapped[str] = mapped_column(String(30))
    path: Mapped[str] = mapped_column(String(200))
    # Página de un negocio: sirve para saber qué negocios atraen más visitas
    establishment_id: Mapped[int | None] = mapped_column(ForeignKey("establishments.id", ondelete="SET NULL"),
                                                         index=True)
    visitor_hash: Mapped[str] = mapped_column(String(32))
    device: Mapped[str] = mapped_column(String(10))
    referrer: Mapped[str | None] = mapped_column(String(100))   # solo el dominio de donde llegó
    is_logged_in: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
