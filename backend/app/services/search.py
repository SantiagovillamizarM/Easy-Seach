"""Motor de búsqueda híbrida de Easy Search.

Pasos:
1. Interpretar la consulta (IA + reglas) → necesidad, lugar, presupuesto, filtros.
2. Resolver la ubicación (texto → tabla de lugares; "cerca" → GPS del navegador si lo autorizó).
3. Generar el embedding de la necesidad.
4. En PostgreSQL, con los MISMOS filtros SQL:
   a) búsqueda vectorial con pgvector (índice HNSW + iterative scan),
   b) búsqueda por palabras (full-text en español).
5. Fusionar ambos rankings con Reciprocal Rank Fusion (RRF) y sumar ajustes por categoría,
   calificación, cercanía y presupuesto.
6. Calcular horario (abierto/cerrado) y aplicar el filtro "abierto ahora".
"""
import re
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import desc, func, select, text
from sqlalchemy.orm import Session

from app.data.categories import CATEGORIES, related_categories
from app.core.text import normalize
from app.models import Category, Embedding, Establishment, Place
from app.services.catalog import LOAD_OPTIONS, hours_status
from app.services.embeddings import Embedder
from app.services.llm import LLMProvider
from app.services.places import ResolvedPlace, bounding_box, find_place_in_text, haversine_km, resolve_place_name
from app.services.query_parser import QueryIntent, parse_query

RRF_K = 60
UNIT = 1 / (RRF_K + 1)       # aporte máximo de UNA lista en RRF; los ajustes se expresan en esta escala
VECTOR_CANDIDATES = 150
TEXT_CANDIDATES = 100
NEAR_ME_RADIUS_KM = 3.0
NEAR_ME_WIDE_RADIUS_KM = 8.0
GPS_SOFT_RADIUS_KM = 25.0

# Palabras demasiado generales para la búsqueda por texto (coinciden con casi todo).
# La búsqueda semántica sí las aprovecha.
GENERIC_KEYWORDS = {
    "comida", "comidas", "comer", "restaurante", "restaurantes", "sitio", "lugar", "lugares", "rico", "rica",
    "servicio", "servicios", "tienda", "tiendas", "negocio", "establecimiento", "algo", "bueno", "buena",
    "cosa", "cosas", "producto", "productos", "comprar", "venta", "empresa",
}


@dataclass
class SearchParams:
    q: str
    latitude: float | None = None        # GPS del usuario (solo si lo autorizó)
    longitude: float | None = None
    place_id: int | None = None          # lugar elegido en el filtro de la interfaz
    radius_km: float | None = None
    budget_min: int | None = None
    budget_max: int | None = None
    min_rating: float | None = None
    category: str | None = None
    open_now: bool | None = None
    limit: int = 10
    now: datetime | None = None          # para pruebas


@dataclass
class LocationInfo:
    label: str
    kind: str                            # municipio | barrio | gps
    source: str                          # texto | filtro | gps
    radius_km: float | None = None


@dataclass
class SearchHit:
    establishment: Establishment
    score: float
    similarity: float | None
    text_match: bool
    matched_text: str | None
    distance_km: float | None
    budget_fit: str                      # dentro | desconocido
    relevance: str                       # alta | relacionada
    hours: dict = field(default_factory=dict)


@dataclass
class SearchResult:
    intent: QueryIntent
    location: LocationInfo | None
    needs_location: bool
    notices: list[str]
    hits: list[SearchHit]
    applied_filters: dict


# ======================================================================================

def _resolve_location(db: Session, params: SearchParams, intent: QueryIntent, detected: ResolvedPlace | None):
    """Devuelve (lugar, centro (lat, lon), radio_duro_km, info, necesita_ubicacion, avisos)."""
    notices: list[str] = []
    has_gps = params.latitude is not None and params.longitude is not None

    if params.place_id:
        place = db.get(Place, params.place_id)
        if place is not None:
            parent = db.get(Place, place.parent_id) if place.parent_id else place
            resolved = ResolvedPlace(place.id, place.name, place.kind, parent.id, parent.name,
                                     place.latitude, place.longitude, place.name)
            return resolved, (resolved.latitude, resolved.longitude), params.radius_km, \
                LocationInfo(resolved.name, resolved.kind, "filtro", params.radius_km), False, notices

    location_text = intent.location_text or (detected.matched_text if detected else None)
    if location_text:
        resolved = detected or resolve_place_name(db, location_text)
        if resolved:
            return resolved, (resolved.latitude, resolved.longitude), params.radius_km, \
                LocationInfo(resolved.name, resolved.kind, "texto", params.radius_km), False, notices
        notices.append(f"No encontramos “{location_text}” en nuestra cobertura (área metropolitana de "
                       f"Bucaramanga). Mostramos resultados de toda el área.")

    if intent.near_me:
        if has_gps:
            radius = params.radius_km or NEAR_ME_RADIUS_KM
            return None, (params.latitude, params.longitude), radius, \
                LocationInfo("Tu ubicación", "gps", "gps", radius), False, notices
        notices.append("Para mostrar lo más cercano necesitamos tu ubicación. Activa el permiso de ubicación "
                       "o escribe un municipio o barrio.")
        return None, None, None, None, True, notices

    if has_gps:
        # No pidió un lugar: se priorizan los resultados cercanos a él (sin excluir lejanos dentro del área)
        radius = params.radius_km or GPS_SOFT_RADIUS_KM
        return None, (params.latitude, params.longitude), radius, \
            LocationInfo("Cerca de tu ubicación", "gps", "gps", params.radius_km), False, notices

    return None, None, None, None, False, notices


