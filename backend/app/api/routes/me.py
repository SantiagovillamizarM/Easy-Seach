"""Datos personales del usuario autenticado: favoritos e historial de búsquedas.

Todas las rutas trabajan SOLO con los datos del usuario del token: no reciben un user_id,
así que es imposible ver o modificar los datos de otra persona.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Establishment, Favorite, SearchHistory, User
from app.schemas.me import FavoriteOut, HistoryItemOut, HistoryPage
from app.services.catalog import LOAD_OPTIONS, to_summary

router = APIRouter(prefix="/me", tags=["me"])


# ------------------------------- Favoritos ----------------------------------------------

@router.get("/favorites", response_model=list[FavoriteOut])
def list_favorites(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Establishment, Favorite.created_at)
        .join(Favorite, Favorite.establishment_id == Establishment.id)
        .options(*LOAD_OPTIONS)
        .where(Favorite.user_id == user.id, Establishment.status == "active")
        .order_by(Favorite.created_at.desc())
    ).all()
    return [{**to_summary(est), "saved_at": saved_at} for est, saved_at in rows]


@router.get("/favorites/ids", response_model=list[int])
def favorite_ids(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Solo los ids: sirve para marcar los corazones en los resultados sin cargar todo."""
    return list(db.scalars(select(Favorite.establishment_id).where(Favorite.user_id == user.id)))


@router.put("/favorites/{establishment_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_favorite(establishment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Guardar en favoritos. Si ya estaba guardado no pasa nada (idempotente)."""
    exists = db.scalar(select(Establishment.id).where(Establishment.id == establishment_id,
                                                      Establishment.status == "active"))
    if exists is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Establecimiento no encontrado")
    if db.get(Favorite, (user.id, establishment_id)) is None:
        db.add(Favorite(user_id=user.id, establishment_id=establishment_id))
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/favorites/{establishment_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(establishment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(Favorite).where(Favorite.user_id == user.id, Favorite.establishment_id == establishment_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------- Historial ----------------------------------------------

def _history_item(row: SearchHistory) -> dict:
    parsed = row.parsed_query or {}
    return {
        "id": row.id,
        "query_text": row.query_text,
        "location_label": row.location_label,
        "results_count": row.results_count,
        "created_at": row.created_at,
        "need": parsed.get("need"),
    }


@router.get("/history", response_model=HistoryPage)
def list_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base = select(SearchHistory).where(SearchHistory.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.order_by(SearchHistory.created_at.desc()).limit(limit).offset(offset))
    return {"total": total, "items": [_history_item(r) for r in rows]}


@router.delete("/history/{history_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_history_item(history_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Elimina la búsqueda del historial del usuario.

    Privacidad: el registro se DESVINCULA de la cuenta (user_id = NULL). Desde ese momento es anónimo y solo
    cuenta para las estadísticas generales de la plataforma.
    """
    result = db.execute(update(SearchHistory)
                        .where(SearchHistory.id == history_id, SearchHistory.user_id == user.id)
                        .values(user_id=None))
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Búsqueda no encontrada")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
def clear_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(SearchHistory).where(SearchHistory.user_id == user.id).values(user_id=None))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
