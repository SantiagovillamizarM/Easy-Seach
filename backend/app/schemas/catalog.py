"""Esquemas de validación para el catálogo (establecimientos, productos, horarios)."""
import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_PHONE = re.compile(r"^[0-9+()\-\s]{7,25}$")


def _clean_optional(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


# ------------------------------- Salida --------------------------------------------------

class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    slug: str


class PlaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    kind: str
    parent_id: int | None
    latitude: float
    longitude: float


class HoursStatusOut(BaseModel):
    state: Literal["open", "closed", "unknown"]
    label: str
    closes_at: datetime | None = None
    opens_at: datetime | None = None
    verified: bool


class OfferingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    name: str
    description: str | None
    price: Decimal | None
    is_available: bool


class PhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    url: str
    caption: str | None


class OpeningHourOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    day_of_week: int
    opens_at: time
    closes_at: time


class SpecialHourOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date
    is_closed: bool
    opens_at: time | None
    closes_at: time | None
    note: str | None


class EstablishmentSummary(BaseModel):
    id: int
    slug: str
    name: str
    address: str | None
    neighborhood: str | None
    municipality: str | None
    latitude: float
    longitude: float
    categories: list[CategoryOut]
    price_min: Decimal | None
    price_max: Decimal | None
    price_level: int | None
    rating_avg: Decimal | None
    rating_count: int
    is_verified: bool
    photo_url: str | None
    hours_status: HoursStatusOut


class EstablishmentDetail(EstablishmentSummary):
    description: str | None
    phone: str | None
    whatsapp: str | None
    email: str | None
    website: str | None
    instagram: str | None
    facebook: str | None
    timezone: str
    hours_verified_at: datetime | None
    source: str
    owner_id: int | None
    offerings: list[OfferingOut]
    photos: list[PhotoOut]
    opening_hours: list[OpeningHourOut]
    special_hours: list[SpecialHourOut]


# ------------------------------- Entrada -------------------------------------------------

class EstablishmentBase(BaseModel):
    description: str | None = Field(None, max_length=3000)
    address: str | None = Field(None, max_length=300)
    neighborhood: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=50)
    whatsapp: str | None = Field(None, max_length=50)
    email: str | None = Field(None, max_length=255)
    website: str | None = Field(None, max_length=300)
    instagram: str | None = Field(None, max_length=300)
    facebook: str | None = Field(None, max_length=300)
    price_min: Decimal | None = Field(None, ge=0, le=100_000_000)
    price_max: Decimal | None = Field(None, ge=0, le=100_000_000)
    price_level: int | None = Field(None, ge=1, le=4)

    @field_validator("*", mode="before")
    @classmethod
    def strip_strings(cls, v):
        """Quita espacios sobrantes y convierte textos vacíos en None."""
        return _clean_optional(v)

    @field_validator("phone", "whatsapp")
    @classmethod
    def valid_phone(cls, v):
        if v is not None and not _PHONE.match(v):
            raise ValueError("Teléfono inválido (solo números, espacios, +, - y paréntesis)")
        return v

    @field_validator("website", "facebook")
    @classmethod
    def valid_url(cls, v):
        if v is not None and not v.lower().startswith(("http://", "https://")):
            raise ValueError("Debe ser una dirección web que empiece por http:// o https://")
        return v

    @model_validator(mode="after")
    def price_range(self):
        if self.price_min is not None and self.price_max is not None and self.price_min > self.price_max:
            raise ValueError("price_min no puede ser mayor que price_max")
        return self


class EstablishmentCreate(EstablishmentBase):
    name: str = Field(min_length=2, max_length=200)
    municipality_id: int
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    category_ids: list[int] = Field(default_factory=list, max_length=10)


class EstablishmentUpdate(EstablishmentBase):
    """Todos los campos son opcionales: solo se cambian los que se envían."""
    name: str | None = Field(None, min_length=2, max_length=200)
    municipality_id: int | None = None
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    category_ids: list[int] | None = Field(None, max_length=10)


class OfferingIn(BaseModel):
    kind: Literal["product", "service"]
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(None, max_length=1000)
    price: Decimal | None = Field(None, ge=0, le=100_000_000)
    is_available: bool = True


class OfferingUpdate(BaseModel):
    kind: Literal["product", "service"] | None = None
    name: str | None = Field(None, min_length=2, max_length=200)
    description: str | None = Field(None, max_length=1000)
    price: Decimal | None = Field(None, ge=0, le=100_000_000)
    is_available: bool | None = None


class OpeningHourIn(BaseModel):
    day_of_week: int = Field(ge=0, le=6, description="0 = lunes … 6 = domingo")
    opens_at: time
    closes_at: time = Field(description="Si es menor o igual que opens_at, cierra al día siguiente")


class WeeklyHoursIn(BaseModel):
    slots: list[OpeningHourIn] = Field(max_length=50)


class SpecialHourIn(BaseModel):
    date: date
    is_closed: bool = False
    opens_at: time | None = None
    closes_at: time | None = None
    note: str | None = Field(None, max_length=200)

    @model_validator(mode="after")
    def hours_required(self):
        if not self.is_closed and (self.opens_at is None or self.closes_at is None):
            raise ValueError("Si no está cerrado, indica opens_at y closes_at")
        return self
