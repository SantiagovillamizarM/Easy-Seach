"""Carga o completa establecimientos desde un archivo CSV (se puede editar en Excel).

Uso (desde la carpeta backend):
    .\\.venv\\Scripts\\python -m scripts.import_csv data\\mis_negocios.csv --dry-run   # solo valida
    .\\.venv\\Scripts\\python -m scripts.import_csv data\\mis_negocios.csv             # guarda

- Si la columna `slug` tiene valor, se ACTUALIZA ese establecimiento (solo las columnas con datos).
- Si `slug` está vacío, se CREA uno nuevo (requiere nombre, municipio, latitud y longitud).
- `productos` y `servicios`, si tienen datos, REEMPLAZAN la lista actual. Formato: "Nombre:precio|Nombre:precio"
  (el precio es opcional: "Despinche|Alineación:50000").
- `horario` usa el formato de OpenStreetMap, ej: "Mo-Fr 08:00-18:00; Sa 08:00-12:00; Su off".
- Las filas con errores se informan y no se guardan; las demás sí.

Ver la guía completa en docs/CARGA_MANUAL.md
"""
import argparse
import csv
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

COLUMNS = [
    "slug", "nombre", "municipio", "latitud", "longitud", "direccion", "barrio", "descripcion", "categorias",
    "telefono", "whatsapp", "sitio_web", "instagram", "facebook", "precio_min", "precio_max", "nivel_precio",
    "horario", "productos", "servicios",
]
FIELD_MAP = {  # columna CSV -> campo del modelo
    "nombre": "name", "latitud": "latitude", "longitud": "longitude", "direccion": "address",
    "barrio": "neighborhood", "descripcion": "description", "telefono": "phone", "whatsapp": "whatsapp",
    "sitio_web": "website", "instagram": "instagram", "facebook": "facebook", "precio_min": "price_min",
    "precio_max": "price_max", "nivel_precio": "price_level",
}


class RowError(Exception):
    pass


def parse_offerings(text: str, kind: str) -> list[Offering]:
    items = []
    for part in text.split("|"):
        part = part.strip()
        if not part:
            continue
        name, _, price = part.rpartition(":") if ":" in part else (part, "", "")
        name = name.strip()
        if len(name) < 2:
            raise RowError(f"Nombre de {kind} inválido: '{part}'")
        value = None
        if price.strip():
            try:
                value = Decimal(price.strip().replace(".", "").replace("$", "").replace(" ", ""))
            except InvalidOperation:
                raise RowError(f"Precio inválido en '{part}' (usa solo números, ej. 22000)")
        items.append(Offering(kind=kind, name=name[:200], price=value))
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

    try:
        if values["slug"]:
            est = db.scalar(select(Establishment).options(selectinload(Establishment.offerings))
                            .where(Establishment.slug == values["slug"]))
            if est is None:
                raise RowError(f"No existe un establecimiento con slug '{values['slug']}'")
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Carga establecimientos desde CSV")
    parser.add_argument("archivo", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="Solo validar, no guardar nada")
    args = parser.parse_args()

    if not args.archivo.exists():
        sys.exit(f"No existe el archivo {args.archivo}")
    text = args.archivo.read_text(encoding="utf-8-sig")  # utf-8-sig: soporta archivos guardados por Excel
    dialect = csv.Sniffer().sniff(text.splitlines()[0], delimiters=",;")
    rows = list(csv.DictReader(text.splitlines(), dialect=dialect))
    missing = [c for c in ("slug", "nombre") if c not in (rows[0].keys() if rows else [])]
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
