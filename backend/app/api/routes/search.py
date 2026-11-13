"""Búsqueda inteligente: lenguaje natural + pgvector + filtros + ubicación, y recomendaciones con IA."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_verified_user
from app.core.rate_limit import limit_by_ip, limit_by_user
from app.data.categories import CATEGORIES
from app.db.session import get_db
from app.models import Establishment, Review, SearchHistory, User
from app.schemas.search import (
    RecommendationsRequest,
    RecommendationsResponse,
    SearchRequest,
    SearchResponse,
)
from app.services.catalog import LOAD_OPTIONS, to_summary
from app.services.embeddings import Embedder, get_embedder
from app.services.llm import LLMProvider, get_llm
from app.services.places import find_place_in_text
from app.services.query_parser import parse_query
from app.services.recommendations import recommend
from app.services.search import SearchParams, search

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse,
             dependencies=[Depends(limit_by_ip("search", 120, 60)), Depends(limit_by_user("search", 30, 60))])
def smart_search(
    data: SearchRequest,
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
    llm: LLMProvider | None = Depends(get_llm),
    user: User = Depends(get_verified_user),
):
    """Exige cuenta con correo confirmado: protege la cuota de la IA frente a robots y abusos."""
    result = search(db, SearchParams(**data.model_dump()), embedder, llm)
    intent = result.intent

    # Historial: se guarda el texto y la interpretación, NUNCA las coordenadas del usuario.
    db.add(SearchHistory(
        user_id=user.id,
        query_text=data.q,
        parsed_query=intent.model_dump(),
        location_label=result.location.label if result.location else None,
        results_count=len(result.hits),
    ))
    db.commit()

    return {
        "query": data.q,
        "interpretation": {
            **intent.model_dump(exclude={"category_slugs"}),
            "categories": [CATEGORIES[s][0] for s in intent.category_slugs if s in CATEGORIES],
        },
        "location": result.location.__dict__ if result.location else None,
        "needs_location": result.needs_location,
        "notices": result.notices,
        "applied_filters": result.applied_filters,
        "results": [
            {
                **to_summary(h.establishment),
                "hours_status": h.hours,
                "score": round(h.score, 6),
                "similarity": h.similarity,
                "text_match": h.text_match,
                "matched_text": h.matched_text,
                "distance_km": h.distance_km,
                "budget_fit": h.budget_fit,
                "relevance": h.relevance,
            }
            for h in result.hits
        ],
    }


@router.post("/recommendations", response_model=RecommendationsResponse,
             dependencies=[Depends(limit_by_ip("recommendations", 120, 60)),
                           Depends(limit_by_user("recommendations", 20, 60))])
def recommendations(
    data: RecommendationsRequest,
    db: Session = Depends(get_db),
    llm: LLMProvider | None = Depends(get_llm),
    _user: User = Depends(get_verified_user),
):
    """Explica por qué cada resultado encaja con la búsqueda, usando solo datos de la base de datos.

    Se pide DESPUÉS de mostrar los resultados, para no retrasar la búsqueda.
    """
    detected = find_place_in_text(db, data.q)
    intent = parse_query(data.q, llm, detected.matched_text if detected else None)  # usa la caché de la búsqueda

    ids = list(dict.fromkeys(data.establishment_ids))  # sin duplicados, en el mismo orden
    found = {e.id: e for e in db.scalars(select(Establishment).options(*LOAD_OPTIONS)
                                         .where(Establishment.id.in_(ids), Establishment.status == "active"))}
    ordered = [found[i] for i in ids if i in found]

    # Reseñas aprobadas más recientes (se usarán cuando exista el sistema de reseñas)
    reviews: dict[int, list[str]] = {}
    for r in db.scalars(select(Review).where(Review.establishment_id.in_(ids), Review.status == "approved",
                                              Review.comment.is_not(None)).order_by(Review.created_at.desc())):
        reviews.setdefault(r.establishment_id, []).append(r.comment)

    result = recommend(data.q, intent, ordered, llm, reviews)
    return {
        "summary": result.summary,
        "source": result.source,
        "items": [item.__dict__ for item in result.items],
    }
