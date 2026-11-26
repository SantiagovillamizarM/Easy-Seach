"""Genera el modelo relacional (notación de tablas) leyendo la estructura REAL de la base de datos.

Uso (desde la carpeta backend, con la base de datos encendida):
    .\\.venv\\Scripts\\python -m scripts.generar_modelo_relacional

Escribe docs/diagramas/modelo-relacional.md: cada tabla como RELACIÓN(atributos) con su llave primaria, llaves
foráneas (y a qué tabla apuntan), únicas y columnas obligatorias. Usa la misma lectura de PostgreSQL que el
diagrama entidad-relación, así que siempre coincide con las migraciones.
"""
from datetime import date

from app.core.config import ROOT_DIR
from app.db.session import SessionLocal
from scripts.generar_diagrama_er import MODULOS, leer_estructura

SALIDA = ROOT_DIR / "docs" / "diagramas" / "modelo-relacional.md"
IGNORADAS = {"alembic_version"}


def main() -> None:
    db = SessionLocal()
    try:
        columnas, claves, relaciones = leer_estructura(db)
    finally:
        db.close()

    destino = {(hija, col): padre for hija, col, padre, _, _ in relaciones}
    tablas = [t for t in columnas if t not in IGNORADAS]
    # Orden por módulo (como el diagrama entidad-relación); lo que no esté en ninguno va al final
    orden, vistos = [], set()
    for titulo, _, del_modulo in MODULOS:
        propias = [t for t in del_modulo if t in columnas and t not in vistos]
        if propias:
            orden.append((titulo, propias))
            vistos.update(propias)
    resto = [t for t in tablas if t not in vistos]
    if resto:
        orden.append(("Otras", resto))

    lineas = [
        "# Modelo relacional\n",
        f"Generado desde la base de datos real con `scripts/generar_modelo_relacional.py` el {date.today():%Y-%m-%d}.",
        f"{len(tablas)} tablas y {len(relaciones)} llaves foráneas.\n",
        "**Notación:** `TABLA(atributos)`. **<u>subrayado</u>** = llave primaria (PK) · *cursiva →* = llave foránea (FK) "
        "y la tabla a la que apunta · `UQ` = único · `?` = puede quedar vacío (NULL).\n",
    ]
    for titulo, del_modulo in orden:
        lineas.append(f"## {titulo}\n")
        for tabla in del_modulo:
            partes = []
            for columna, tipo, nulo in columnas[tabla]:
                marcas = claves.get((tabla, columna), set())
                texto = f"<u>**{columna}**</u>" if "PK" in marcas else columna
                if "FK" in marcas:
                    texto = f"*{columna} → {destino.get((tabla, columna), '?')}*"
                    if "PK" in marcas:
                        texto = f"<u>**{texto}**</u>"
                if "UK" in marcas:
                    texto += " `UQ`"
                if nulo and "PK" not in marcas:
                    texto += "?"
                partes.append(texto)
            lineas.append(f"- **{tabla.upper()}**({', '.join(partes)})")
            tipos = ", ".join(f"{c}: {t}" for c, t, _ in columnas[tabla])
            lineas.append(f"  <sub>{tipos}</sub>")
        lineas.append("")

    lineas.append("## Llaves foráneas\n")
    lineas.append("| Tabla | Columna | Apunta a | ¿Puede quedar vacía? |")
    lineas.append("|---|---|---|---|")
    for hija, columna, padre, _, nulo in relaciones:
        if hija in IGNORADAS:
            continue
        lineas.append(f"| `{hija}` | `{columna}` | `{padre}` | {'sí' if nulo else 'no'} |")

    SALIDA.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    print(f"Escrito {SALIDA.relative_to(ROOT_DIR)}: {len(tablas)} tablas, {len(relaciones)} llaves foráneas")


if __name__ == "__main__":
    main()
