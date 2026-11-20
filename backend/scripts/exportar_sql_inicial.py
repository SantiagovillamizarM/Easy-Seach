"""Genera el script SQL de la base de datos inicial de Easy Search (entregable de la materia).

Uso (desde la carpeta backend, con la base de datos encendida):
    .\\.venv\\Scripts\\python -m scripts.exportar_sql_inicial

Escribe dos archivos en docker/initdb/, que PostgreSQL ejecuta solos la primera vez que se crea la base
(después de 01-extensions.sql):

- 02-esquema.sql: todas las tablas, restricciones, índices (incluido el HNSW de pgvector) y la versión de
  Alembic. Se genera con pg_dump desde la base actual, así que siempre coincide con las migraciones.
- 03-datos-iniciales.sql: los datos reales cargados a mano por el equipo (data/locales_easysearch.csv), es decir
  los negocios con source = 'manual', con sus productos, horarios y categorías, más los datos de referencia que la
  aplicación necesita para funcionar: categorías y lugares (municipios y barrios).

NO incluye: negocios importados de OpenStreetMap, vectores (los genera el flujo 1 de n8n al arrancar), ni datos
personales (usuarios, reseñas, historial, favoritos, consultas al asistente).
"""
import subprocess
from datetime import datetime
from pathlib import Path

import psycopg
from sqlalchemy.engine import make_url

from app.core.config import ROOT_DIR, get_settings

INITDB = ROOT_DIR / "docker" / "initdb"
CONTENEDOR = "easysearch-db"

NEGOCIOS = "SELECT id FROM establishments WHERE source = 'manual'"

# (tabla, filtro). El orden no importa: la carga desactiva las llaves foráneas mientras inserta.
TABLAS = [
    ("categories", None),
    ("places", None),
    ("establishments", f"id IN ({NEGOCIOS})"),
    ("establishment_categories", f"establishment_id IN ({NEGOCIOS})"),
    ("offerings", f"establishment_id IN ({NEGOCIOS})"),
    ("opening_hours", f"establishment_id IN ({NEGOCIOS})"),
    ("special_hours", f"establishment_id IN ({NEGOCIOS})"),
]


def _conexion() -> psycopg.Connection:
    url = make_url(get_settings().database_url)
    return psycopg.connect(host=url.host, port=url.port, dbname=url.database, user=url.username,
                           password=url.password)


def exportar_esquema(base: str, usuario: str) -> str:
    """pg_dump dentro del contenedor: solo la estructura, sin dueños ni permisos (sirve en cualquier instalación)."""
    estructura = subprocess.run(
        ["docker", "exec", CONTENEDOR, "pg_dump", "-U", usuario, "-d", base, "--schema-only", "--no-owner",
         "--no-privileges", "--no-comments"],
        capture_output=True, text=True, encoding="utf-8", check=True).stdout
    version = subprocess.run(
        ["docker", "exec", CONTENEDOR, "psql", "-U", usuario, "-d", base, "-tAc",
         "SELECT version_num FROM alembic_version"],
        capture_output=True, text=True, check=True).stdout.strip()
    encabezado = (
        "-- Easy Search: esquema completo de la base de datos (PostgreSQL 16 + pgvector).\n"
        f"-- Generado con scripts/exportar_sql_inicial.py el {datetime.now():%Y-%m-%d %H:%M}.\n"
        "-- Lo ejecuta PostgreSQL solo la primera vez que se crea la base (docker/initdb).\n"
        "-- Incluye la versión de Alembic: al arrancar, `alembic upgrade head` no tiene nada que aplicar.\n\n")
    return (encabezado + estructura +
            f"\n-- Versión de las migraciones con la que se generó este esquema\n"
            f"INSERT INTO public.alembic_version (version_num) VALUES ('{version}');\n")


def exportar_datos(conn: psycopg.Connection) -> tuple[str, dict[str, int]]:
    partes = [
        "-- Easy Search: datos iniciales reales.\n",
        f"-- Generado con scripts/exportar_sql_inicial.py el {datetime.now():%Y-%m-%d %H:%M}.\n",
        "-- Negocios cargados a mano por el equipo (backend/data/locales_easysearch.csv) con sus productos, horarios\n",
        "-- y categorías, más las categorías y los lugares (municipios y barrios) que la aplicación necesita.\n",
        "-- Sin datos personales y sin vectores: el flujo 1 de n8n los genera al arrancar.\n\n",
        "BEGIN;\n",
        "-- Las llaves foráneas se comprueban al final de la carga, no fila por fila\n",
        "SET session_replication_role = replica;\n\n",
    ]
    conteos: dict[str, int] = {}
    for tabla, filtro in TABLAS:
        columnas = [r[0] for r in conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = %s "
            "ORDER BY ordinal_position", (tabla,))]
        lista = ", ".join(f'"{c}"' for c in columnas)
        consulta = f"SELECT {lista} FROM {tabla}" + (f" WHERE {filtro}" if filtro else "") + " ORDER BY 1"
        filas = []
        with conn.cursor().copy(f"COPY ({consulta}) TO STDOUT") as copia:
            for bloque in copia:
                filas.append(bytes(bloque).decode("utf-8"))
        contenido = "".join(filas)
        conteos[tabla] = contenido.count("\n")
        partes.append(f"-- {tabla}: {conteos[tabla]} filas\n")
        partes.append(f"COPY public.{tabla} ({lista}) FROM stdin;\n{contenido}\\.\n\n")

    partes.append("SET session_replication_role = DEFAULT;\n\n")
    partes.append("-- Los contadores de id continúan después de los datos cargados\n")
    for tabla, _ in TABLAS:
        if tabla != "establishment_categories":
            partes.append(f"SELECT setval(pg_get_serial_sequence('public.{tabla}', 'id'), "
                          f"COALESCE((SELECT max(id) FROM public.{tabla}), 0) + 1, false);\n")
    partes.append("\nCOMMIT;\n")
    return "".join(partes), conteos


def main() -> None:
    url = make_url(get_settings().database_url)
    esquema = exportar_esquema(url.database, url.username)
    with _conexion() as conn:
        datos, conteos = exportar_datos(conn)

    INITDB.mkdir(parents=True, exist_ok=True)
    (INITDB / "02-esquema.sql").write_text(esquema, encoding="utf-8", newline="\n")
    (INITDB / "03-datos-iniciales.sql").write_text(datos, encoding="utf-8", newline="\n")
    print("Escrito docker/initdb/02-esquema.sql y docker/initdb/03-datos-iniciales.sql")
    for tabla, n in conteos.items():
        print(f"  {tabla}: {n}")


if __name__ == "__main__":
    main()
