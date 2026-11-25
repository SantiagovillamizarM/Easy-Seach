"""Esquemas de solicitudes de propiedad y del panel comercial."""
import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.catalog import EstablishmentBase

_PHONE = re.compile(r"^[0-9+()\-\s]{7,25}$")

# Área metropolitana de Bucaramanga (Bucaramanga, Floridablanca, Girón y Piedecuesta) con margen
METRO_LAT = (6.80, 7.30)
METRO_LNG = (-73.35, -72.90)


class _Applicant(BaseModel):
    """Quién hace la solicitud: con esto el administrador lo llama y verifica que maneja el negocio."""
    contact_phone: str = Field(min_length=7, max_length=25)
    applicant_role: Literal["dueno", "encargado"]
    applicant_position: str | None = Field(None, max_length=100)
    accept_terms: bool = Field(description="Autoriza el tratamiento y la publicación de los datos (Ley 1581)")

    @field_validator("contact_phone")
    @classmethod
    def valid_phone(cls, v: str) -> str:
        v = v.strip()
        if not _PHONE.match(v):
            raise ValueError("Teléfono inválido")
        return v

    @field_validator("applicant_position")
    @classmethod
    def clean_position(cls, v: str | None) -> str | None:
        return " ".join(v.split()) or None if v else None

    @field_validator("accept_terms")
    @classmethod
    def must_accept(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Debes autorizar el uso de los datos para enviar la solicitud")
        return v


class ClaimIn(_Applicant):
    message: str = Field(min_length=20, max_length=1000,
                         description="Cómo demuestras que eres el propietario o encargado")


class BusinessProposal(EstablishmentBase):
    """Datos de un negocio que todavía no está en la app. Los precios, el horario y los productos los completa
    el propietario en su panel cuando se aprueba la solicitud."""
    name: str = Field(min_length=2, max_length=200)
    category_ids: list[int] = Field(min_length=1, max_length=3)
    municipality_id: int
    address: str = Field(min_length=5, max_length=300)
    phone: str = Field(max_length=50)
    description: str | None = Field(None, max_length=600)
    latitude: float
    longitude: float

    @model_validator(mode="after")
    def inside_metro_area(self):
        if not (METRO_LAT[0] <= self.latitude <= METRO_LAT[1] and METRO_LNG[0] <= self.longitude <= METRO_LNG[1]):
            raise ValueError("La ubicación debe estar en el área metropolitana de Bucaramanga")
        return self


class RegistrationIn(_Applicant):
    business: BusinessProposal
    message: str | None = Field(None, max_length=1000,
                                description="Algo que ayude a verificarte (p. ej. puedes enviar el RUT)")


class ClaimOut(BaseModel):
    id: int
    kind: Literal["claim", "register"]
    establishment_id: int | None        # en un registro nuevo, existe solo después de aprobarlo
    establishment_name: str
    establishment_slug: str | None
    status: Literal["pending", "approved", "rejected"]
    message: str | None
    contact_phone: str | None
    applicant_role: Literal["dueno", "encargado"] | None
    applicant_position: str | None
    review_note: str | None
    created_at: datetime
    reviewed_at: datetime | None


class AdminClaimOut(ClaimOut):
    user_id: int
    user_name: str
    user_email: str
    consent_at: datetime | None
    # Negocio propuesto (solo registros nuevos), con los nombres de municipio y categorías ya resueltos
    proposed: dict | None = None


class ClaimDecision(BaseModel):
    note: str | None = Field(None, max_length=300)


class PhotoOut(BaseModel):
    id: int
    url: str
    caption: str | None
