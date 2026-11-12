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
