"""Genera o actualiza los embeddings de todos los establecimientos.

Uso (desde la carpeta backend):
    .\\.venv\\Scripts\\python -m scripts.reindex_embeddings

Solo recalcula los vectores cuyo texto cambió, así que se puede ejecutar las veces que se quiera.
La primera vez descarga el modelo (~470 MB) y queda guardado en caché.
"""
import time

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.db.session import SessionLocal
from app.models import Embedding, Establishment
from app.services.embeddings import get_embedder, sync_establishments

BATCH = 100


def main() -> None:
    embedder = get_embedder()
    db = SessionLocal()
    start = time.time()
    try:
        ids = list(db.scalars(select(Establishment.id).order_by(Establishment.id)))
        print(f"Establecimientos: {len(ids)}. Cargando modelo {embedder.model_name}…")
        generated = 0
        for i in range(0, len(ids), BATCH):
            chunk = list(db.scalars(
                select(Establishment).options(selectinload(Establishment.offerings))
                .where(Establishment.id.in_(ids[i:i + BATCH]))
            ))
            generated += sync_establishments(db, chunk, embedder)
            db.commit()
            print(f"  {min(i + BATCH, len(ids))}/{len(ids)} procesados ({generated} vectores nuevos o actualizados)")
        total = db.scalar(select(func.count(Embedding.id)))
        print(f"Listo en {time.time() - start:.0f} s. Vectores en la base de datos: {total}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
