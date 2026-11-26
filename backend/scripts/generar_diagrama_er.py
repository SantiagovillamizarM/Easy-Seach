"""Genera los diagramas entidad-relación (Mermaid) leyendo la estructura REAL de la base de datos.

Uso (con el entorno virtual activado, desde la carpeta backend, con la base de datos encendida):
    python -m scripts.generar_diagrama_er

Escribe docs/diagramas/entidad-relacion.md con un diagrama por módulo. Como se lee de PostgreSQL (tablas,
columnas, tipos, llaves primarias, foráneas y únicas), el diagrama siempre coincide con las migraciones.
GitHub y VS Code muestran los bloques ```mermaid como imágenes.
"""
from collections import defaultdict
from datetime import date

from sqlalchemy import text

from app.core.config import ROOT_DIR
from app.db.session import SessionLocal

SALIDA = ROOT_DIR / "docs" / "diagramas" / "entidad-relacion.md"

MODULOS = [
    ("Catálogo de negocios y búsqueda semántica",
     "Negocios, sus productos y servicios, horarios, fotos, categorías, lugares y los vectores de pgvector.",
     ["places", "categories", "establishments", "establishment_categories", "offerings", "opening_hours",
      "special_hours", "establishment_photos", "embeddings"]),
    ("Usuarios e interacción",
     "Cuentas, favoritos, historial de búsqueda, reseñas, reportes, solicitudes de negocios, duplicados y las "
     "visitas anónimas a la web (analítica propia).",
     ["users", "favorites", "search_history", "reviews", "reports", "ownership_claims", "duplicate_dismissals",
      "page_views", "establishments"]),
    ("Asistente con IA (Spring Boot + JPA)",
     "Consultas al asistente RAG, respuestas, fuentes con su similitud y calificaciones. Las tablas las crea Alembic "
     "y Spring Boot las usa con JPA (`gateway/.../asistente`).",
     ["users", "consultas_ia", "respuestas_ia", "fuentes_respuesta", "calificaciones", "establishments"]),
]

# Tablas que aparecen en un módulo solo como referencia (se muestran sin columnas para no repetirlas)
REFERENCIA = {
    "Usuarios e interacción": {"establishments"},
    "Asistente con IA (Spring Boot + JPA)": {"users", "establishments"},
}

TIPOS = {
    "integer": "int", "bigint": "bigint", "smallint": "smallint", "character varying": "varchar", "text": "text",
    "boolean": "bool", "numeric": "numeric", "double precision": "float", "real": "float", "jsonb": "jsonb",
    "timestamp with time zone": "timestamptz", "time without time zone": "time", "date": "date",
    "USER-DEFINED": "vector", "ARRAY": "text_array",
}


def leer_estructura(db):
    columnas = defaultdict(list)
    for tabla, columna, tipo, nulo in db.execute(text("""
            SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
            WHERE table_schema = 'public' ORDER BY table_name, ordinal_position""")):
        columnas[tabla].append((columna, TIPOS.get(tipo, tipo.replace(" ", "_")), nulo == "YES"))

    claves = defaultdict(set)   # (tabla, columna) -> {"PK", "FK", "UK"}
    # UK solo para restricciones únicas de UNA columna: en una compuesta (ej. respuesta + negocio) cada columna
    # por separado puede repetirse, así que la relación sigue siendo de uno a muchos.
    for tabla, columna, tipo, total in db.execute(text("""
            SELECT tc.table_name, kcu.column_name, tc.constraint_type,
                   count(*) OVER (PARTITION BY tc.constraint_name)
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
            WHERE tc.table_schema = 'public'
              AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')""")):
        if tipo == "UNIQUE" and total > 1:
            continue
        claves[(tabla, columna)].add({"PRIMARY KEY": "PK", "FOREIGN KEY": "FK", "UNIQUE": "UK"}[tipo])

    relaciones = []             # (tabla hija, columna, tabla padre, columna hija es única, columna hija admite null)
    for hija, columna, padre in db.execute(text("""
            SELECT tc.table_name, kcu.column_name, ccu.table_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
            WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
            ORDER BY 1, 2""")):
        nulo = next(n for c, _, n in columnas[hija] if c == columna)
        unica = "UK" in claves[(hija, columna)] or (
            "PK" in claves[(hija, columna)] and sum("PK" in claves[(hija, c)] for c, _, _ in columnas[hija]) == 1)
        relaciones.append((hija, columna, padre, unica, nulo))
    return columnas, claves, relaciones