def _filters(place: ResolvedPlace | None, center, radius_km, budget_min, budget_max, min_rating, category):
    conds = [Establishment.status == "active"]
    if place is not None:
        conds.append(Establishment.municipality_id == place.municipality_id)
    if center is not None and radius_km:
        lat_min, lat_max, lon_min, lon_max = bounding_box(center[0], center[1], radius_km)
        conds += [Establishment.latitude.between(lat_min, lat_max), Establishment.longitude.between(lon_min, lon_max)]
    if budget_max is not None:
        # Se excluye solo lo que SABEMOS que es más caro; si no hay precio, se mantiene (y se avisa)
        conds.append((Establishment.price_min.is_(None)) | (Establishment.price_min <= budget_max))
    if budget_min is not None:
        conds.append((Establishment.price_max.is_(None)) | (Establishment.price_max >= budget_min))
    if min_rating is not None:
        conds.append(Establishment.rating_avg >= min_rating)
    if category:
        conds.append(Establishment.categories.any(Category.slug == category))
    return conds


def _vector_candidates(db: Session, query_vector: list[float], conds) -> dict[int, tuple[float, str, str]]:
    """establishment_id -> (distancia coseno, tipo de coincidencia, texto que coincidió)."""
    # pgvector 0.8: si los filtros descartan vecinos, el índice HNSW sigue buscando hasta completar el límite
    db.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
    db.execute(text("SET LOCAL hnsw.ef_search = 200"))
    distance = Embedding.embedding.cosine_distance(query_vector)
    rows = db.execute(
        select(Embedding.establishment_id, Embedding.entity_type, Embedding.content, distance.label("d"))
        .join(Establishment, Establishment.id == Embedding.establishment_id)
        .where(*conds)
        .order_by(distance)
        .limit(VECTOR_CANDIDATES)
    ).all()
    best: dict[int, tuple[float, str, str]] = {}
    for r in rows:
        if r.establishment_id not in best or r.d < best[r.establishment_id][0]:
            best[r.establishment_id] = (float(r.d), r.entity_type, r.content)
    return best


def _text_candidates(db: Session, keywords: list[str], conds) -> dict[int, float]:
    """establishment_id -> puntaje full-text (español, sin tildes)."""
    words = [w.replace('"', " ").strip() for w in keywords
             if w.strip() and normalize(w.strip()) not in GENERIC_KEYWORDS]
    if not words:
        return {}
    tsquery = func.websearch_to_tsquery("spanish", func.unaccent(" or ".join(words)))
    tsvector = func.to_tsvector("spanish", func.unaccent(Embedding.content))
    rank = func.max(func.ts_rank_cd(tsvector, tsquery))
    rows = db.execute(
        select(Embedding.establishment_id, rank.label("r"))
        .join(Establishment, Establishment.id == Embedding.establishment_id)
        .where(*conds, tsvector.op("@@")(tsquery))
        .group_by(Embedding.establishment_id)
        .order_by(desc("r"))
        .limit(TEXT_CANDIDATES)
    ).all()
    return {r.establishment_id: float(r.r) for r in rows}


def _budget_fit(est: Establishment, budget_max: int | None) -> str:
    if budget_max is None:
        return "desconocido"
    if est.price_max is not None and est.price_max <= budget_max:
        return "dentro"
    if any(o.price is not None and o.price <= budget_max for o in est.offerings if o.is_available):
        return "dentro"
    if est.price_min is not None and est.price_min <= budget_max:
        return "dentro"
    return "desconocido"


def _mentions(text: str, keywords: list[str]) -> bool:
    """¿El texto contiene lo buscado? Compara raíces ("hamburguesas" ~ "hamburguesa") y también dentro de
    palabras compuestas ("frenos" ~ "Unifrenos", "pizza" ~ "Pizzería"). Raíces de menos de 4 letras no cuentan."""
    words = re.findall(r"[a-z0-9ñ]+", normalize(text))
    stems = [normalize(k)[: max(4, len(normalize(k)) - 2)] for k in keywords]
    return any(len(s) >= 4 and s in w for s in stems for w in words)


