"""Embeddings semánticos con el modelo local multilingual-e5-small (384 dimensiones).

Flujo:
1. Se construye un "texto canónico" del establecimiento y de cada producto/servicio.
2. Se calcula un hash del texto: si no cambió, NO se recalcula el vector.
3. El vector se guarda en la tabla `embeddings` (columna pgvector) para búsquedas por similitud.

El modelo e5 requiere prefijos: "passage: " para documentos y "query: " para consultas.
"""
import hashlib
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from typing import Protocol

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Embedding, Establishment, Offering

MODEL_NAME = "intfloat/multilingual-e5-small"

# Traducción de los tipos de cocina de OpenStreetMap, para que el texto quede en español
CUISINE_ES = {
    "burger": "hamburguesas", "pizza": "pizza", "chicken": "pollo", "fried_chicken": "pollo frito",
    "coffee_shop": "café", "ice_cream": "helados", "regional": "comida típica regional",
    "local": "comida típica", "colombian": "comida colombiana", "sandwich": "sándwiches",
    "mexican": "comida mexicana", "italian": "comida italiana", "chinese": "comida china",
    "japanese": "comida japonesa", "sushi": "sushi", "seafood": "mariscos y pescados", "fish": "pescado",
    "steak_house": "carnes y asados", "parrilla": "parrilla y asados", "grill": "asados",
    "barbecue": "asados", "hot_dog": "perros calientes", "arepa": "arepas", "breakfast": "desayunos",
    "vegetarian": "comida vegetariana", "vegan": "comida vegana", "kebab": "kebab", "crepe": "crepes",
    "dessert": "postres", "cake": "tortas", "donut": "donas", "juice": "jugos naturales",
    "bubble_tea": "té de burbujas", "wings": "alitas", "salad": "ensaladas", "peruvian": "comida peruana",
    "international": "comida internacional", "fast_food": "comida rápida", "bakery": "panadería",
    "tacos": "tacos", "burrito": "burritos", "empanada": "empanadas", "soup": "sopas",
    "pasta": "pasta", "american": "comida americana", "argentinian": "comida argentina",
    "venezuelan": "comida venezolana", "spanish": "comida española", "french": "comida francesa",
    "thai": "comida tailandesa", "korean": "comida coreana", "arab": "comida árabe",
}


class Embedder(Protocol):
    model_name: str

    def encode_passages(self, texts: list[str]) -> list[list[float]]: ...

    def encode_query(self, text: str) -> list[float]: ...


