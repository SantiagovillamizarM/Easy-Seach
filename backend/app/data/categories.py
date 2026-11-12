"""Categorías iniciales de Easy Search y su equivalencia con etiquetas de OpenStreetMap.

Las categorías NO limitan la búsqueda (la búsqueda es semántica); sirven para filtrar,
para mostrar en la interfaz y para enriquecer el texto con el que se generan los embeddings.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category

# slug -> (nombre, descripción, {clave_osm: {valores}})
CATEGORIES: dict[str, tuple[str, str, dict[str, set[str]]]] = {
    "restaurantes": ("Restaurantes", "Restaurantes y comida a la mesa",
                     {"amenity": {"restaurant", "food_court"}}),
    "comida-rapida": ("Comida rápida", "Hamburguesas, perros, pizza, pollo y comidas rápidas",
                      {"amenity": {"fast_food"}}),
    "cafeterias": ("Cafeterías", "Cafés, cafeterías y desayunos", {"amenity": {"cafe"}}),
    "bares": ("Bares", "Bares, pubs y discotecas", {"amenity": {"bar", "pub", "nightclub", "biergarten"}}),
    "heladerias": ("Heladerías", "Helados y postres", {"amenity": {"ice_cream"}}),
    "panaderias": ("Panaderías y pastelerías", "Pan, tortas y repostería",
                   {"shop": {"bakery", "pastry", "confectionery", "chocolate"}}),
    "mercados-tiendas": ("Supermercados y tiendas", "Supermercados, tiendas de barrio, fruvers y carnicerías",
                         {"shop": {"supermarket", "convenience", "greengrocer", "butcher", "seafood", "beverages",
                                   "alcohol", "deli", "general", "kiosk", "variety_store", "department_store",
                                   "dairy", "farm", "frozen_food", "wholesale"}}),
    "centros-comerciales": ("Centros comerciales", "Centros comerciales", {"shop": {"mall"}}),
    "farmacias": ("Farmacias y droguerías", "Medicamentos y productos de farmacia",
                  {"amenity": {"pharmacy"}, "shop": {"chemist"}}),
    "salud": ("Salud", "Clínicas, consultorios, odontología y ópticas",
              {"amenity": {"clinic", "doctors", "dentist", "hospital"},
               "shop": {"optician", "medical_supply", "hearing_aids"}}),
    "mascotas": ("Veterinarias y mascotas", "Veterinarias y tiendas de mascotas",
                 {"amenity": {"veterinary"}, "shop": {"pet", "pet_grooming"}}),
    "talleres-mecanicos": ("Talleres mecánicos", "Mecánica de carros, motos y vehículos de carga",
                           {"shop": {"car_repair", "motorcycle_repair"}, "craft": {"mechanic"}}),
    "llantas": ("Llantas y montallantas", "Venta y reparación de llantas", {"shop": {"tyres"}}),
    "repuestos-vehiculos": ("Repuestos y vehículos", "Repuestos, concesionarios y accesorios para vehículos",
                            {"shop": {"car_parts", "car", "motorcycle", "truck", "motorcycle_parts"}}),
    "estaciones-servicio": ("Estaciones de servicio", "Gasolina, diésel y gas", {"amenity": {"fuel"}}),
    "lavaderos": ("Lavaderos de vehículos", "Lavado de carros y motos", {"amenity": {"car_wash"}}),
    "ferreterias": ("Ferreterías y construcción", "Herramientas, materiales y pinturas",
                    {"shop": {"hardware", "doityourself", "paint", "trade", "glaziery", "building_materials"}}),
    "ropa-calzado": ("Ropa y calzado", "Ropa, zapatos y accesorios",
                     {"shop": {"clothes", "shoes", "boutique", "fashion_accessories", "bag", "jewelry",
                               "watches", "tailor", "fabric", "sewing"}}),
    "belleza": ("Belleza y cuidado personal", "Peluquerías, barberías, spas y cosméticos",
                {"shop": {"hairdresser", "beauty", "cosmetics", "perfumery", "massage", "tattoo"}}),
    "tecnologia": ("Tecnología y celulares", "Celulares, computadores y electrónica",
                   {"shop": {"mobile_phone", "electronics", "computer", "telecommunication"}}),
    "hogar": ("Hogar y muebles", "Muebles, electrodomésticos y decoración",
              {"shop": {"furniture", "houseware", "interior_decoration", "appliance", "bed", "kitchen",
                        "lighting", "curtain", "garden_centre", "florist"}}),
    "papelerias": ("Papelerías y librerías", "Papelería, libros y fotocopias",
                   {"shop": {"stationery", "books", "copyshop", "photo"}}),
    "deportes": ("Deportes y bicicletas", "Artículos deportivos y bicicletas",
                 {"shop": {"sports", "bicycle", "outdoor"}}),
    "oficios": ("Oficios y servicios", "Cerrajería, carpintería, electricistas y otros oficios",
                {"craft": set()}),  # cualquier valor de craft que no tenga otra categoría
    "otros-comercios": ("Otros comercios", "Otros tipos de comercio", {"shop": set()}),  # comodín
}

# Valores de OSM que no representan un comercio útil
IGNORED_SHOP_VALUES = {"vacant", "no", "disused"}


def categories_for_tags(tags: dict[str, str]) -> list[str]:
    """Devuelve los slugs de categoría que corresponden a las etiquetas OSM de un lugar."""
    found: list[str] = []
    for slug, (_name, _desc, mapping) in CATEGORIES.items():
        for key, values in mapping.items():
            value = tags.get(key)
            if value and values and value in values:
                found.append(slug)
    if not found:
        if tags.get("craft"):
            found.append("oficios")
        elif tags.get("shop") and tags["shop"] not in IGNORED_SHOP_VALUES:
            found.append("otros-comercios")
    return found


def ensure_categories(db: Session) -> dict[str, Category]:
    """Crea las categorías que falten y devuelve un diccionario slug -> Category."""
    existing = {c.slug: c for c in db.scalars(select(Category))}
    for slug, (name, description, _mapping) in CATEGORIES.items():
        if slug not in existing:
            category = Category(slug=slug, name=name, description=description)
            db.add(category)
            existing[slug] = category
    db.flush()
    return existing
