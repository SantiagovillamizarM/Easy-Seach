"""Esquemas de entrada del panel administrativo."""
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ReviewDecision(BaseModel):
    reason: str | None = Field(None, max_length=300, description="Motivo del rechazo (lo ve el autor)")


class UserAdminUpdate(BaseModel):
    role: Literal["user", "owner", "admin"] | None = None
    is_active: bool | None = None


class EstablishmentAdminUpdate(BaseModel):
    status: Literal["active", "hidden", "duplicate"] | None = None
    duplicate_of_id: int | None = None
    is_verified: bool | None = None

    @model_validator(mode="after")
    def duplicate_needs_original(self):
        if self.status == "duplicate" and self.duplicate_of_id is None:
            raise ValueError("Indica de qué establecimiento es duplicado (duplicate_of_id)")
        return self


class DuplicateDismissIn(BaseModel):
    a_id: int
    b_id: int

    @model_validator(mode="after")
    def different(self):
        if self.a_id == self.b_id:
            raise ValueError("Los dos establecimientos deben ser distintos")
        return self
