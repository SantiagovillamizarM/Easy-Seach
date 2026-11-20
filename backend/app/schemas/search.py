"""Esquemas de la búsqueda inteligente."""
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.catalog import EstablishmentSummary


class SearchRequest(BaseModel):
    q: str = Field(min_length=2, max_length=300, description="Lo que busca el usuario, en sus palabras")
    # Ubicación del navegador: SOLO si el usuario dio permiso. No se guarda en el historial.
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    place_id: int | None = Field(None, description="Municipio o barrio elegido en el filtro")
    radius_km: float | None = Field(None, gt=0, le=50)
    budget_min: int | None = Field(None, ge=0, le=100_000_000)
    budget_max: int | None = Field(None, ge=0, le=100_000_000)
    min_rating: float | None = Field(None, ge=1, le=5)
    category: str | None = Field(None, max_length=100)
    open_now: bool | None = None
    limit: int = Field(10, ge=1, le=30)

    @field_validator("q")
    @classmethod
    def clean_query(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Escribe qué estás buscando")
        return v

    @model_validator(mode="after")
    def coherent(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Envía latitud y longitud juntas")
        if self.budget_min is not None and self.budget_max is not None and self.budget_min > self.budget_max:
            raise ValueError("budget_min no puede ser mayor que budget_max")
        return self


class LocationOut(BaseModel):
    label: str
    kind: str
    source: Literal["texto", "filtro", "gps"]
    radius_km: float | None


class InterpretationOut(BaseModel):
    need: str
    keywords: list[str]
    categories: list[str]
    location_text: str | None
    near_me: bool
    budget_min: int | None
    budget_max: int | None
    price_preference: str | None
    open_now: bool
    min_rating: float | None
    preferences: list[str]
    parser: Literal["gemini", "reglas"]


class SearchHitOut(EstablishmentSummary):
    score: float
    similarity: float | None
    text_match: bool
    matched_text: str | None
    distance_km: float | None
    budget_fit: Literal["dentro", "desconocido"]
    relevance: Literal["alta", "relacionada"]


class RecommendationsRequest(BaseModel):
    q: str = Field(min_length=2, max_length=300)
    establishment_ids: list[int] = Field(min_length=1, max_length=6)


class RecommendationOut(BaseModel):
    establishment_id: int
    text: str
    data_gaps: list[str]
    source: Literal["gemini", "reglas"]


class RecommendationsResponse(BaseModel):
    summary: str | None
    source: Literal["gemini", "reglas"]
    items: list[RecommendationOut]


class SearchResponse(BaseModel):
    query: str
    interpretation: InterpretationOut
    location: LocationOut | None
    needs_location: bool
    notices: list[str]
    applied_filters: dict
    results: list[SearchHitOut]
    guest_remaining: int | None = None   # búsquedas de prueba que le quedan a un invitado (None = con cuenta)
