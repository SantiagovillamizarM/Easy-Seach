"""Fase 1: equivalencia de etiquetas de OpenStreetMap con categorías de Easy Search."""
from app.core.text import normalize, slugify
from app.data.categories import categories_for_tags


def test_osm_tags_to_categories():
    assert categories_for_tags({"amenity": "fast_food"}) == ["comida-rapida"]
    assert categories_for_tags({"shop": "tyres"}) == ["llantas"]
    assert categories_for_tags({"shop": "car_repair"}) == ["talleres-mecanicos"]
    assert categories_for_tags({"amenity": "pharmacy"}) == ["farmacias"]


def test_unknown_shop_goes_to_otros_and_vacant_is_ignored():
    assert categories_for_tags({"shop": "algo_raro"}) == ["otros-comercios"]
    assert categories_for_tags({"shop": "vacant"}) == []
    assert categories_for_tags({"craft": "locksmith"}) == ["oficios"]


def test_text_helpers():
    assert normalize("  Girón,   SANTANDER ") == "giron, santander"
    assert slugify("Hamburguesas Ñoño – Cabecera") == "hamburguesas-nono-cabecera"


def test_schools_are_no_longer_imported_and_existing_ones_are_hidden(db):
    """Colegios y jardines tapaban los cursos y academias: no se importan, y los que había se ocultan."""
    from app.models import Establishment, Place
    from scripts.import_osm import hide_unmatched

    assert categories_for_tags({"amenity": "school"}) == []
    assert categories_for_tags({"amenity": "kindergarten"}) == []
    assert categories_for_tags({"amenity": "language_school"}) == ["educacion"]

    town = Place(name="Pueblo", normalized_name="pueblo", kind="municipio", latitude=7.1, longitude=-73.1)
    db.add(town)
    db.flush()

    def est(slug, tags, source="osm"):
        e = Establishment(name=slug, slug=slug, municipality_id=town.id, latitude=7.1, longitude=-73.1,
                          source=source, osm_tags=tags)
        db.add(e)
        return e

    school = est("colegio-x", {"amenity": "school"})
    edited = est("colegio-editado", {"amenity": "school"}, source="manual")   # editado a mano: no se toca
    academy = est("academia-ingles", {"amenity": "language_school"})
    block = est("K", {"amenity": "college"})                                  # bloque de un campus
    d1 = est("D1", {"shop": "supermarket"})                                   # nombre corto pero real
    db.flush()
    assert hide_unmatched(db, town.id) == 2
    assert (school.status, edited.status, academy.status) == ("hidden", "active", "active")
    assert (block.status, d1.status) == ("hidden", "active")


def test_same_place_drawn_twice_in_osm_is_marked_duplicate(db):
    """Una Terpel con cada isla de surtidores dibujada aparte: se conserva la de más datos."""
    from app.models import DuplicateDismissal, Establishment, Place
    from scripts.import_osm import mark_duplicates

    town = Place(name="Pueblo", normalized_name="pueblo", kind="municipio", latitude=7.1, longitude=-73.1)
    db.add(town)
    db.flush()

    def est(slug, name, lat, lng, source="osm", **kw):
        e = Establishment(name=name, slug=slug, municipality_id=town.id, latitude=lat, longitude=lng,
                          source=source, **kw)
        db.add(e)
        db.flush()
        return e

    rich = est("terpel-a", "Terpel", 7.10000, -73.10000, phone="300 000 0000")
    island = est("terpel-b", "TERPEL", 7.10020, -73.10000)          # ~22 m: la misma estación
    other = est("terpel-c", "Terpel", 7.11000, -73.10000)           # ~1 km: otra estación
    manual = est("cacique-a", "Cacique", 7.12000, -73.10000, source="manual")
    osm_copy = est("cacique-b", "Cacique", 7.12010, -73.10000, address="Calle 1")   # el editado a mano gana
    shop_a = est("cafe-a", "Café", 7.13000, -73.10000)
    shop_b = est("cafe-b", "Café", 7.13030, -73.10000)              # ~33 m, pero un admin dijo que NO son el mismo
    db.add(DuplicateDismissal(establishment_a_id=shop_a.id, establishment_b_id=shop_b.id))
    db.flush()

    assert mark_duplicates(db, town.id) == 2
    assert (island.status, island.duplicate_of_id) == ("duplicate", rich.id)
    assert (osm_copy.status, osm_copy.duplicate_of_id) == ("duplicate", manual.id)
    assert {rich.status, other.status, manual.status, shop_a.status, shop_b.status} == {"active"}
