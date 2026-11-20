"""Calibra el umbral de similitud del asistente RAG con consultas reales.

Uso (desde la carpeta backend):
    .\\.venv\\Scripts\\python -m scripts.calibrar_umbral

Compara la mejor similitud que obtienen en pgvector dos grupos de preguntas:
- RELEVANTES: preguntas que los negocios registrados sí pueden responder.
- SIN RELACIÓN: preguntas que ningún negocio responde (deben terminar en "Sin resultados").

El umbral se elige entre ambos grupos. La similitud se calcula igual que en el flujo de n8n:
1 - distancia coseno, tomando por cada negocio activo su vector más parecido (el del negocio o el de uno de
sus productos).
"""
import statistics

from sqlalchemy import text

from app.db.session import SessionLocal
from app.services.embeddings import get_embedder

RELEVANTES = [
    "¿Dónde puedo almorzar barato en Cabecera?",
    "Busco un taller de motos en Floridablanca",
    "Necesito una farmacia en Girón",
    "¿Qué pizzerías hay en Bucaramanga?",
    "Quiero una peluquería para mi perro",
    "¿Dónde arreglan celulares?",
    "Busco un lugar para comer hamburguesas con mis amigos",
    "Necesito una ferretería cerca",
    "¿Dónde venden helados?",
    "Quiero tomar un café y trabajar un rato",
    "Busco un gimnasio en Piedecuesta",
    "¿Dónde puedo comprar pan fresco temprano?",
    "Necesito un veterinario para mi gato",
    "¿Qué restaurantes de comida típica santandereana hay?",
    "Busco dónde lavar el carro",
    "¿Dónde hay un supermercado?",
    "Quiero comer sushi esta noche",
    "Necesito un odontólogo",
    "¿Dónde puedo tomar cerveza con amigos?",
    "Busco una papelería para imprimir documentos",
    # Problemas cotidianos redactados de forma indirecta (sin nombrar el tipo de negocio)
    "Mi computador no prende, ¿dónde lo pueden revisar?",
    "Se me dañó la pantalla del celular",
    "Necesito cambiar las llantas del carro",
    "¿Dónde compro un regalo de cumpleaños?",
    "Quiero cortarme el pelo",
    "Necesito sacar copia de una llave",
    "Busco ropa deportiva",
    "¿Dónde venden comida para perro?",
    "Quiero comprar flores para mi mamá",
    "Me duele una muela",
]

SIN_RELACION = [
    "¿Cómo configuro el router wifi de mi casa?",
    "Dame la receta de una lasaña casera",
    "¿Quién ganó el mundial de fútbol de 2014?",
    "Mi aplicación Java lanza NullPointerException, ¿qué hago?",
    "¿A cuánto está el dólar hoy?",
    "Explícame la teoría de la relatividad",
    "¿Cuál es la capital de Australia?",
    "Escribe un poema sobre el mar",
    "¿Cómo se resuelve una ecuación de segundo grado?",
    "¿Qué opinas de la inteligencia artificial?",
    "Traduce 'buenos días' al alemán",
    "¿Cuántos planetas tiene el sistema solar?",
    "Recomiéndame una serie de Netflix",
    "¿Cómo hago una tabla dinámica en Excel?",
    "¿Cuál es la contraseña del wifi?",
    "asdkjh qwe zzz",
    "¿Va a llover mañana?",
    "Ayúdame con mi tarea de historia",
    "¿Cómo cambio el aceite de un avión?",
    "Háblame de la Segunda Guerra Mundial",
]

QUERY = text("""
    SELECT max(1 - (em.embedding <=> CAST(:v AS vector))) AS similitud
    FROM embeddings em JOIN establishments e ON e.id = em.establishment_id
    WHERE e.status = 'active'
    GROUP BY e.id ORDER BY similitud DESC LIMIT 5
""")


def mejores(db, embedder, preguntas):
    resultado = []
    for p in preguntas:
        v = embedder.encode_query(p)
        sims = [row[0] for row in db.execute(QUERY, {"v": str(v)})]
        resultado.append((p, sims))
    return resultado


def main() -> None:
    embedder = get_embedder()
    db = SessionLocal()
    try:
        rel = mejores(db, embedder, RELEVANTES)
        sin = mejores(db, embedder, SIN_RELACION)
    finally:
        db.close()

    for titulo, grupo in (("RELEVANTES", rel), ("SIN RELACIÓN", sin)):
        print(f"\n{titulo}  (mejor similitud | 5.ª similitud)")
        for p, sims in sorted(grupo, key=lambda x: -x[1][0]):
            print(f"  {sims[0]:.4f} | {sims[-1]:.4f}  {p}")

    top_rel = [s[0] for _, s in rel]
    top_sin = [s[0] for _, s in sin]
    print("\nResumen de la mejor similitud por pregunta:")
    for nombre, valores in (("relevantes", top_rel), ("sin relación", top_sin)):
        print(f"  {nombre:13} min {min(valores):.4f}  mediana {statistics.median(valores):.4f}  max {max(valores):.4f}")

    print("\nUmbral candidato -> relevantes aceptadas / sin relación rechazadas:")
    candidatos = sorted({round(x / 1000, 3) for x in range(780, 900, 5)})
    for u in candidatos:
        acepta = sum(v >= u for v in top_rel)
        rechaza = sum(v < u for v in top_sin)
        print(f"  {u:.3f} -> {acepta}/{len(top_rel)} relevantes, {rechaza}/{len(top_sin)} sin relación rechazadas")


if __name__ == "__main__":
    main()
