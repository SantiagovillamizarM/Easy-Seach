"""Esquemas de solicitudes de propiedad y del panel comercial."""
import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

_PHONE = re.compile(r"^[0-9+()\-\s]{7,25}$")


class ClaimIn(BaseModel):
    message: str = Field(min_length=20, max_length=1000,
                         description="Cómo demuestras que eres el propietario o encargado")
    contact_phone: str = Field(min_length=7, max_length=25)

    @field_validator("contact_phone")
    @classmethod
    def valid_phone(cls, v: str) -> str:
        v = v.strip()
        if not _PHONE.match(v):
            raise ValueError("Teléfono inválido")
        return v


class ClaimOut(BaseModel):
    id: int
    establishment_id: int
    establishment_name: str
    establishment_slug: str
    status: Literal["pending", "approved", "rejected"]
    message: str | None
    contact_phone: str | None
    review_note: str | None
    created_at: datetime
    reviewed_at: datetime | None


class AdminClaimOut(ClaimOut):
    user_id: int
    user_name: str
    user_email: str


class ClaimDecision(BaseModel):
    note: str | None = Field(None, max_length=300)


class PhotoOut(BaseModel):
    id: int
    url: str
    caption: str | None
