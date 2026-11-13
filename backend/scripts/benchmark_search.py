"""Mide la calidad de la búsqueda con consultas etiquetadas (qué categoría y municipio se esperan).

Métricas:
- Precisión@5: de los 5 primeros resultados, qué fracción es de una categoría correcta.
- Municipio@5: de los 5 primeros, qué fracción está en el municipio pedido.
- Encontrados/disponibles: de los negocios correctos que EXISTEN en los datos (máx. 5), cuántos aparecieron.
  Es la métrica justa cuando hay pocos datos: si solo hay 1 veterinaria en Floridablanca, P@5 nunca pasa de 20 %.
- Sin resultados: consultas que no devolvieron nada.
- Tiempo de respuesta (mediana y percentil 95).

Uso (desde la carpeta backend):
    .\\.venv\\Scripts\\python -m scripts.benchmark_search            # solo intérprete por reglas (sin gastar cuota)
    .\\.venv\\Scripts\\python -m scripts.benchmark_search --con-ia   # con Gemini (≈22 consultas a la API)

No guarda nada en el historial. Los resultados dependen de los datos cargados (OSM es incompleto).
"""
import argparse
import statistics
import time

from sqlalchemy import func, select

from app.core.text import normalize
from app.db.session import SessionLocal
from app.models import Category, Establishment, Place
from app.services.embeddings import get_embedder
from app.services.llm import get_llm
from app.services.search import SearchParams, search

FOOD = {"restaurantes", "comida-rapida"}
CAR = {"llantas", "talleres-mecanicos", "repuestos-vehiculos"}

# (consulta, categorías aceptadas, municipio esperado o None)
CASES = [
    ("hamburguesas en piedecuesta", FOOD, "piedecuesta"),
    ("Quiero comer una hamburguesa en Piedecuesta", FOOD, "piedecuesta"),
    ("pizza en cabecera", FOOD, "bucaramanga"),
    ("almuerzo corriente barato en girón", FOOD, "giron"),
    ("dónde tomar un café en floridablanca", {"cafeterias", "panaderias"}, "floridablanca"),
    ("panadería en piedecuesta", {"panaderias"}, "piedecuesta"),
    ("heladería en bucaramanga", {"heladerias"}, "bucaramanga"),
    ("bar para tomar cerveza en bucaramanga", {"bares"}, "bucaramanga"),
    ("droguería en girón", {"farmacias"}, "giron"),
    ("necesito una farmacia en bucaramanga", {"farmacias"}, "bucaramanga"),
    ("odontólogo en bucaramanga", {"salud"}, "bucaramanga"),
    ("montallantas en bucaramanga", CAR, "bucaramanga"),
    ("Necesito un mecánico que arregle llantas de busetas en Bucaramanga", CAR, "bucaramanga"),
    ("Necesito comprar llantas para una buseta de mi empresa", CAR, None),
    ("tanquear gasolina en floridablanca", {"estaciones-servicio"}, "floridablanca"),
    ("lavadero de carros en bucaramanga", {"lavaderos"}, "bucaramanga"),
    ("veterinaria para mi perro en floridablanca", {"mascotas"}, "floridablanca"),
    ("ferretería en girón", {"ferreterias"}, "giron"),
    ("supermercado en floridablanca", {"mercados-tiendas"}, "floridablanca"),
    ("comprar ropa en bucaramanga", {"ropa-calzado"}, "bucaramanga"),
    ("arreglar el celular en bucaramanga", {"tecnologia"}, "bucaramanga"),
    ("peluquería en piedecuesta", {"belleza"}, "piedecuesta"),
]


def available(db, cats, muni) -> int:
    """Cuántos negocios activos cumplen (categoría y municipio): el máximo que la búsqueda podría encontrar."""
    stmt = select(func.count(func.distinct(Establishment.id))).where(
        Establishment.status == "active", Establishment.categories.any(Category.slug.in_(cats)))
    if muni:
        stmt = stmt.join(Place, Place.id == Establishment.municipality_id).where(Place.normalized_name == muni)
    return db.scalar(stmt)


def evaluate(db, query, cats, muni, llm) -> dict:
    start = time.perf_counter()
    result = search(db, SearchParams(q=query, limit=5), get_embedder(), llm)
    ms = (time.perf_counter() - start) * 1000
    top = result.hits[:5]
    cat_ok = [bool({c.slug for c in h.establishment.categories} & cats) for h in top]
    muni_ok = [bool(h.establishment.municipality and normalize(h.establishment.municipality.name) == muni) for h in top]
    both_ok = sum(c and (m or not muni) for c, m in zip(cat_ok, muni_ok))
    reachable = min(5, available(db, cats, muni))
    return {
        "query": query, "n": len(top), "ms": ms,
        # Encontrados/disponibles: si solo existen 2 panaderías en Piedecuesta, encontrar las 2 = 100 %
        "found": both_ok / reachable if reachable else 1.0, "reachable": reachable,
        "p5": sum(cat_ok) / len(top) if top else 0.0,
        "m5": (sum(muni_ok) / len(top) if top else 0.0) if muni else None,
        "first": top[0].establishment.name if top else "—",
        "miss": [h.establishment.name for h, ok in zip(top, cat_ok) if not ok],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--con-ia", action="store_true", help="usar Gemini para interpretar las consultas")
    args = parser.parse_args()
    llm = get_llm() if args.con_ia else None

    get_embedder().encode_query("calentamiento")  # la carga del modelo no cuenta en los tiempos
    with SessionLocal() as db:
        search(db, SearchParams(q="calentamiento", limit=1), get_embedder(), None)
        rows = [evaluate(db, q, cats, muni, llm) for q, cats, muni in CASES]

    print(f"\nModo: {'con IA (Gemini)' if llm else 'solo reglas'} · {len(rows)} consultas\n")
    print(f"{'P@5':>5} {'Mun@5':>6} {'Encont.':>8} {'ms':>6}  Consulta  →  primer resultado")
    for r in rows:
        mun = f"{r['m5']:.0%}" if r["m5"] is not None else "  —"
        found = f"{r['found']:.0%}" + (f" (de {r['reachable']})" if r["reachable"] < 5 else "")
        print(f"{r['p5']:>5.0%} {mun:>6} {found:>8} {r['ms']:>6.0f}  {r['query']}  →  {r['first']}")
        if r["miss"]:
            print(f"{'':>20}fuera de categoría: {', '.join(r['miss'][:3])}")

    times = sorted(r["ms"] for r in rows)
    with_muni = [r["m5"] for r in rows if r["m5"] is not None]
    print("\nResumen")
    print(f"  Precisión@5 promedio:     {statistics.mean(r['p5'] for r in rows):.0%}")
    print(f"  Consultas con P@5 ≥ 80%:  {sum(r['p5'] >= 0.8 for r in rows)} de {len(rows)}")
    print(f"  Encontrados/disponibles:  {statistics.mean(r['found'] for r in rows):.0%}"
          "   (¿aparecen en el top 5 los negocios correctos que existen en los datos?)")
    print(f"  Municipio@5 promedio:     {statistics.mean(with_muni):.0%}")
    print(f"  Sin resultados:           {sum(r['n'] == 0 for r in rows)}")
    print(f"  Tiempo mediana / p95:     {statistics.median(times):.0f} ms / {times[int(0.95 * (len(times) - 1))]:.0f} ms")


if __name__ == "__main__":
    main()
