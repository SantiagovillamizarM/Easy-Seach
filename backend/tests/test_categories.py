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
