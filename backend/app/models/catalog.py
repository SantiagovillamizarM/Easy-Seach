"""Catálogo: categorías, establecimientos, productos/servicios, fotos, horarios y embeddings."""
from datetime import date, datetime, time
from decimal import Decimal

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Table,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.place import Place  # noqa: F401  (usado en la relación "municipality")

EMBEDDING_DIM = 384  # dimensiones del modelo multilingual-e5-small

ESTABLISHMENT_STATUSES = ("active", "hidden", "duplicate")
ESTABLISHMENT_SOURCES = ("osm", "manual", "owner")
OFFERING_KINDS = ("product", "service")
EMBEDDING_ENTITIES = ("establishment", "offering")


# Relación muchos a muchos: un establecimiento puede tener varias categorías
establishment_categories = Table(
    "establishment_categories",
    Base.metadata,
    Column("establishment_id", ForeignKey("establishments.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


class Category(TimestampMixin, Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))


class Establishment(TimestampMixin, Base):
    __tablename__ = "establishments"
    __table_args__ = (
        CheckConstraint(f"status IN {ESTABLISHMENT_STATUSES}", name="status_valid"),
        CheckConstraint(f"source IN {ESTABLISHMENT_SOURCES}", name="source_valid"),
        CheckConstraint("price_level IS NULL OR price_level BETWEEN 1 AND 4", name="price_level_range"),
        CheckConstraint("price_min IS NULL OR price_max IS NULL OR price_min <= price_max", name="price_range"),
        UniqueConstraint("osm_type", "osm_id", name="uq_establishments_osm"),
        # Índice para el prefiltro geográfico (rectángulo de coordenadas)
        Index("ix_establishments_lat_lng", "latitude", "longitude"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(220), unique=True)
    description: Mapped[str | None] = mapped_column(Text)

    # Ubicación
    address: Mapped[str | None] = mapped_column(String(300))
    neighborhood: Mapped[str | None] = mapped_column(String(200))
    municipality_id: Mapped[int | None] = mapped_column(ForeignKey("places.id", ondelete="SET NULL"), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    timezone: Mapped[str] = mapped_column(String(50), default="America/Bogota", server_default="America/Bogota")

    # Contacto
    phone: Mapped[str | None] = mapped_column(String(50))
    whatsapp: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(300))
    instagram: Mapped[str | None] = mapped_column(String(300))
    facebook: Mapped[str | None] = mapped_column(String(300))

    # Precios en pesos colombianos (COP). NULL = no hay información.
    price_min: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_max: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_level: Mapped[int | None] = mapped_column(SmallInteger)  # 1 = económico … 4 = muy costoso

    # Calificación calculada a partir de las reseñas aprobadas
    rating_avg: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    rating_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Fecha en que se verificaron los horarios por última vez (NULL = nunca)
    hours_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Propiedad y verificación
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active")
    duplicate_of_id: Mapped[int | None] = mapped_column(ForeignKey("establishments.id", ondelete="SET NULL"))

    # Origen de los datos
    source: Mapped[str] = mapped_column(String(20), default="manual", server_default="manual")
    osm_type: Mapped[str | None] = mapped_column(String(10))
    osm_id: Mapped[int | None] = mapped_column(BigInteger)
    osm_tags: Mapped[dict | None] = mapped_column(JSONB)

    municipality: Mapped["Place | None"] = relationship(lazy="joined")
    categories: Mapped[list[Category]] = relationship(secondary=establishment_categories, lazy="selectin")
    offerings: Mapped[list["Offering"]] = relationship(
        back_populates="establishment", cascade="all, delete-orphan"
    )
    photos: Mapped[list["EstablishmentPhoto"]] = relationship(
        back_populates="establishment", cascade="all, delete-orphan", order_by="EstablishmentPhoto.sort_order"
    )
    opening_hours: Mapped[list["OpeningHour"]] = relationship(
        back_populates="establishment", cascade="all, delete-orphan"
    )
    special_hours: Mapped[list["SpecialHour"]] = relationship(
        back_populates="establishment", cascade="all, delete-orphan"
    )


class Offering(TimestampMixin, Base):
    """Producto o servicio que ofrece un establecimiento."""

    __tablename__ = "offerings"
    __table_args__ = (
        CheckConstraint(f"kind IN {OFFERING_KINDS}", name="kind_valid"),
        CheckConstraint("price IS NULL OR price >= 0", name="price_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    establishment_id: Mapped[int] = mapped_column(ForeignKey("establishments.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    # Sección de la carta ("Hamburguesas", "Bebidas"…): agrupa menús largos en pestañas. Opcional.
    section: Mapped[str | None] = mapped_column(String(60))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    establishment: Mapped[Establishment] = relationship(back_populates="offerings")


class EstablishmentPhoto(TimestampMixin, Base):
    __tablename__ = "establishment_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    establishment_id: Mapped[int] = mapped_column(ForeignKey("establishments.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(500))
    caption: Mapped[str | None] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    establishment: Mapped[Establishment] = relationship(back_populates="photos")


class OpeningHour(Base):
    """Franja de atención semanal. Puede haber varias por día (horario dividido).

    Si closes_at <= opens_at, la franja termina al día siguiente (ej. 18:00–02:00).
    day_of_week: 0 = lunes … 6 = domingo.
    """

    __tablename__ = "opening_hours"
    __table_args__ = (
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="day_valid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    establishment_id: Mapped[int] = mapped_column(ForeignKey("establishments.id", ondelete="CASCADE"), index=True)
    day_of_week: Mapped[int] = mapped_column(SmallInteger)
    opens_at: Mapped[time] = mapped_column(Time)
    closes_at: Mapped[time] = mapped_column(Time)

    establishment: Mapped[Establishment] = relationship(back_populates="opening_hours")


class SpecialHour(Base):
    """Excepción para una fecha concreta (festivo, cierre temporal, horario especial)."""

    __tablename__ = "special_hours"
    __table_args__ = (
        CheckConstraint(
            "is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL)", name="hours_required"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    establishment_id: Mapped[int] = mapped_column(ForeignKey("establishments.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    opens_at: Mapped[time | None] = mapped_column(Time)
    closes_at: Mapped[time | None] = mapped_column(Time)
    note: Mapped[str | None] = mapped_column(String(200))

    establishment: Mapped[Establishment] = relationship(back_populates="special_hours")


class DuplicateDismissal(Base):
    """Par de establecimientos que un administrador revisó y confirmó que NO son duplicados.

    Se guarda siempre con establishment_a_id < establishment_b_id para que el par sea único.
    """

    __tablename__ = "duplicate_dismissals"
    __table_args__ = (
        CheckConstraint("establishment_a_id < establishment_b_id", name="ordered_pair"),
        UniqueConstraint("establishment_a_id", "establishment_b_id", name="uq_duplicate_dismissals_pair"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    establishment_a_id: Mapped[int] = mapped_column(ForeignKey("establishments.id", ondelete="CASCADE"))
    establishment_b_id: Mapped[int] = mapped_column(ForeignKey("establishments.id", ondelete="CASCADE"))
    dismissed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Embedding(Base):
    """Vector semántico de un establecimiento o de uno de sus productos/servicios.

    content_hash permite saber si el texto cambió y hay que regenerar el vector.
    establishment_id se guarda siempre para poder unir rápido con la tabla de establecimientos.
    """

    __tablename__ = "embeddings"
    __table_args__ = (
        CheckConstraint(f"entity_type IN {EMBEDDING_ENTITIES}", name="entity_valid"),
        UniqueConstraint("entity_type", "entity_id", name="uq_embeddings_entity"),
        # Índice HNSW para búsqueda aproximada por similitud coseno
        Index(
            "ix_embeddings_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[int] = mapped_column(Integer)
    establishment_id: Mapped[int] = mapped_column(ForeignKey("establishments.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(100))
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
