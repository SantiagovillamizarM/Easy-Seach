# Diagramas entidad-relación

Generado desde la base de datos real con `backend/scripts/generar_diagrama_er.py` el 2026-11-20.
Base de datos: PostgreSQL 16 + pgvector. Esquema administrado con migraciones de Alembic.

Convenciones: **PK** llave primaria, **FK** llave foránea, **UK** valor único. `||--o{` uno a muchos, `||--o|` uno a uno, `|o` el padre es opcional (la columna admite nulo).

Total: 20 tablas y 33 relaciones.

## Catálogo de negocios y búsqueda semántica

Negocios, sus productos y servicios, horarios, fotos, categorías, lugares y los vectores de pgvector.

```mermaid
erDiagram
    places {
        int id PK
        varchar name
        varchar normalized_name
        varchar kind
        int parent_id FK
        varchar department
        float latitude
        float longitude
        varchar osm_type
        bigint osm_id
        timestamptz created_at
        timestamptz updated_at
    }
    categories {
        int id PK
        varchar name
        varchar slug UK
        text description
        int parent_id FK
        timestamptz created_at
        timestamptz updated_at
    }
    establishments {
        int id PK
        varchar name
        varchar slug UK
        text description
        varchar address
        varchar neighborhood
        int municipality_id FK
        float latitude
        float longitude
        varchar timezone
        varchar phone
        varchar whatsapp
        varchar email
        varchar website
        varchar instagram
        varchar facebook
        numeric price_min
        numeric price_max
        smallint price_level
        numeric rating_avg
        int rating_count
        timestamptz hours_verified_at
        int owner_id FK
        bool is_verified
        varchar status
        int duplicate_of_id FK
        varchar source
        varchar osm_type
        bigint osm_id
        jsonb osm_tags
        timestamptz created_at
        timestamptz updated_at
    }
    establishment_categories {
        int establishment_id PK,FK
        int category_id PK,FK
    }
    offerings {
        int id PK
        int establishment_id FK
        varchar kind
        varchar name
        text description
        numeric price
        bool is_available
        timestamptz created_at
        timestamptz updated_at
        varchar section
    }
    opening_hours {
        int id PK
        int establishment_id FK
        smallint day_of_week
        time opens_at
        time closes_at
    }
    special_hours {
        int id PK
        int establishment_id FK
        date date
        bool is_closed
        time opens_at
        time closes_at
        varchar note
    }
    establishment_photos {
        int id PK
        int establishment_id FK
        varchar url
        varchar caption
        int sort_order
        int uploaded_by_id FK
        timestamptz created_at
        timestamptz updated_at
    }
    embeddings {
        int id PK
        varchar entity_type
        int entity_id
        int establishment_id FK
        text content
        varchar content_hash
        varchar model
        vector embedding
        timestamptz updated_at
    }
    categories |o--o{ categories : "parent_id"
    establishments ||--o{ embeddings : "establishment_id"
    categories ||--o{ establishment_categories : "category_id"
    establishments ||--o{ establishment_categories : "establishment_id"
    establishments ||--o{ establishment_photos : "establishment_id"
    establishments |o--o{ establishments : "duplicate_of_id"
    places |o--o{ establishments : "municipality_id"
    establishments ||--o{ offerings : "establishment_id"
    establishments ||--o{ opening_hours : "establishment_id"
    places |o--o{ places : "parent_id"
    establishments ||--o{ special_hours : "establishment_id"
```

## Usuarios e interacción

Cuentas, favoritos, historial de búsqueda, reseñas, reportes, solicitudes de propiedad y duplicados.

