"""Esquemas de favoritos e historial del usuario."""
from datetime import datetime

from pydantic import BaseModel

from app.schemas.catalog import EstablishmentSummary


class FavoriteOut(EstablishmentSummary):
    saved_at: datetime


class HistoryItemOut(BaseModel):
    id: int
    query_text: str
    location_label: str | None
    results_count: int
    created_at: datetime
    need: str | None


class HistoryPage(BaseModel):
    total: int
    items: list[HistoryItemOut]
