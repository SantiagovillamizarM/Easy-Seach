"""Rutas internas para los flujos de n8n (no las usa el navegador).

- `POST /api/internal/embeddings`: convierte textos en vectores con el mismo modelo de la búsqueda
  (multilingual-e5-small). Así los vectores que guarda n8n son comparables con los que ya existen.
- `GET /api/internal/indexacion/pendientes`: textos de establecimientos y productos cuyo vector falta o quedó
  desactualizado (según el hash del texto), y vectores que sobran. n8n genera y guarda los vectores en pgvector.

Protección: exigen la cabecera `X-Internal-Key` con la clave INTERNAL_API_KEY del .env, y Spring Boot (la única
puerta del navegador) responde 404 a cualquier ruta /api/internal.
"""
import hmac
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.db.session import get_db
from app.models import Establishment
from app.services.embeddings import Embedder, get_embedder, plan_sync

MAX_TEXTS = 64
PLAN_BATCH = 200


def require_internal_key(x_internal_key: str | None = Header(None)) -> None:
    expected = get_settings().internal_api_key
    if not expected:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="La integración interna está desactivada")
    # compare_digest tarda lo mismo acierte o no: no se puede adivinar la clave midiendo tiempos
    if not x_internal_key or not hmac.compare_digest(x_internal_key.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Clave interna inválida")


router = APIRouter(prefix="/internal", tags=["internal"], include_in_schema=False,
                   dependencies=[Depends(require_internal_key)])


class EmbeddingsIn(BaseModel):
    textos: list[str] = Field(min_length=1, max_length=MAX_TEXTS)
    # "consulta" para preguntas de usuarios, "documento" para lo que se indexa (el modelo e5 los distingue)
    tipo: Literal["consulta", "documento"]


class EmbeddingsOut(BaseModel):
    modelo: str
    dimensiones: int
    vectores: list[list[float]]


@router.post("/embeddings", response_model=EmbeddingsOut)
def embeddings(data: EmbeddingsIn, embedder: Embedder = Depends(get_embedder)) -> EmbeddingsOut:
    textos = [t.strip() for t in data.textos]
    if any(not t or len(t) > 4000 for t in textos):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail="Cada texto debe tener entre 1 y 4000 caracteres")
    if data.tipo == "consulta":
        vectores = [embedder.encode_query(t) for t in textos]
    else:
        vectores = embedder.encode_passages(textos)
    return EmbeddingsOut(modelo=embedder.model_name, dimensiones=len(vectores[0]), vectores=vectores)


class PendienteOut(BaseModel):
    entity_type: str
    entity_id: int
    establishment_id: int
    texto: str
    content_hash: str


class PendientesOut(BaseModel):
    modelo: str
    pendientes: list[PendienteOut]
    hay_mas: bool                 # True = quedaron más pendientes después del límite
    obsoletos: list[int]          # ids de la tabla embeddings que se deben borrar


@router.get("/indexacion/pendientes", response_model=PendientesOut)
def pendientes(limite: int = Query(64, ge=1, le=MAX_TEXTS), db: Session = Depends(get_db),
               embedder: Embedder = Depends(get_embedder)) -> PendientesOut:
    """Recorre todos los establecimientos (de cualquier estado: si un negocio oculto vuelve a mostrarse, su vector
    ya está listo; la búsqueda filtra por estado al consultar) y devuelve hasta `limite` textos pendientes."""
    ids = list(db.scalars(select(Establishment.id).order_by(Establishment.id)))
    encontrados: list[PendienteOut] = []
    obsoletos: list[int] = []
    hay_mas = False
    for i in range(0, len(ids), PLAN_BATCH):
        lote = list(db.scalars(
            select(Establishment)
            .options(selectinload(Establishment.offerings), selectinload(Establishment.categories),
                     selectinload(Establishment.municipality))
            .where(Establishment.id.in_(ids[i:i + PLAN_BATCH]))
            .order_by(Establishment.id)
        ))
        plan = plan_sync(db, lote, embedder.model_name)
        obsoletos += [emb.id for emb in plan.obsolete]
        for p in plan.pending:
            if len(encontrados) == limite:
                hay_mas = True
                break
            encontrados.append(PendienteOut(entity_type=p.entity_type, entity_id=p.entity_id,
                                            establishment_id=p.establishment_id, texto=p.text,
                                            content_hash=p.content_hash))
        if hay_mas:
            break
    return PendientesOut(modelo=embedder.model_name, pendientes=encontrados, hay_mas=hay_mas, obsoletos=obsoletos)