```mermaid
erDiagram
    users {
        int id PK
        varchar email
        varchar password_hash
        varchar full_name
        varchar role
        bool is_active
        timestamptz created_at
        timestamptz updated_at
        timestamptz password_changed_at
        timestamptz email_verified_at
        varchar verification_code_hash
        timestamptz verification_code_expires_at
        int verification_attempts
        varchar reset_code_hash
        timestamptz reset_code_expires_at
        int reset_attempts
        bool notify_new_reviews
        bool notify_review_replies
    }
    favorites {
        int user_id PK,FK
        int establishment_id PK,FK
        timestamptz created_at
    }
    search_history {
        int id PK
        int user_id FK
        varchar query_text
        jsonb parsed_query
        varchar location_label
        int results_count
        bool hidden_by_user
        timestamptz created_at
    }
    reviews {
        int id PK
        int establishment_id FK
        int user_id FK
        smallint rating
        text comment
        varchar status
        varchar moderation_reason
        timestamptz created_at
        timestamptz updated_at
        text owner_reply
        timestamptz owner_reply_at
    }
    reports {
        int id PK
        int reporter_id FK
        int establishment_id FK
        int review_id FK
        varchar report_type
        text message
        varchar status
        int resolved_by_id FK
        timestamptz created_at
        timestamptz updated_at
    }
    ownership_claims {
        int id PK
        int establishment_id FK
        int user_id FK
        text message
        varchar contact_phone
        varchar status
        int reviewed_by_id FK
        timestamptz reviewed_at
        varchar review_note
        timestamptz created_at
        timestamptz updated_at
    }
    duplicate_dismissals {
        int id PK
        int establishment_a_id FK
        int establishment_b_id FK
        int dismissed_by_id FK
        timestamptz created_at
    }
    establishments {
        int id PK "ver su módulo"
    }
    users |o--o{ duplicate_dismissals : "dismissed_by_id"
    establishments ||--o{ duplicate_dismissals : "establishment_a_id"
    establishments ||--o{ duplicate_dismissals : "establishment_b_id"
    establishments ||--o{ favorites : "establishment_id"
    users ||--o{ favorites : "user_id"
    establishments ||--o{ ownership_claims : "establishment_id"
    users |o--o{ ownership_claims : "reviewed_by_id"
    users ||--o{ ownership_claims : "user_id"
    establishments |o--o{ reports : "establishment_id"
    users |o--o{ reports : "reporter_id"
    users |o--o{ reports : "resolved_by_id"
    reviews |o--o{ reports : "review_id"
    establishments ||--o{ reviews : "establishment_id"
    users ||--o{ reviews : "user_id"
    users |o--o{ search_history : "user_id"
```

## Asistente con IA (Spring Boot + JPA)

Consultas al asistente RAG, respuestas, fuentes con su similitud y calificaciones. Las tablas las crea Alembic y Spring Boot las usa con JPA (`gateway/.../asistente`).

```mermaid
erDiagram
    users {
        int id PK "ver su módulo"
    }
    consultas_ia {
        int id PK
        int usuario_id FK
        varchar pregunta
        varchar estado
        numeric umbral
        numeric mejor_similitud
        varchar detalle_error
        int duracion_ms
        timestamptz creada_en
        timestamptz respondida_en
    }
    respuestas_ia {
        int id PK
        int consulta_id FK,UK
        text respuesta
        text_array pasos
        varchar modelo
        timestamptz creada_en
    }
    fuentes_respuesta {
        int id PK
        int respuesta_id FK
        int establecimiento_id FK
        varchar nombre_establecimiento
        numeric similitud
        smallint posicion
    }
    calificaciones {
        int id PK
        int respuesta_id FK,UK
        smallint puntuacion
        varchar comentario
        timestamptz creada_en
        timestamptz actualizada_en
    }
    establishments {
        int id PK "ver su módulo"
    }
    respuestas_ia ||--o| calificaciones : "respuesta_id"
    users ||--o{ consultas_ia : "usuario_id"
    establishments |o--o{ fuentes_respuesta : "establecimiento_id"
    respuestas_ia ||--o{ fuentes_respuesta : "respuesta_id"
    consultas_ia ||--o| respuestas_ia : "consulta_id"
```

## Restricciones e índices principales

- **Integridad:** llaves foráneas con `ON DELETE CASCADE` (lo que depende de un usuario o negocio se borra con él) o `SET NULL` (se conserva el historial, por ejemplo las fuentes de una respuesta).
- **Reglas de negocio en la base (`CHECK`):** roles y estados válidos, calificaciones de 1 a 5, pregunta no vacía, umbral entre 0 y 1, similitudes entre -1 y 1.
- **Unicidad:** un correo por usuario, una reseña por usuario y negocio, un vector por elemento, una respuesta por consulta, una calificación por respuesta.
- **Índices:** HNSW de pgvector sobre `embeddings.embedding` (similitud coseno), índices de búsqueda de texto y por llaves foráneas, e historial del asistente por usuario y fecha.