def diagrama(tablas, referencia, columnas, claves, relaciones) -> str:
    lineas = ["```mermaid", "erDiagram"]
    for tabla in tablas:
        if tabla in referencia:
            lineas.append(f"    {tabla} {{")
            lineas.append('        int id PK "ver su módulo"')
            lineas.append("    }")
            continue
        lineas.append(f"    {tabla} {{")
        for columna, tipo, _ in columnas[tabla]:
            marcas = sorted(claves.get((tabla, columna), set()), key=["PK", "FK", "UK"].index)
            lineas.append(f"        {tipo} {columna}" + (f" {','.join(marcas)}" if marcas else ""))
        lineas.append("    }")
    for hija, columna, padre, unica, nulo in relaciones:
        if hija in tablas and padre in tablas and not (hija in referencia and padre in referencia):
            if hija in referencia:
                continue
            # padre ||--o{ hija : columna   (uno a muchos)   |   padre ||--o| hija (uno a uno)
            lado_padre = "|o" if nulo else "||"
            lado_hija = "o|" if unica else "o{"
            lineas.append(f'    {padre} {lado_padre}--{lado_hija} {hija} : "{columna}"')
    lineas.append("```")
    return "\n".join(lineas)


def main() -> None:
    db = SessionLocal()
    try:
        columnas, claves, relaciones = leer_estructura(db)
    finally:
        db.close()

    partes = [
        "# Diagramas entidad-relación\n",
        f"Generado desde la base de datos real con `backend/scripts/generar_diagrama_er.py` el {date.today():%Y-%m-%d}.",
        "Base de datos: PostgreSQL 16 + pgvector. Esquema administrado con migraciones de Alembic.\n",
        "Convenciones: **PK** llave primaria, **FK** llave foránea, **UK** valor único. "
        "`||--o{` uno a muchos, `||--o|` uno a uno, `|o` el padre es opcional (la columna admite nulo).\n",
        f"Total: {len([t for t in columnas if t != 'alembic_version'])} tablas "
        f"y {len(relaciones)} relaciones.\n",
    ]
    for titulo, descripcion, tablas in MODULOS:
        partes.append(f"## {titulo}\n\n{descripcion}\n")
        partes.append(diagrama(tablas, REFERENCIA.get(titulo, set()), columnas, claves, relaciones) + "\n")

    partes.append("## Restricciones e índices principales\n")
    partes.append(
        "- **Integridad:** llaves foráneas con `ON DELETE CASCADE` (lo que depende de un usuario o negocio se borra "
        "con él) o `SET NULL` (se conserva el historial, por ejemplo las fuentes de una respuesta).\n"
        "- **Reglas de negocio en la base (`CHECK`):** roles y estados válidos, calificaciones de 1 a 5, pregunta no "
        "vacía, umbral entre 0 y 1, similitudes entre -1 y 1.\n"
        "- **Unicidad:** un correo por usuario, una reseña por usuario y negocio, un vector por elemento, una "
        "respuesta por consulta, una calificación por respuesta.\n"
        "- **Índices:** HNSW de pgvector sobre `embeddings.embedding` (similitud coseno), índices de búsqueda de "
        "texto y por llaves foráneas, e historial del asistente por usuario y fecha.\n")
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text("\n".join(partes), encoding="utf-8", newline="\n")
    print(f"Escrito {SALIDA.relative_to(ROOT_DIR)}: {len(columnas) - 1} tablas, {len(relaciones)} relaciones")


if __name__ == "__main__":
    main()