def _is_business_type(keyword: str) -> bool:
    """"montallantas", "farmacia", "taller"… son TIPOS de negocio (coinciden con el nombre de una categoría):
    eso ya lo resuelven las categorías. "pizza" o "frenos" son cosas concretas que el local debe mencionar."""
    return any(_mentions(name, [keyword]) for name, *_ in CATEGORIES.values())


def _specific_keywords(keywords: list[str]) -> list[str]:
    """Lo que la persona busca en concreto ("pizza", "frenos"): sin genéricas ("lugar") ni tipos de negocio."""
    return [k for k in keywords
            if k.strip() and normalize(k.strip()) not in GENERIC_KEYWORDS and not _is_business_type(k)]


def _own_text(est: Establishment) -> str:
    """Lo que el propio local dice de sí mismo. NO incluye la descripción genérica de la categoría
    ("Hamburguesas, perros, pizza…"): con ella, cualquier local de comida rápida "mencionaría" pizza."""
    parts = [est.name, est.description or "", (est.osm_tags or {}).get("cuisine", "").replace(";", " ").replace("_", " ")]
    parts += [c.name for c in est.categories]
    parts += [f"{o.section or ''} {o.name} {o.description or ''}" for o in est.offerings if o.is_available]
    return " ".join(parts)


def _matched_snippet(entity_type: str, content: str, keywords: list[str]) -> str | None:
    """Etiqueta "Coincide: …" solo si el producto realmente menciona lo buscado.

    Sin esta condición, una coincidencia solo semántica mostraba cosas engañosas
    (buscar "pizza" → "Coincide: Picada clásica", porque las palabras se parecen).
    """
    if entity_type != "offering":
        return None
    snippet = content.split(". Ofrecido por")[0]  # "Producto: Hamburguesa doble (Hamburguesas)"
    return snippet if keywords and _mentions(snippet, keywords) else None


# ======================================================================================

