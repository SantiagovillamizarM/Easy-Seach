"""Búsqueda inteligente: lenguaje natural + pgvector + filtros + ubicación."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_optional_user
from app.data.categories import CATEGORIES
from app.db.session import get_db
from app.models import SearchHistory, User
from app.schemas.search import SearchRequest, SearchResponse
from app.services.catalog import to_summary
from app.services.embeddings import Embedder, get_embedder
from app.services.llm import LLMProvider, get_llm
from app.services.search import SearchParams, search

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
def smart_search(
    data: SearchRequest,
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
    llm: LLMProvider | None = Depends(get_llm),
    user: User | None = Depends(get_optional_user),
):
    result = search(db, SearchParams(**data.model_dump()), embedder, llm)
    intent = result.intent

    # Historial: se guarda el texto y la interpretación, NUNCA las coordenadas del usuario.
    db.add(SearchHistory(
        user_id=user.id if user else None,
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