class SentenceTransformerEmbedder:
    """Carga el modelo una sola vez (la primera vez que se usa) y lo reutiliza."""

    def __init__(self, model_name: str = MODEL_NAME):
        self.model_name = model_name
        self._model = None
        self._lock = threading.Lock()

    def _get_model(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from sentence_transformers import SentenceTransformer  # import pesado: solo si se usa
                    self._model = SentenceTransformer(self.model_name, device="cpu")
        return self._model

    def encode_passages(self, texts: list[str]) -> list[list[float]]:
        vectors = self._get_model().encode(
            [f"passage: {t}" for t in texts], normalize_embeddings=True, batch_size=64
        )
        return [v.tolist() for v in vectors]

    def encode_query(self, text: str) -> list[float]:
        return self._get_model().encode(f"query: {text}", normalize_embeddings=True).tolist()


@lru_cache
def get_embedder() -> Embedder:
    """Dependencia de FastAPI (en las pruebas se reemplaza por un embedder falso y rápido)."""
    return SentenceTransformerEmbedder()


# --------------------------------------------------------------------------------------
# Texto canónico
# --------------------------------------------------------------------------------------

def _cuisines(est: Establishment) -> list[str]:
    raw = (est.osm_tags or {}).get("cuisine", "")
    return [CUISINE_ES.get(c.strip(), c.strip().replace("_", " ")) for c in raw.split(";") if c.strip()]


def establishment_text(est: Establishment) -> str:
    """Texto que describe al establecimiento para generar su vector.

    Solo usa datos guardados (nunca inventa): nombre, categorías, descripción, cocina, ubicación,
    y nombres de sus productos/servicios.
    """
    parts = [f"{est.name}."]
    if est.categories:
        parts.append("Tipo: " + "; ".join(f"{c.name} ({c.description})" if c.description else c.name
                                           for c in est.categories) + ".")
    cuisines = _cuisines(est)
    if cuisines:
        parts.append("Cocina: " + ", ".join(cuisines) + ".")
    if est.description:
        parts.append(est.description.strip())
    offerings = [o for o in est.offerings if o.is_available]
    sections = list(dict.fromkeys(o.section for o in offerings if o.section))
    if sections:
        parts.append("Carta: " + ", ".join(sections) + ".")
    if offerings:
        parts.append("Productos y servicios: " + ", ".join(o.name for o in offerings[:40]) + ".")
    location = ", ".join(p for p in [est.neighborhood, est.municipality.name if est.municipality else None] if p)
    if location:
        parts.append(f"Ubicación: {location}.")
    return " ".join(parts)


def offering_text(offering: Offering, est: Establishment) -> str:
    kind = "Servicio" if offering.kind == "service" else "Producto"
    section = f" ({offering.section})" if offering.section else ""   # "Michelada Hato (Micheladas)"
    text = f"{kind}: {offering.name}{section}. Ofrecido por {est.name}"
    if est.categories:
        text += f" ({', '.join(c.name for c in est.categories)})"
    text += "."
    if offering.description:
        text += f" {offering.description.strip()}"
    return text


def _hash(model_name: str, text: str) -> str:
    return hashlib.sha256(f"{model_name}|{text}".encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------------------
# Sincronización con la base de datos
# --------------------------------------------------------------------------------------

@dataclass
class PendingVector:
    """Un texto que necesita vector nuevo: no tiene, o su texto cambió desde la última vez."""
    entity_type: str
    entity_id: int
    establishment_id: int
    text: str
    content_hash: str


@dataclass
class SyncPlan:
    pending: list[PendingVector]
    obsolete: list[Embedding]   # vectores de productos eliminados o no disponibles


def plan_sync(db: Session, establishments: list[Establishment], model_name: str) -> SyncPlan:
    """Decide qué vectores hay que generar y cuáles borrar, SIN generar ninguno.

    Es la única regla de "qué está desactualizado": la usan el script de reindexación, las ediciones del panel
    y el flujo de indexación de n8n (que pide esta lista a FastAPI y guarda los vectores él mismo).
    """
    if not establishments:
        return SyncPlan([], [])
    est_ids = [e.id for e in establishments]
    existing = {
        (e.entity_type, e.entity_id): e
        for e in db.scalars(select(Embedding).where(Embedding.establishment_id.in_(est_ids)))
    }
    pending: list[PendingVector] = []
    keep: set[tuple[str, int]] = set()
    for est in establishments:
        entries = [("establishment", est.id, establishment_text(est))]
        entries += [("offering", o.id, offering_text(o, est)) for o in est.offerings if o.is_available]
        for entity_type, entity_id, text in entries:
            keep.add((entity_type, entity_id))
            content_hash = _hash(model_name, text)
            current = existing.get((entity_type, entity_id))
            if current is None or current.content_hash != content_hash:
                pending.append(PendingVector(entity_type, entity_id, est.id, text, content_hash))
    obsolete = [emb for key, emb in existing.items() if key not in keep]
    return SyncPlan(pending, obsolete)


def sync_establishments(db: Session, establishments: list[Establishment], embedder: Embedder) -> int:
    """Crea o actualiza los vectores de los establecimientos dados y de sus productos/servicios.

    Solo recalcula lo que cambió. Devuelve cuántos vectores se generaron.
    """
    plan = plan_sync(db, establishments, embedder.model_name)
    for emb in plan.obsolete:
        db.delete(emb)

    if plan.pending:
        existing = {
            (e.entity_type, e.entity_id): e
            for e in db.scalars(select(Embedding).where(
                Embedding.establishment_id.in_({p.establishment_id for p in plan.pending})))
        }
        vectors = embedder.encode_passages([p.text for p in plan.pending])
        now = datetime.now(timezone.utc)
        for p, vector in zip(plan.pending, vectors):
            emb = existing.get((p.entity_type, p.entity_id))
            if emb is None:
                emb = Embedding(entity_type=p.entity_type, entity_id=p.entity_id)
                db.add(emb)
            emb.establishment_id = p.establishment_id
            emb.content = p.text
            emb.content_hash = p.content_hash
            emb.model = embedder.model_name
            emb.embedding = vector
            emb.updated_at = now
    db.flush()
    return len(plan.pending)


def delete_establishment_embeddings(db: Session, establishment_id: int) -> None:
    db.execute(delete(Embedding).where(Embedding.establishment_id == establishment_id))
