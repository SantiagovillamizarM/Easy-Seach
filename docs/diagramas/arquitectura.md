# Diagramas de arquitectura

## 1. Componentes

Cinco servicios en Docker Compose (`docker compose --profile completo up -d`). El navegador solo habla con el
frontend; toda la API pasa por Spring Boot, que decide si atiende la petición o la reenvía a FastAPI. Ni el
navegador ni el frontend llaman directamente a FastAPI, n8n, pgvector o Gemini.

```mermaid
flowchart LR
    U(["👤 Navegador"])

    subgraph docker["Docker Compose · red easysearch 172.29.0.0/24"]
        direction LR
        F["<b>Frontend</b><br/>React + Vite + Tailwind<br/>servido por Nginx<br/><i>:8090</i>"]
        G["<b>Puerta de entrada</b><br/>Spring Boot 4 · Java 21<br/>Spring Security (JWT) · JPA · Swagger<br/><i>:8020</i>"]
        B["<b>Backend</b><br/>FastAPI · Python 3.12<br/>SQLAlchemy · Alembic<br/>modelo e5 de embeddings<br/><i>:8010</i>"]
        N["<b>Orquestador de IA</b><br/>n8n 2.48<br/>flujo 1: indexación<br/>flujo 2: asistente RAG<br/><i>:5690</i>"]
        D[("<b>PostgreSQL 16</b><br/>+ pgvector (HNSW)<br/><i>:5440</i>")]
    end

    GEM["☁️ Google Gemini<br/>gemini-2.5-flash-lite"]
    OSM["☁️ OpenStreetMap<br/>(importación de datos)"]

    U -->|HTTPS / HTTP| F
    F -->|"/api, /uploads"| G
    G -->|"rutas propias: /api/asistente, /api/sistema<br/>(JPA)"| D
    G -->|"todo lo demás: búsqueda, cuentas,<br/>reseñas, paneles (proxy)"| B
    G -->|"webhook con clave X-N8N-Key"| N
    N -->|"/api/internal (clave interna):<br/>embeddings, pendientes, fichas, validación"| B
    N -->|"búsqueda por similitud<br/>e inserción de vectores"| D
    N -->|"generación de la respuesta"| GEM
    B -->|SQLAlchemy| D
    B -->|"interpretación de búsquedas<br/>y recomendaciones"| GEM
    B -.->|scripts de importación| OSM
```

| Componente | Tecnologías | Responsabilidad |
|---|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Leaflet, Nginx | Interfaz: búsqueda, fichas, cuenta, paneles y asistente |
| Puerta de entrada | Spring Boot 4, Spring Security, Spring Data JPA (Hibernate), springdoc (Swagger) | Única API del navegador. Valida el JWT, atiende el asistente con JPA, reenvía el resto a FastAPI y llama a n8n |
| Backend | FastAPI, SQLAlchemy, Alembic, sentence-transformers (multilingual-e5-small) | Búsqueda híbrida, cuentas, reseñas, paneles, migraciones y rutas internas para n8n |
| Orquestador | n8n | Flujo de indexación en pgvector y flujo RAG del asistente |
| Base de datos | PostgreSQL 16, pgvector, unaccent, pg_trgm | Datos relacionales, vectores de 384 dimensiones e índice HNSW por similitud coseno |
| Modelo de lenguaje | Google Gemini | Respuestas del asistente y recomendaciones, siempre a partir de datos de la base |

## 2. Seguridad en el recorrido de una petición

```mermaid
flowchart LR
    U(["Navegador"]) -->|"cualquier X-Forwarded-For<br/>que envíe se descarta"| F["Nginx"]
    F -->|"X-Forwarded-For = IP real"| G["Spring Boot<br/>confía solo en IPs internas"]
    G -->|"X-Forwarded-For = IP real<br/>(reemplaza la recibida)"| B["FastAPI<br/>confía solo en 172.29.0.20"]
    G -. "/api/internal → 404" .-x B
```

- **Sesión:** FastAPI emite un JWT (HS256) al iniciar sesión. Spring Boot valida ese mismo token con la misma
  clave, y las mismas reglas: cuenta activa y token posterior al último cambio de contraseña.
- **Rutas internas:** `/api/internal/*` de FastAPI solo aceptan la clave `INTERNAL_API_KEY` (n8n), y Spring
  Boot responde 404 si alguien las pide desde afuera.
- **Webhooks de n8n:** exigen la cabecera `X-N8N-Key`, que solo conoce Spring Boot.
- **Secretos:** todas las claves vienen del `.env`. Las credenciales de n8n se crean al arrancar el contenedor y
  no quedan en los flujos exportados.

## 3. Asistente RAG: recorrido de una pregunta

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant F as Frontend
    participant S as Spring Boot
    participant DB as PostgreSQL + pgvector
    participant N as n8n (flujo 2)
    participant B as FastAPI
    participant G as Gemini

    U->>F: Escribe su pregunta
    F->>S: POST /api/asistente/consultas (JWT)
    S->>S: Valida token, correo confirmado,<br/>pregunta no vacía y límite por hora
    S->>DB: Guarda la consulta en estado PENDIENTE
    S->>N: Webhook {pregunta, umbral 0,82, máx. 5 fuentes}
    N->>B: Vector de la pregunta (modelo e5)
    B-->>N: vector de 384 dimensiones
    N->>DB: Top 5 negocios ACTIVOS por similitud coseno
    alt Ninguno supera el umbral
        N-->>S: SIN_RESULTADOS (sin llamar a la IA)
    else Hay fuentes relevantes
        N->>B: Fichas de las fuentes (solo datos guardados)
        N->>G: Pregunta + fichas, con reglas de no inventar
        G-->>N: respuesta, pasos, fuentes usadas
        alt Las fichas no responden la pregunta
            N-->>S: SIN_RESULTADOS
        else Hay respuesta
            N->>B: Validar contra las fichas (borra datos inventados)
            N-->>S: RESPONDIDA + fuentes y similitudes
        end
    end
    Note over N,S: Si falla embeddings, pgvector o Gemini: ERROR con el motivo
    S->>DB: Comprueba que cada fuente exista y esté activa,<br/>guarda respuesta, fuentes y estado final
    S-->>F: Consulta con estado, respuesta, pasos y fuentes
    F-->>U: Muestra la respuesta y permite calificarla (1 a 5)
```

## 4. Indexación de la base de conocimiento (flujo 1 de n8n)

Se ejecuta cada 30 minutos, a pedido (webhook) o a mano desde n8n.

```mermaid
flowchart TD
    T(["⏱️ Cada 30 min · webhook · manual"]) --> P["Pedir a FastAPI los textos pendientes<br/>(vector inexistente o hash del texto cambiado)"]
    P --> L["Preparar lote de hasta 64 textos"]
    L --> O["Borrar vectores obsoletos<br/>(productos eliminados o no disponibles)"]
    L --> Q{"¿Hay textos<br/>pendientes?"}
    Q -- No --> R(["Resumen: todo está indexado"])
    Q -- Sí --> E["Generar vectores con el modelo e5<br/>(FastAPI /api/internal/embeddings)"]
    E --> S["Guardar en pgvector en una sola consulta<br/>INSERT … ON CONFLICT (tipo, id) DO UPDATE<br/>→ sin duplicados, con actualización"]
    S --> M{"¿Quedan más?<br/>(máx. 30 vueltas)"}
    M -- Sí --> P
    M -- No --> R
```
