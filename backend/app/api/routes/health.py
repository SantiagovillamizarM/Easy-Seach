"""Endpoint de salud: confirma que la API, PostgreSQL y pgvector funcionan."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    result = {"api": "ok", "database": "error", "pgvector": None}
    try:
        db.execute(text("SELECT 1"))
        result["database"] = "ok"
        version = db.execute(
            text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
        ).scalar()
        result["pgvector"] = version  # None si la extensión no está instalada
        if version:
            # Prueba real de similitud: distancia coseno entre dos vectores
            result["vector_test_cosine_distance"] = db.execute(
                text("SELECT '[1,0,0]'::vector <=> '[0.7,0.7,0]'::vector")
            ).scalar()
    except SQLAlchemyError as exc:
        result["detail"] = exc.__class__.__name__
    return result
