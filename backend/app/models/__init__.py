"""Importa todos los modelos para que Alembic y SQLAlchemy los conozcan."""
from app.models.base import Base
from app.models.catalog import (
    Category,
    Embedding,
    Establishment,
    EstablishmentPhoto,
    Offering,
    OpeningHour,
    SpecialHour,
    establishment_categories,
)
from app.models.interaction import Favorite, OwnershipClaim, Report, Review, SearchHistory
from app.models.place import Place
from app.models.user import User

__all__ = [
    "Base",
    "Category",
    "Embedding",
    "Establishment",
    "EstablishmentPhoto",
    "Favorite",
    "Offering",
    "OpeningHour",
    "OwnershipClaim",
    "Place",
    "Report",
    "Review",
    "SearchHistory",
    "SpecialHour",
    "User",
    "establishment_categories",
]
