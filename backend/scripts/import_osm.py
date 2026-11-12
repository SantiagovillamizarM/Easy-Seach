"""Importa establecimientos, municipios y barrios REALES desde OpenStreetMap (Overpass API).

Uso (desde la carpeta backend):
    .\\.venv\\Scripts\\python -m scripts.import_osm                 # los 4 municipios del área metropolitana
    .\\.venv\\Scripts\\python -m scripts.import_osm --municipio Piedecuesta
    .\\.venv\\Scripts\\python -m scripts.import_osm --refresh       # ignora la copia local y vuelve a descargar

Se puede ejecutar varias veces: actualiza los registros existentes (por su id de OSM) sin duplicarlos.
Los establecimientos editados por propietarios o administradores (source distinto de "osm") NO se
sobrescriben.

Datos © colaboradores de OpenStreetMap, licencia ODbL (https://www.openstreetmap.org/copyright).
"""
import argparse
import json
import sys
import time
from pathlib import Path

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.text import normalize, slugify
from app.data.categories import categories_for_tags, ensure_categories
from app.db.session import SessionLocal
from app.models import Establishment, Place

# Municipios del área metropolitana de Bucaramanga: nombre -> id de la relación administrativa en OSM
MUNICIPALITIES: dict[str, int] = {
    "Bucaramanga": 1423498,
    "Floridablanca": 1423451,
    "Girón": 1423476,
    "Piedecuesta": 1423480,
}
DEPARTMENT = "Santander"

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "osm_cache"
USER_AGENT = "EasySearch/0.1 (proyecto academico; importacion de datos OSM)"

AMENITIES = (
    "restaurant|fast_food|cafe|bar|pub|nightclub|biergarten|ice_cream|food_court|pharmacy|fuel|"
    "car_wash|veterinary|clinic|doctors|dentist|hospital"
)


def build_query(relation_id: int) -> str:
    area_id = 3_600_000_000 + relation_id  # convención de Overpass para convertir relación en área
    return f"""
[out:json][timeout:180];
area({area_id})->.a;
(
  nwr(area.a)["name"]["amenity"~"^({AMENITIES})$"];
  nwr(area.a)["name"]["shop"];
  nwr(area.a)["name"]["craft"];
);
out tags center;
node(area.a)["name"]["place"~"^(city|town|village|suburb|neighbourhood|quarter)$"];
out body;
rel({relation_id});
out tags center;
"""


def fetch_overpass(query: str) -> dict:
    """Consulta Overpass probando varios servidores con espera exponencial entre intentos."""
    urls = get_settings().overpass_urls_list
    wait = 5
    last_error = ""
    for attempt in range(1, 5):
        for url in urls:
            try:
                print(f"  → Consultando {url} (intento {attempt})…")
                r = httpx.post(url, data={"data": query}, headers={"User-Agent": USER_AGENT}, timeout=240)
                if r.status_code == 200 and r.text.lstrip().startswith("{"):
                    return r.json()
                last_error = f"HTTP {r.status_code}: {r.text[:100]!r}"
            except httpx.HTTPError as exc:
                last_error = f"{exc.__class__.__name__}: {exc}"
            print(f"    ✗ {last_error}")
        print(f"  Todos los servidores ocupados. Esperando {wait} s…")
        time.sleep(wait)
        wait *= 2
    raise RuntimeError(f"No se pudo consultar Overpass. Último error: {last_error}")


def load_data(name: str, relation_id: int, refresh: bool) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{slugify(name)}.json"
    if cache_file.exists() and not refresh:
        print(f"  Usando copia local {cache_file.name} (usa --refresh para descargar de nuevo)")
        return json.loads(cache_file.read_text(encoding="utf-8"))
    data = fetch_overpass(build_query(relation_id))
    cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def coords(element: dict) -> tuple[float, float] | None:
    if "lat" in element:
        return element["lat"], element["lon"]
    if "center" in element:
        return element["center"]["lat"], element["center"]["lon"]
    return None


def first(tags: dict, *keys: str) -> str | None:
    for k in keys:
        value = tags.get(k)
        if value and value.strip():
            return value.strip()[:300]
    return None


def build_address(tags: dict) -> str | None:
    if tags.get("addr:full"):
        return tags["addr:full"].strip()[:300]
    street = tags.get("addr:street", "").strip()
    number = tags.get("addr:housenumber", "").strip()
    address = f"{street} # {number}" if street and number else street
    return address[:300] or None


def upsert_place(db: Session, *, osm_type: str, osm_id: int, name: str, kind: str,
                 lat: float, lng: float, parent_id: int | None) -> Place:
    place = db.scalar(select(Place).where(Place.osm_type == osm_type, Place.osm_id == osm_id))
    if place is None:
        place = Place(osm_type=osm_type, osm_id=osm_id)
        db.add(place)
    place.name = name
    place.normalized_name = normalize(name)
    place.kind = kind
    place.latitude = lat
    place.longitude = lng
    place.parent_id = parent_id
    place.department = DEPARTMENT
    db.flush()
    return place


