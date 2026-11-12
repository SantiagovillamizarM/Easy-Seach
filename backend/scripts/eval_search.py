"""Evalúa la búsqueda con los ejemplos de la propuesta, usando el sistema real (Gemini + pgvector + datos OSM).

Uso (desde la carpeta backend):
    .\\.venv\\Scripts\\python -m scripts.eval_search
    .\\.venv\\Scripts\\python -m scripts.eval_search --sin-ia      # solo intérprete por reglas
    .\\.venv\\Scripts\\python -m scripts.eval_search "otra consulta"

No guarda nada en el historial.
"""
import argparse
import time

from app.db.session import SessionLocal
from app.services.embeddings import get_embedder
from app.services.llm import get_llm
from app.services.search import SearchParams, search

# Coordenadas de ejemplo (parque principal de Piedecuesta) para simular un usuario con GPS
PIEDECUESTA_GPS = (6.9879, -73.0503)

CASES = [
    ("Quiero comer una hamburguesa en Piedecuesta", None),
    ("Necesito un mecánico que arregle llantas de busetas en Bucaramanga", None),
    ("Quiero comer hamburguesas en Bucaramanga, pero tengo máximo 25.000 pesos", None),
    ("Necesito comprar llantas para una buseta de mi empresa", None),
    ("Quiero un sitio para comer algo rico, que no sea tan caro y que quede cerca", PIEDECUESTA_GPS),
    ("Quiero un sitio para comer algo rico, que no sea tan caro y que quede cerca", None),
    ("hamburguesas", PIEDECUESTA_GPS),
]


def run(query: str, gps, use_ai: bool) -> None:
    db = SessionLocal()
    try:
        start = time.time()
        params = SearchParams(q=query, latitude=gps[0] if gps else None, longitude=gps[1] if gps else None, limit=5)
        result = search(db, params, get_embedder(), get_llm() if use_ai else None)
        elapsed = time.time() - start
        i = result.intent
        print(f"\n### {query}" + ("   [con GPS en Piedecuesta]" if gps else ""))
        print(f"    Intérprete: {i.parser} | necesidad: {i.need!r} | palabras: {i.keywords} | categorías: "
              f"{i.category_slugs}")
        print(f"    Lugar: {result.location.label if result.location else '—'} | cerca de mí: {i.near_me} | "
              f"presupuesto máx: {i.budget_max} | barato: {i.price_preference == 'low'} | "
              f"preferencias: {i.preferences} | {elapsed:.1f} s")
        for n in result.notices:
            print(f"    ⚠ {n}")
        for h in result.hits:
            e = h.establishment
            extra = f" · {h.distance_km:.1f} km" if h.distance_km is not None else ""
            print(f"    {h.score:.4f}  {e.name} — {', '.join(c.name for c in e.categories)} "
                  f"({e.municipality.name if e.municipality else '?'}){extra} [{h.relevance}"
                  f"{', texto' if h.text_match else ''}]")
        if not result.hits:
            print("    (sin resultados)")
        db.rollback()  # no guarda nada
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("consulta", nargs="?")
    parser.add_argument("--sin-ia", action="store_true")
    args = parser.parse_args()
    cases = [(args.consulta, None)] if args.consulta else CASES
    for query, gps in cases:
        run(query, gps, use_ai=not args.sin_ia)


if __name__ == "__main__":
    main()