def search(db: Session, params: SearchParams, embedder: Embedder, llm: LLMProvider | None) -> SearchResult:
    detected = find_place_in_text(db, params.q)
    intent = parse_query(params.q, llm, detected.matched_text if detected else None)

    place, center, radius, location, needs_location, notices = _resolve_location(db, params, intent, detected)

    # Los filtros elegidos en la interfaz tienen prioridad sobre lo interpretado del texto
    budget_min = params.budget_min if params.budget_min is not None else intent.budget_min
    budget_max = params.budget_max if params.budget_max is not None else intent.budget_max
    min_rating = params.min_rating if params.min_rating is not None else intent.min_rating
    open_now = params.open_now if params.open_now is not None else intent.open_now
    category = params.category if params.category in CATEGORIES else None
    wanted_categories = set(intent.category_slugs) | ({category} if category else set())
    allowed_categories = related_categories(wanted_categories) if wanted_categories else None

    def run(radius_km):
        conds = _filters(place, center, radius_km, budget_min, budget_max, min_rating, category)
        semantic_text = intent.need + (". " + ", ".join(intent.preferences) if intent.preferences else "")
        vec = _vector_candidates(db, embedder.encode_query(semantic_text), conds)
        lex = _text_candidates(db, intent.keywords, conds)
        return vec, lex

    vec, lex = run(radius)
    # "Cerca de mí" con pocos resultados: se amplía el radio una vez y se avisa
    if location and location.source == "gps" and intent.near_me and len(set(vec) | set(lex)) < 5 \
            and not params.radius_km:
        radius = NEAR_ME_WIDE_RADIUS_KM
        location.radius_km = radius
        vec, lex = run(radius)
        notices.append(f"Había pocos resultados muy cerca; ampliamos la búsqueda a {radius:.0f} km.")

    # ---- Fusión de rankings (RRF) ----
    vec_rank = {eid: i for i, (eid, _) in enumerate(sorted(vec.items(), key=lambda kv: kv[1][0]), start=1)}
    lex_rank = {eid: i for i, (eid, _) in enumerate(sorted(lex.items(), key=lambda kv: -kv[1]), start=1)}
    candidate_ids = set(vec_rank) | set(lex_rank)
    if not candidate_ids:
        return SearchResult(intent, location, needs_location, notices, [], _applied(
            budget_min, budget_max, min_rating, open_now, category))

    ests = {e.id: e for e in db.scalars(select(Establishment).options(*LOAD_OPTIONS)
                                        .where(Establishment.id.in_(candidate_ids)))}
    best_similarity = max((1 - d for d, _, _ in vec.values()), default=0)
    # Si se buscó algo concreto ("pizza") y NINGÚN lugar de la zona lo menciona, los resultados son solo
    # parecidos: no se marcan como relevancia "alta" y se avisa con honestidad.
    specific = _specific_keywords(intent.keywords)
    mentions = {eid: _mentions(_own_text(e), specific) for eid, e in ests.items()} if specific else {}
    nothing_mentions_it = bool(specific) and not any(mentions.values())
    user_point = (params.latitude, params.longitude) if params.latitude is not None else None

    hits: list[SearchHit] = []
    for eid in candidate_ids:
        est = ests.get(eid)
        if est is None:
            continue
        score = 0.0
        if eid in vec_rank:
            score += 1 / (RRF_K + vec_rank[eid])
        if eid in lex_rank:
            score += 1 / (RRF_K + lex_rank[eid])

        est_categories = {c.slug for c in est.categories}
        category_match = bool(wanted_categories & est_categories)
        # Si la consulta pide un tipo de negocio, se descartan los que no son ni afines y que solo
        # "se parecen" semánticamente (ej. una tienda de bebés al buscar llantas).
        if allowed_categories is not None and eid not in lex and not (allowed_categories & est_categories):
            continue
        if category_match:
            score += 0.6 * UNIT
        if est.rating_count and est.rating_avg is not None:
            score += 0.3 * UNIT * float(est.rating_avg) / 5

        distance_center = haversine_km(center[0], center[1], est.latitude, est.longitude) if center else None
        if distance_center is not None and radius and distance_center > radius:
            continue  # el rectángulo es aproximado; aquí se aplica la distancia exacta
        if distance_center is not None:
            if location and location.source == "gps" and not intent.near_me:
                # GPS sin pedir lugar: lo cercano y relevante va primero (fuerte en los primeros ~10 km)
                score += 2.0 * UNIT * max(0.0, 1 - distance_center / 10.0)
            else:
                score += 0.8 * UNIT * max(0.0, 1 - distance_center / (radius or 5.0))

        fit = _budget_fit(est, budget_max)
        if fit == "dentro":
            score += 0.4 * UNIT
        if intent.price_preference == "low" and est.price_level in (1, 2):
            score += 0.3 * UNIT
        if est.is_verified:
            score += 0.1 * UNIT

        similarity = 1 - vec[eid][0] if eid in vec else None
        # Se descartan coincidencias semánticas muy débiles sin ningún otro respaldo
        if eid not in lex and not category_match and similarity is not None and similarity < best_similarity - 0.06:
            continue

        distance_user = (haversine_km(user_point[0], user_point[1], est.latitude, est.longitude)
                         if user_point else None)
        hits.append(SearchHit(
            establishment=est,
            score=score,
            similarity=round(similarity, 4) if similarity is not None else None,
            text_match=eid in lex,
            matched_text=_matched_snippet(vec[eid][1], vec[eid][2], specific) if eid in vec else None,
            distance_km=round(distance_user, 2) if distance_user is not None else None,
            budget_fit=fit,
            # Con algo concreto buscado, "alta" = el local lo menciona (o es del tipo pedido y otros sí lo mencionan)
            relevance=("alta" if (mentions.get(eid) or (category_match and not nothing_mentions_it)) else "relacionada")
            if specific else ("alta" if (eid in lex or category_match) else "relacionada"),
        ))

    hits.sort(key=lambda h: -h.score)
    if nothing_mentions_it and hits:
        where = f" en {location.label}" if location and location.source != "gps" else (" cerca de ti" if location else "")
        wanted = ", ".join(f"«{k}»" for k in specific[:3])
        notices.append(f"Ningún lugar{where} menciona {wanted} en su información. Te mostramos opciones "
                       f"relacionadas; confirma con el lugar antes de ir.")

    # ---- Horario: "abierto ahora" ----
    final: list[SearchHit] = []
    unknown_hours = 0
    for hit in hits:
        status = hours_status(hit.establishment, params.now)
        hit.hours = status.__dict__
        if open_now and status.state != "open":
            unknown_hours += status.state == "unknown"
            continue
        final.append(hit)
        if len(final) >= params.limit:
            break

    if open_now and unknown_hours:
        notices.append(f"Ocultamos {unknown_hours} lugares sin horario registrado porque no podemos confirmar "
                       f"que estén abiertos.")
    if budget_max is not None and any(h.budget_fit == "desconocido" for h in final):
        notices.append("Algunos lugares no tienen precios registrados; verifica el precio antes de ir.")

    return SearchResult(intent, location, needs_location, notices, final,
                        _applied(budget_min, budget_max, min_rating, open_now, category))


def _applied(budget_min, budget_max, min_rating, open_now, category) -> dict:
    return {"budget_min": budget_min, "budget_max": budget_max, "min_rating": min_rating,
            "open_now": open_now, "category": category}