def unique_slug(db: Session, base: str, current_id: int | None) -> str:
    slug, n = base, 2
    while True:
        other = db.scalar(select(Establishment.id).where(Establishment.slug == slug))
        if other is None or other == current_id:
            return slug
        slug = f"{base}-{n}"
        n += 1


def import_municipality(db: Session, name: str, relation_id: int, refresh: bool, categories: dict) -> dict:
    print(f"\n=== {name} ===")
    data = load_data(name, relation_id, refresh)
    elements = data.get("elements", [])

    relation = next((e for e in elements if e["type"] == "relation" and e["id"] == relation_id), None)
    place_nodes = [e for e in elements if e["type"] == "node" and "place" in e.get("tags", {})]
    pois = [e for e in elements if e["type"] != "relation" and "place" not in e.get("tags", {})]

    # 1. Municipio: preferimos el nodo del casco urbano (city/town); si no, el centro de la relación.
    town = next(
        (n for n in place_nodes
         if n["tags"].get("place") in {"city", "town", "village"} and normalize(n["tags"]["name"]) == normalize(name)),
        None,
    )
    position = (coords(town) if town else None) or (coords(relation) if relation else None)
    if position is None:
        raise RuntimeError(f"OSM no devolvió coordenadas para {name}")
    lat, lng = position
    municipality = upsert_place(db, osm_type="relation", osm_id=relation_id, name=name, kind="municipio",
                                lat=lat, lng=lng, parent_id=None)

    # 2. Barrios
    barrios = 0
    for node in place_nodes:
        if node["tags"].get("place") in {"suburb", "neighbourhood", "quarter"} and "lat" in node:
            upsert_place(db, osm_type="node", osm_id=node["id"], name=node["tags"]["name"][:200], kind="barrio",
                         lat=node["lat"], lng=node["lon"], parent_id=municipality.id)
            barrios += 1

    # 3. Establecimientos
    created = updated = skipped = 0
    for el in pois:
        tags = el.get("tags", {})
        position = coords(el)
        slugs = categories_for_tags(tags)
        if position is None or not slugs:
            skipped += 1
            continue

        est = db.scalar(select(Establishment).where(Establishment.osm_type == el["type"],
                                                    Establishment.osm_id == el["id"]))
        if est is not None and est.source != "osm":
            skipped += 1  # editado por un propietario/admin: no se sobrescribe
            continue
        if est is None:
            est = Establishment(osm_type=el["type"], osm_id=el["id"], source="osm")
            db.add(est)
            created += 1
        else:
            updated += 1

        est.name = tags["name"].strip()[:200]
        est.slug = unique_slug(db, slugify(f"{est.name} {name}"), est.id)
        est.description = first(tags, "description:es", "description")
        est.address = build_address(tags)
        est.neighborhood = first(tags, "addr:suburb", "addr:neighbourhood")
        est.municipality_id = municipality.id
        est.latitude, est.longitude = position
        est.phone = first(tags, "phone", "contact:phone", "contact:mobile")
        est.whatsapp = first(tags, "contact:whatsapp")
        est.email = first(tags, "email", "contact:email")
        est.website = first(tags, "website", "contact:website", "url")
        est.instagram = first(tags, "contact:instagram", "instagram")
        est.facebook = first(tags, "contact:facebook", "facebook")
        est.osm_tags = tags
        est.categories = [categories[s] for s in slugs]
        db.flush()

    print(f"  Barrios: {barrios} | Establecimientos nuevos: {created}, actualizados: {updated}, "
          f"omitidos: {skipped}")
    return {"created": created, "updated": updated, "skipped": skipped, "barrios": barrios}


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa datos reales desde OpenStreetMap")
    parser.add_argument("--municipio", choices=list(MUNICIPALITIES), help="Importar solo un municipio")
    parser.add_argument("--refresh", action="store_true", help="Descargar de nuevo aunque exista copia local")
    args = parser.parse_args()

    targets = {args.municipio: MUNICIPALITIES[args.municipio]} if args.municipio else MUNICIPALITIES
    db = SessionLocal()
    try:
        categories = ensure_categories(db)
        totals = {"created": 0, "updated": 0, "skipped": 0, "barrios": 0}
        for name, relation_id in targets.items():
            result = import_municipality(db, name, relation_id, args.refresh, categories)
            db.commit()  # se guarda municipio por municipio
            for k in totals:
                totals[k] += result[k]
        print(f"\nTOTAL → nuevos: {totals['created']}, actualizados: {totals['updated']}, "
              f"omitidos: {totals['skipped']}, barrios: {totals['barrios']}")
    except Exception as exc:
        db.rollback()
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
