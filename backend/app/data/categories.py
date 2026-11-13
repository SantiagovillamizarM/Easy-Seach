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
    "salud": ("Salud", "Clínicas, consultorios, odontología, laboratorios, terapias y ópticas",
              {"amenity": {"clinic", "doctors", "dentist", "hospital"},
               "shop": {"optician", "medical_supply", "hearing_aids"},
               "healthcare": {"laboratory", "physiotherapist", "psychotherapist", "optometrist", "rehabilitation",
                              "alternative", "centre", "clinic", "doctor", "dentist", "audiologist", "podiatrist",
                              "speech_therapist", "nutrition_counselling", "sample_collection"}}),
    "mascotas": ("Veterinarias y mascotas", "Veterinarias y tiendas de mascotas",
                 {"amenity": {"veterinary"}, "shop": {"pet", "pet_grooming"}}),
    "talleres-mecanicos": ("Talleres mecánicos", "Mecánica de carros, motos y vehículos de carga",
                           {"shop": {"car_repair", "motorcycle_repair"}, "craft": {"mechanic"}}),
    "llantas": ("Llantas y montallantas", "Venta y reparación de llantas", {"shop": {"tyres"}}),
    "repuestos-vehiculos": ("Repuestos y vehículos", "Repuestos, concesionarios y accesorios para vehículos",
                            {"shop": {"car_parts", "car", "truck", "motorcycle_parts", "car_rental"},
                             "amenity": {"car_rental"}}),
    # Un mismo lugar puede tener varias categorías: un taller de motos es "Talleres" y "Motos"
    "motos": ("Motos", "Venta de motos, repuestos, accesorios y talleres de motos",
              {"shop": {"motorcycle", "motorcycle_parts", "motorcycle_repair"}}),
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
    "gimnasios": ("Gimnasios", "Gimnasios, crossfit, yoga, artes marciales, baile y piscinas",
                  {"leisure": {"fitness_centre", "sports_centre", "sports_hall", "swimming_pool", "dance",
                               "fitness_station"},
                   "amenity": {"dojo", "dancing_school"}}),
    "hoteles": ("Hoteles y hospedaje", "Hoteles, hostales, moteles y apartamentos turísticos",
                {"tourism": {"hotel", "hostel", "motel", "guest_house", "apartment", "camp_site"}}),
    "bancos": ("Bancos y cajeros", "Bancos, cajeros automáticos, casas de cambio y giros",
               {"amenity": {"bank", "atm", "bureau_de_change", "money_transfer", "payment_centre"},
                "shop": {"money_lender", "pawnbroker"}}),
    "educacion": ("Educación y cursos", "Colegios, universidades, institutos, academias de idiomas, música y "
                  "escuelas de conducción",
                  {"amenity": {"school", "college", "university", "language_school", "music_school",
                               "driving_school", "kindergarten", "training", "prep_school"}}),
    "entretenimiento": ("Entretenimiento", "Cines, teatros, salas de eventos, bolos, juegos y parques recreativos",
                        {"amenity": {"cinema", "theatre", "arts_centre", "events_venue", "casino", "community_centre"},
                         "leisure": {"amusement_arcade", "bowling_alley", "escape_game", "water_park",
                                     "trampoline_park", "miniature_golf", "adult_gaming_centre"},
                         "tourism": {"museum", "theme_park", "zoo", "gallery", "attraction"}}),
    "servicios-profesionales": ("Servicios profesionales", "Abogados, contadores, notarías, seguros, "
                                "inmobiliarias y agencias de viajes",
                                {"office": {"lawyer", "accountant", "notary", "insurance", "estate_agent",
                                            "travel_agent", "employment_agency", "architect", "tax_advisor",
                                            "financial", "consulting", "it", "advertising_agency"},
                                 "shop": {"travel_agency"}}),
    "oficios": ("Oficios y servicios", "Cerrajería, carpintería, electricistas, lavanderías, modistería y otros "
                "oficios",
                {"craft": set(),  # cualquier valor de craft que no tenga otra categoría
                 "shop": {"laundry", "dry_cleaning", "locksmith", "repair", "electrical", "funeral_directors",
                          "storage_rental"}}),
    "otros-comercios": ("Otros comercios", "Otros tipos de comercio", {"shop": set()}),  # comodín
}

# Grupos de categorías afines. Si la búsqueda pide llantas, un taller o un almacén de repuestos es "afín";
# una tienda de ropa no.
CATEGORY_GROUPS: list[set[str]] = [
    {"restaurantes", "comida-rapida", "cafeterias", "bares", "heladerias", "panaderias", "mercados-tiendas",
     "centros-comerciales"},
    {"llantas", "talleres-mecanicos", "repuestos-vehiculos", "motos", "lavaderos", "estaciones-servicio"},
    {"farmacias", "salud"},
    {"mascotas"},
    {"ferreterias", "hogar", "oficios"},
    {"ropa-calzado", "belleza", "centros-comerciales"},
    {"tecnologia", "papelerias"},
    {"deportes", "gimnasios"},
    {"hoteles"},
    {"bancos"},
    {"educacion"},
    {"entretenimiento", "bares"},
    {"servicios-profesionales"},
]


def related_categories(slugs: set[str]) -> set[str]:
    """Categorías afines a las dadas (incluyéndolas)."""
    related = set(slugs)
    for group in CATEGORY_GROUPS:
        if group & slugs:
            related |= group
    return related


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
