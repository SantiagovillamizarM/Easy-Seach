"""Carga o completa establecimientos desde un archivo CSV (se puede editar en Excel).

Uso (desde la carpeta backend):
    .\\.venv\\Scripts\\python -m scripts.import_csv                    # carga data\\locales_easysearch.csv
    .\\.venv\\Scripts\\python -m scripts.import_csv --dry-run          # solo valida
    .\\.venv\\Scripts\\python -m scripts.import_csv data\\otro.csv      # otro archivo

Cómo se identifica cada fila (se puede ejecutar varias veces: nunca duplica):
- `osm` (ej. "node/123456"): local que vino de OpenStreetMap. Es el identificador PERMANENTE: igual en
  cualquier computadora. (El slug de un local de OSM puede cambiar según el orden de importación.)
- `slug`: si existe, se ACTUALIZA; si no existe y la fila trae nombre, municipio, latitud y longitud,
  se CREA con ese slug (así la próxima vez se actualiza en lugar de duplicarse).
- Sin `osm` ni `slug`: se crea un local nuevo con un slug automático (evítalo en archivos compartidos).
- Solo se cambian las columnas que tienen datos.
- `productos` y `servicios`, si tienen datos, REEMPLAZAN la lista actual.
  Formato: "#Sección|Nombre:precio:descripción|Nombre:precio" (sección, precio y descripción opcionales:
  "Despinche|Alineación:50000"). "#Bebidas" agrupa en esa sección los productos que siguen.
- `horario` usa el formato de OpenStreetMap, ej: "Mo-Fr 08:00-18:00; Sa 08:00-12:00; Su off".
- Las filas con errores se informan y no se guardan; las demás sí.

Ver la guía completa en docs/CARGA_MANUAL.md
"""
import argparse
import csv
import io
import re
import sys
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.text import normalize, slugify
from app.db.session import SessionLocal
from app.models import Category, Establishment, Offering, Place
from app.schemas.catalog import EstablishmentCreate, EstablishmentUpdate
from app.services.catalog import apply_opening_hours_text
from app.services.embeddings import get_embedder, sync_establishments

DEFAULT_FILE = Path(__file__).resolve().parents[1] / "data" / "locales_easysearch.csv"
_OSM_REF = re.compile(r"^(node|way|relation)/(\d+)$")

COLUMNS = [
    "osm", "slug", "nombre", "municipio", "latitud", "longitud", "direccion", "barrio", "descripcion", "categorias",
    "telefono", "whatsapp", "correo", "sitio_web", "instagram", "facebook", "precio_min", "precio_max",
    "nivel_precio", "horario", "productos", "servicios",
]
FIELD_MAP = {  # columna CSV -> campo del modelo
    "nombre": "name", "latitud": "latitude", "longitud": "longitude", "direccion": "address",
    "barrio": "neighborhood", "descripcion": "description", "telefono": "phone", "whatsapp": "whatsapp",
    "correo": "email",
    "sitio_web": "website", "instagram": "instagram", "facebook": "facebook", "precio_min": "price_min",
    "precio_max": "price_max", "nivel_precio": "price_level",
}


class RowError(Exception):
    pass


def parse_offerings(text: str, kind: str) -> list[Offering]:
    """"#Sección|Nombre:precio:descripción|Nombre:precio|Nombre" (precio y descripción opcionales).

    "#Hamburguesas" marca la sección de los productos que siguen (agrupa la carta en pestañas).
    La descripción puede llevar ":" (solo se separan los dos primeros), pero no "|".
    """
    items = []
    section = None
    for part in text.split("|"):
        part = part.strip()
        if not part:
            continue
        if part.startswith("#"):
            section = " ".join(part[1:].split())[:60] or None
            continue
        name, price, description = (part.split(":", 2) + ["", ""])[:3]
        name = name.strip()
        if len(name) < 2:
            raise RowError(f"Nombre de {kind} inválido: '{part}'")
        value = None
        if price.strip():
            try:
                value = Decimal(price.strip().replace(".", "").replace(",", "").replace("$", "").replace(" ", ""))
            except InvalidOperation:
                raise RowError(f"Precio inválido en '{part[:60]}' (usa solo números, ej. 22000)")
        items.append(Offering(kind=kind, section=section, name=name[:200], price=value,
                              description=description.strip()[:1000] or None))
    return items


