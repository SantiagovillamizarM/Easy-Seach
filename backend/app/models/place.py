"""Lugares geográficos: municipios y barrios, con coordenadas reales (OpenStreetMap).

Se usan para resolver ubicaciones escritas por el usuario ("en Piedecuesta", "en Cabecera")
sin depender de una API externa de geocodificación.
"""
from sqlalchemy import BigInteger, CheckConstraint, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

PLACE_KINDS = ("municipio", "barrio")


class Place(TimestampMixin, Base):
    __tablename__ = "places"
    __table_args__ = (
        CheckConstraint(f"kind IN {PLACE_KINDS}", name="kind_valid"),
        UniqueConstraint("osm_type", "osm_id", name="uq_places_osm"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    # Nombre en minúsculas y sin tildes, para comparar lo que escribe el usuario
    normalized_name: Mapped[str] = mapped_column(String(200), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    # Barrio -> municipio al que pertenece
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    department: Mapped[str | None] = mapped_column(String(100))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    osm_type: Mapped[str | None] = mapped_column(String(10))
    osm_id: Mapped[int | None] = mapped_column(BigInteger)
