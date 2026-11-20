"""Esquemas de reseñas y reportes."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(None, max_length=1000)

    @field_validator("comment")
    @classmethod
    def clean_comment(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = " ".join(v.split())
        if not v:
            return None
        if len(v) < 10:
            raise ValueError("El comentario es muy corto (mínimo 10 caracteres) o déjalo vacío")
        return v


class ReviewOut(BaseModel):
    id: int
    rating: int
    comment: str | None
    author: str
    created_at: datetime
    edited: bool
    owner_reply: str | None = None          # respuesta pública del propietario del negocio
    owner_reply_at: datetime | None = None


class ReplyIn(BaseModel):
    text: str = Field(min_length=2, max_length=1000)

    @field_validator("text")
    @classmethod
    def clean_text(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Escribe una respuesta")
        return v


class MyReviewOut(ReviewOut):
    status: Literal["pending", "approved", "rejected"]
    moderation_reason: str | None


class ReviewsPage(BaseModel):
    rating_avg: float | None
    rating_count: int
    distribution: dict[int, int]    # estrellas -> cantidad (solo reseñas aprobadas)
    total: int
    items: list[ReviewOut]


class ReportIn(BaseModel):
    message: str | None = Field(None, max_length=500)
