"""Resolución de ubicaciones escritas por el usuario contra la tabla `places` (datos reales de OSM).

Las coordenadas SIEMPRE salen de la base de datos, nunca de la IA.
"""
import math
import re
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.text import normalize
from app.models import Establishment, Place

# Formas coloquiales de escribir algunos municipios
MUNICIPALITY_ALIASES = {"bga": "bucaramanga", "b/manga": "bucaramanga", "bucara": "bucaramanga",
                        "florida": "floridablanca", "piedecuesta": "piedecuesta", "giron": "giron"}

# Un barrio solo se reconoce si viene después de una de estas palabras ("en Cabecera", "barrio La Cumbre"),
# para no confundir barrios como "La Cancha" o "El Refugio" con palabras normales.
_BARRIO_CONTEXT = r"(?:en|barrio|por|cerca a|cerca de|cerca del|sector|zona de|zona)\s+(?:el |la |los |las )?"


@dataclass
class ResolvedPlace:
    id: int
    name: str
    kind: str              # municipio | barrio
    municipality_id: int   # el mismo id si es municipio; el padre si es barrio
    municipality_name: str
    latitude: float
    longitude: float
    matched_text: str


def _aliases(place: Place) -> set[str]:
    """Variantes de un nombre: 'Barrio Palermo I, Comuna de Guatiguará' -> {'palermo i', ...}."""
    base = normalize(place.name)
    names = {base, base.split(",")[0].strip()}
    for prefix in ("barrio ", "urbanizacion ", "conjunto ", "sector ", "comuna de ", "comuna del ", "comuna "):
        names |= {n.removeprefix(prefix).strip() for n in names}
    # Forma corta: "cabecera del llano" -> "cabecera"
    if place.kind == "barrio":
        names |= {re.split(r" (?:del|de la|de los|de) ", n)[0] for n in names}
    return {n for n in names if len(n) >= 4}


def _load(db: Session) -> tuple[list[tuple[str, Place]], dict[int, Place]]:
    places = list(db.scalars(select(Place)))
    by_id = {p.id: p for p in places}
    municipality_names = {p.normalized_name for p in places if p.kind == "municipio"}
    # Prioridad entre municipios: el que tiene más establecimientos (resuelve nombres repetidos en OSM)
    sizes = dict(db.execute(
        select(Establishment.municipality_id, func.count()).group_by(Establishment.municipality_id)).all())

    def muni_size(p: Place) -> int:
        return sizes.get(p.id if p.kind == "municipio" else p.parent_id, 0)

    entries = [
        (alias, p) for p in places for alias in _aliases(p)
        # Un "barrio" con el mismo nombre del municipio (ej. sector "Bucaramanga") se ignora
        if not (p.kind == "barrio" and alias in municipality_names)
    ]
    # Primero los nombres más largos ("san francisco" antes que "san") y luego el municipio más grande
    entries.sort(key=lambda e: (-len(e[0]), -muni_size(e[1])))
    return entries, by_id


def _to_resolved(place: Place, by_id: dict[int, Place], matched: str) -> ResolvedPlace:
    muni = place if place.kind == "municipio" else by_id.get(place.parent_id, place)
    return ResolvedPlace(place.id, place.name, place.kind, muni.id, muni.name,
                         place.latitude, place.longitude, matched)


def find_place_in_text(db: Session, text: str) -> ResolvedPlace | None:
    """Busca un municipio o barrio mencionado dentro de un texto libre."""
    norm = normalize(text)
    entries, by_id = _load(db)

    for alias, target in MUNICIPALITY_ALIASES.items():
        if re.search(rf"(?<![\w/]){re.escape(alias)}(?!\w)", norm):
            norm = re.sub(rf"(?<![\w/]){re.escape(alias)}(?!\w)", target, norm)

    # 1) Municipios: en cualquier parte del texto
    for alias, place in entries:
        if place.kind == "municipio" and re.search(rf"\b{re.escape(alias)}\b", norm):
            municipio = _to_resolved(place, by_id, alias)
            # ¿Además menciona un barrio de ese municipio? Es más preciso.
            barrio = _find_barrio(norm, entries, by_id, municipality_id=place.id)
            return barrio or municipio
    # 2) Barrios: solo con una palabra de contexto delante
    return _find_barrio(norm, entries, by_id)


def _find_barrio(norm: str, entries, by_id, municipality_id: int | None = None) -> ResolvedPlace | None:
    for alias, place in entries:
        if place.kind != "barrio":
            continue
        if municipality_id is not None and place.parent_id != municipality_id:
            continue
        if re.search(rf"{_BARRIO_CONTEXT}{re.escape(alias)}\b", norm):
            return _to_resolved(place, by_id, alias)
    return None


def resolve_place_name(db: Session, name: str) -> ResolvedPlace | None:
    """Resuelve un nombre de lugar ya aislado (ej. el que extrajo la IA: 'Cabecera del Llano')."""
    norm = normalize(name)
    norm = MUNICIPALITY_ALIASES.get(norm, norm)
    entries, by_id = _load(db)
    for kind in ("municipio", "barrio"):
        for alias, place in entries:
            if place.kind == kind and alias == norm:
                return _to_resolved(place, by_id, alias)
    # Coincidencia parcial ("cabecera" -> "Cabecera Del Llano")
    for kind in ("municipio", "barrio"):
        for alias, place in entries:
            if place.kind == kind and re.search(rf"\b{re.escape(norm)}\b", alias) and len(norm) >= 4:
                return _to_resolved(place, by_id, alias)
    return None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia en kilómetros entre dos coordenadas (fórmula de Haversine)."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bounding_box(lat: float, lon: float, radius_km: float) -> tuple[float, float, float, float]:
    """Rectángulo aproximado alrededor de un punto (prefiltro rápido antes de la distancia exacta)."""
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    return lat - dlat, lat + dlat, lon - dlon, lon + dlon
