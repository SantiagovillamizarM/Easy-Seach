"""Importador CSV de locales: identificación estable (osm / slug fijo) y cargas repetidas sin duplicar."""
import pytest
from sqlalchemy import func, select

from app.models import Category, Establishment, Place
from scripts.import_csv import RowError, process_row


@pytest.fixture()
def ctx(db):
    muni = Place(name="Floridablanca", normalized_name="floridablanca", kind="municipio", latitude=7.06, longitude=-73.09)
    cat = Category(name="Comida rápida", slug="comida-rapida")
    db.add_all([muni, cat])
    db.flush()
    osm = Establishment(name="Terpel", slug="terpel-floridablanca-3", municipality_id=muni.id, latitude=7.06,
                        longitude=-73.09, source="osm", osm_type="node", osm_id=987654)
    db.add(osm)
    db.flush()
    return {"municipalities": {"floridablanca": muni}, "categories": {"comida-rapida": cat}, "osm": osm}


def _row(**values):
    return {k: values.get(k, "") for k in ("osm", "slug", "nombre", "municipio", "latitud", "longitud", "descripcion",
                                           "categorias", "precio_min", "precio_max", "productos", "horario")}


def _run(db, ctx, row):
    return process_row(db, row, ctx["municipalities"], ctx["categories"])


NEW = _row(slug="burger-house-floridablanca", nombre="Burger House", municipio="Floridablanca",
           latitud="7.0612", longitud="-73.0951", categorias="comida-rapida", precio_min="15000",
           descripcion="Hamburguesas artesanales a la parrilla", productos="Hamburguesa sencilla:15000|Combo doble:25000",
           horario="Mo-Sa 11:00-22:00; Su off")


def test_new_local_with_fixed_slug_is_idempotent(db, ctx):
    action, est = _run(db, ctx, NEW)
    assert action == "creado" and est.slug == "burger-house-floridablanca" and est.source == "manual"
    assert [o.name for o in est.offerings] == ["Hamburguesa sencilla", "Combo doble"]
    assert est.opening_hours and est.categories[0].slug == "comida-rapida"

    # Cargar el mismo archivo otra vez (o en otra computadora) actualiza, no duplica
    action, again = _run(db, ctx, {**NEW, "precio_max": "40000"})
    assert action == "actualizado" and again.id == est.id and again.price_max == 40000
    assert db.scalar(select(func.count()).where(Establishment.slug.like("burger-house%"))) == 1
    assert len(again.offerings) == 2


def test_osm_reference_updates_the_right_local(db, ctx):
    action, est = _run(db, ctx, _row(osm="node/987654", descripcion="Estación con tienda y baños"))
    assert action == "actualizado" and est.id == ctx["osm"].id
    assert est.description == "Estación con tienda y baños" and est.source == "manual"   # OSM ya no lo sobrescribe
    assert est.name == "Terpel"   # las columnas vacías no se tocan


def test_invalid_rows_are_reported(db, ctx):
    with pytest.raises(RowError, match="No existe el local de OpenStreetMap"):
        _run(db, ctx, _row(osm="way/1"))
    with pytest.raises(RowError, match="formato"):
        _run(db, ctx, _row(osm="nodo-123"))
    with pytest.raises(RowError, match="necesita nombre, municipio"):
        _run(db, ctx, _row(slug="no-existe", descripcion="x"))
    with pytest.raises(RowError, match="Slug inválido"):
        _run(db, ctx, {**NEW, "slug": "Burger House!"})
    with pytest.raises(RowError, match="Precio inválido"):
        _run(db, ctx, {**NEW, "slug": "otro-local", "productos": "Perro:barato"})