def process_row(db, row: dict, municipalities: dict, categories: dict) -> tuple[str, Establishment]:
    values = {k: (row.get(k) or "").strip() for k in COLUMNS}
    data = {FIELD_MAP[k]: v for k, v in values.items() if k in FIELD_MAP and v}

    muni = None
    if values["municipio"]:
        muni = municipalities.get(normalize(values["municipio"]))
        if muni is None:
            raise RowError(f"Municipio desconocido: '{values['municipio']}'")
        data["municipality_id"] = muni.id

    cat_list = []
    if values["categorias"]:
        for slug in values["categorias"].split("|"):
            cat = categories.get(slug.strip())
            if cat is None:
                raise RowError(f"Categoría desconocida: '{slug.strip()}' (ver docs/CARGA_MANUAL.md)")
            cat_list.append(cat)

    est = None
    with_offerings = select(Establishment).options(selectinload(Establishment.offerings))
    if values["osm"]:
        ref = _OSM_REF.match(values["osm"].lower())
        if ref is None:
            raise RowError(f"Referencia OSM inválida: '{values['osm']}' (formato: node/123 o way/123)")
        est = db.scalar(with_offerings.where(Establishment.osm_type == ref[1], Establishment.osm_id == int(ref[2])))
        if est is None:
            raise RowError(f"No existe el local de OpenStreetMap {values['osm']} (¿ya ejecutaste import_osm?)")
    elif values["slug"]:
        est = db.scalar(with_offerings.where(Establishment.slug == values["slug"]))
        if est is None and not (values["nombre"] and values["municipio"] and values["latitud"] and values["longitud"]):
            raise RowError(f"No existe '{values['slug']}'. Para crearlo, la fila necesita nombre, municipio, "
                           "latitud y longitud")

    try:
        if est is not None:
            validated = EstablishmentUpdate(**data).model_dump(exclude_unset=True)
            new_min = validated.get("price_min", est.price_min)
            new_max = validated.get("price_max", est.price_max)
            if new_min is not None and new_max is not None and new_min > new_max:
                raise RowError("precio_min no puede ser mayor que precio_max")
            for field, value in validated.items():
                setattr(est, field, value)
            action = "actualizado"
        else:
            validated = EstablishmentCreate(**data).model_dump(exclude={"category_ids"})
            est = Establishment(**validated)
            if values["slug"]:
                slug = slugify(values["slug"])  # slug fijo: la próxima carga actualiza en vez de duplicar
                if slug != values["slug"]:
                    raise RowError(f"Slug inválido '{values['slug']}': usa solo minúsculas, números y guiones "
                                   f"(ej. '{slug}')")
            else:
                base = slugify(f"{validated['name']} {muni.name}")
                slug, n = base, 2
                while db.scalar(select(Establishment.id).where(Establishment.slug == slug)):
                    slug, n = f"{base}-{n}", n + 1
            est.slug = slug
            db.add(est)
            action = "creado"
    except ValidationError as exc:
        raise RowError("; ".join(
            (f"{e['loc'][0]}: " if e["loc"] else "") + e["msg"].removeprefix("Value error, ")
            for e in exc.errors()
        ))

    est.source = "manual"  # la importación de OSM ya no sobrescribirá estos datos
    if cat_list:
        est.categories = cat_list
    if values["horario"]:
        if not apply_opening_hours_text(est, values["horario"]):
            raise RowError(f"Horario con formato no reconocido: '{values['horario']}'")
        est.hours_verified_at = datetime.now(timezone.utc)
    new_offerings = []
    if values["productos"]:
        new_offerings += parse_offerings(values["productos"], "product")
    if values["servicios"]:
        new_offerings += parse_offerings(values["servicios"], "service")
    if new_offerings:
        est.offerings = new_offerings
    db.flush()
    return action, est


def read_rows(path: Path) -> list[dict]:
    """Lee el CSV. Separador coma o punto y coma (Excel en español usa ";"); comillas dobles estándar.

    No se usa csv.Sniffer: "adivinaba" mal las comillas con textos como "Garrotero's" y partía las
    descripciones que tienen comas.
    """
    text = path.read_text(encoding="utf-8-sig")  # utf-8-sig: soporta archivos guardados por Excel
    header = text.split("\n", 1)[0]
    delimiter = ";" if header.count(";") > header.count(",") else ","
    return list(csv.DictReader(io.StringIO(text), delimiter=delimiter))


def main() -> None:
    parser = argparse.ArgumentParser(description="Carga establecimientos desde CSV")
    parser.add_argument("archivo", type=Path, nargs="?", default=DEFAULT_FILE,
                        help="CSV a cargar (por defecto data/locales_easysearch.csv, el del proyecto)")
    parser.add_argument("--dry-run", action="store_true", help="Solo validar, no guardar nada")
    args = parser.parse_args()

    if not args.archivo.exists():
        sys.exit(f"No existe el archivo {args.archivo}")
    rows = read_rows(args.archivo)
    if not rows:
        print(f"{args.archivo.name} no tiene locales todavía (solo encabezados). Nada que cargar.")
        return
    missing = [c for c in ("slug", "nombre") if c not in rows[0].keys()]
    if missing:
        sys.exit(f"Faltan columnas en el CSV: {missing}. Usa la plantilla data/plantilla_establecimientos.csv")

    db = SessionLocal()
    embedder = get_embedder()
    ok, errors, touched = 0, 0, []
    try:
        municipalities = {p.normalized_name: p for p in db.scalars(select(Place).where(Place.kind == "municipio"))}
        categories = {c.slug: c for c in db.scalars(select(Category))}
        for line_no, row in enumerate(rows, start=2):  # línea 1 = encabezados
            if not any((v or "").strip() for v in row.values()):
                continue
            savepoint = db.begin_nested()
            try:
                action, est = process_row(db, row, municipalities, categories)
                savepoint.commit()
                touched.append(est)
                ok += 1
                print(f"  ✓ Línea {line_no}: {est.name} ({action}) → slug: {est.slug}")
            except RowError as exc:
                savepoint.rollback()
                errors += 1
                print(f"  ✗ Línea {line_no}: {exc}")

        if args.dry_run:
            db.rollback()
            print(f"\nVALIDACIÓN (no se guardó nada): {ok} filas correctas, {errors} con errores.")
            return
        print("\nGenerando embeddings…")
        for est in touched:
            db.refresh(est)
        sync_establishments(db, touched, embedder)
        db.commit()
        print(f"Listo: {ok} filas guardadas, {errors} con errores.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
