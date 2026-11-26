# Modelo relacional

Generado desde la base de datos real con `scripts/generar_modelo_relacional.py` el 2026-11-25.
21 tablas y 34 llaves foráneas.

**Notación:** `TABLA(atributos)`. **<u>subrayado</u>** = llave primaria (PK) · *cursiva →* = llave foránea (FK) y la tabla a la que apunta · `UQ` = único · `?` = puede quedar vacío (NULL).

## Catálogo de negocios y búsqueda semántica

- **PLACES**(<u>**id**</u>, name, normalized_name, kind, *parent_id → places*?, department?, latitude, longitude, osm_type?, osm_id?, created_at, updated_at)
  <sub>id: int, name: varchar, normalized_name: varchar, kind: varchar, parent_id: int, department: varchar, latitude: float, longitude: float, osm_type: varchar, osm_id: bigint, created_at: timestamptz, updated_at: timestamptz</sub>
- **CATEGORIES**(<u>**id**</u>, name, slug `UQ`, description?, *parent_id → categories*?, created_at, updated_at)
  <sub>id: int, name: varchar, slug: varchar, description: text, parent_id: int, created_at: timestamptz, updated_at: timestamptz</sub>
- **ESTABLISHMENTS**(<u>**id**</u>, name, slug `UQ`, description?, address?, neighborhood?, *municipality_id → places*?, latitude, longitude, timezone, phone?, whatsapp?, email?, website?, instagram?, facebook?, price_min?, price_max?, price_level?, rating_avg?, rating_count, hours_verified_at?, *owner_id → users*?, is_verified, status, *duplicate_of_id → establishments*?, source, osm_type?, osm_id?, osm_tags?, created_at, updated_at)
  <sub>id: int, name: varchar, slug: varchar, description: text, address: varchar, neighborhood: varchar, municipality_id: int, latitude: float, longitude: float, timezone: varchar, phone: varchar, whatsapp: varchar, email: varchar, website: varchar, instagram: varchar, facebook: varchar, price_min: numeric, price_max: numeric, price_level: smallint, rating_avg: numeric, rating_count: int, hours_verified_at: timestamptz, owner_id: int, is_verified: bool, status: varchar, duplicate_of_id: int, source: varchar, osm_type: varchar, osm_id: bigint, osm_tags: jsonb, created_at: timestamptz, updated_at: timestamptz</sub>
- **ESTABLISHMENT_CATEGORIES**(<u>***establishment_id → establishments***</u>, <u>***category_id → categories***</u>)
  <sub>establishment_id: int, category_id: int</sub>
- **OFFERINGS**(<u>**id**</u>, *establishment_id → establishments*, kind, name, description?, price?, is_available, created_at, updated_at, section?)
  <sub>id: int, establishment_id: int, kind: varchar, name: varchar, description: text, price: numeric, is_available: bool, created_at: timestamptz, updated_at: timestamptz, section: varchar</sub>
- **OPENING_HOURS**(<u>**id**</u>, *establishment_id → establishments*, day_of_week, opens_at, closes_at)
  <sub>id: int, establishment_id: int, day_of_week: smallint, opens_at: time, closes_at: time</sub>
- **SPECIAL_HOURS**(<u>**id**</u>, *establishment_id → establishments*, date, is_closed, opens_at?, closes_at?, note?)
  <sub>id: int, establishment_id: int, date: date, is_closed: bool, opens_at: time, closes_at: time, note: varchar</sub>
- **ESTABLISHMENT_PHOTOS**(<u>**id**</u>, *establishment_id → establishments*, url, caption?, sort_order, *uploaded_by_id → users*?, created_at, updated_at)
  <sub>id: int, establishment_id: int, url: varchar, caption: varchar, sort_order: int, uploaded_by_id: int, created_at: timestamptz, updated_at: timestamptz</sub>
- **EMBEDDINGS**(<u>**id**</u>, entity_type, entity_id, *establishment_id → establishments*, content, content_hash, model, embedding, updated_at)
  <sub>id: int, entity_type: varchar, entity_id: int, establishment_id: int, content: text, content_hash: varchar, model: varchar, embedding: vector, updated_at: timestamptz</sub>

## Usuarios e interacción

- **USERS**(<u>**id**</u>, email, password_hash, full_name, role, is_active, created_at, updated_at, password_changed_at?, email_verified_at?, verification_code_hash?, verification_code_expires_at?, verification_attempts, reset_code_hash?, reset_code_expires_at?, reset_attempts, notify_new_reviews, notify_review_replies)
  <sub>id: int, email: varchar, password_hash: varchar, full_name: varchar, role: varchar, is_active: bool, created_at: timestamptz, updated_at: timestamptz, password_changed_at: timestamptz, email_verified_at: timestamptz, verification_code_hash: varchar, verification_code_expires_at: timestamptz, verification_attempts: int, reset_code_hash: varchar, reset_code_expires_at: timestamptz, reset_attempts: int, notify_new_reviews: bool, notify_review_replies: bool</sub>
- **FAVORITES**(<u>***user_id → users***</u>, <u>***establishment_id → establishments***</u>, created_at)
  <sub>user_id: int, establishment_id: int, created_at: timestamptz</sub>
- **SEARCH_HISTORY**(<u>**id**</u>, *user_id → users*?, query_text, parsed_query?, location_label?, results_count, hidden_by_user, created_at)
  <sub>id: int, user_id: int, query_text: varchar, parsed_query: jsonb, location_label: varchar, results_count: int, hidden_by_user: bool, created_at: timestamptz</sub>
- **REVIEWS**(<u>**id**</u>, *establishment_id → establishments*, *user_id → users*, rating, comment?, status, moderation_reason?, created_at, updated_at, owner_reply?, owner_reply_at?)
  <sub>id: int, establishment_id: int, user_id: int, rating: smallint, comment: text, status: varchar, moderation_reason: varchar, created_at: timestamptz, updated_at: timestamptz, owner_reply: text, owner_reply_at: timestamptz</sub>
- **REPORTS**(<u>**id**</u>, *reporter_id → users*?, *establishment_id → establishments*?, *review_id → reviews*?, report_type, message?, status, *resolved_by_id → users*?, created_at, updated_at)
  <sub>id: int, reporter_id: int, establishment_id: int, review_id: int, report_type: varchar, message: text, status: varchar, resolved_by_id: int, created_at: timestamptz, updated_at: timestamptz</sub>
- **OWNERSHIP_CLAIMS**(<u>**id**</u>, *establishment_id → establishments*?, *user_id → users*, message?, contact_phone?, status, *reviewed_by_id → users*?, reviewed_at?, review_note?, created_at, updated_at, kind, applicant_role?, applicant_position?, proposed_data?, consent_at?)
  <sub>id: int, establishment_id: int, user_id: int, message: text, contact_phone: varchar, status: varchar, reviewed_by_id: int, reviewed_at: timestamptz, review_note: varchar, created_at: timestamptz, updated_at: timestamptz, kind: varchar, applicant_role: varchar, applicant_position: varchar, proposed_data: jsonb, consent_at: timestamptz</sub>
- **DUPLICATE_DISMISSALS**(<u>**id**</u>, *establishment_a_id → establishments*, *establishment_b_id → establishments*, *dismissed_by_id → users*?, created_at)
  <sub>id: int, establishment_a_id: int, establishment_b_id: int, dismissed_by_id: int, created_at: timestamptz</sub>
- **PAGE_VIEWS**(<u>**id**</u>, created_at, section, path, *establishment_id → establishments*?, visitor_hash, device, referrer?, is_logged_in)
  <sub>id: bigint, created_at: timestamptz, section: varchar, path: varchar, establishment_id: int, visitor_hash: varchar, device: varchar, referrer: varchar, is_logged_in: bool</sub>

## Asistente con IA (Spring Boot + JPA)

- **CONSULTAS_IA**(<u>**id**</u>, *usuario_id → users*, pregunta, estado, umbral, mejor_similitud?, detalle_error?, duracion_ms?, creada_en, respondida_en?)
  <sub>id: int, usuario_id: int, pregunta: varchar, estado: varchar, umbral: numeric, mejor_similitud: numeric, detalle_error: varchar, duracion_ms: int, creada_en: timestamptz, respondida_en: timestamptz</sub>
- **RESPUESTAS_IA**(<u>**id**</u>, *consulta_id → consultas_ia* `UQ`, respuesta, pasos, modelo?, creada_en)
  <sub>id: int, consulta_id: int, respuesta: text, pasos: text_array, modelo: varchar, creada_en: timestamptz</sub>
- **FUENTES_RESPUESTA**(<u>**id**</u>, *respuesta_id → respuestas_ia*, *establecimiento_id → establishments*?, nombre_establecimiento, similitud, posicion)
  <sub>id: int, respuesta_id: int, establecimiento_id: int, nombre_establecimiento: varchar, similitud: numeric, posicion: smallint</sub>
- **CALIFICACIONES**(<u>**id**</u>, *respuesta_id → respuestas_ia* `UQ`, puntuacion, comentario?, creada_en, actualizada_en)
  <sub>id: int, respuesta_id: int, puntuacion: smallint, comentario: varchar, creada_en: timestamptz, actualizada_en: timestamptz</sub>

## Llaves foráneas

| Tabla | Columna | Apunta a | ¿Puede quedar vacía? |
|---|---|---|---|
| `calificaciones` | `respuesta_id` | `respuestas_ia` | no |
| `categories` | `parent_id` | `categories` | sí |
| `consultas_ia` | `usuario_id` | `users` | no |
| `duplicate_dismissals` | `dismissed_by_id` | `users` | sí |
| `duplicate_dismissals` | `establishment_a_id` | `establishments` | no |
| `duplicate_dismissals` | `establishment_b_id` | `establishments` | no |
| `embeddings` | `establishment_id` | `establishments` | no |
| `establishment_categories` | `category_id` | `categories` | no |
| `establishment_categories` | `establishment_id` | `establishments` | no |
| `establishment_photos` | `establishment_id` | `establishments` | no |
| `establishment_photos` | `uploaded_by_id` | `users` | sí |
| `establishments` | `duplicate_of_id` | `establishments` | sí |
| `establishments` | `municipality_id` | `places` | sí |
| `establishments` | `owner_id` | `users` | sí |
| `favorites` | `establishment_id` | `establishments` | no |
| `favorites` | `user_id` | `users` | no |
| `fuentes_respuesta` | `establecimiento_id` | `establishments` | sí |
| `fuentes_respuesta` | `respuesta_id` | `respuestas_ia` | no |
| `offerings` | `establishment_id` | `establishments` | no |
| `opening_hours` | `establishment_id` | `establishments` | no |
| `ownership_claims` | `establishment_id` | `establishments` | sí |
| `ownership_claims` | `reviewed_by_id` | `users` | sí |
| `ownership_claims` | `user_id` | `users` | no |
| `page_views` | `establishment_id` | `establishments` | sí |
| `places` | `parent_id` | `places` | sí |
| `reports` | `establishment_id` | `establishments` | sí |
| `reports` | `reporter_id` | `users` | sí |
| `reports` | `resolved_by_id` | `users` | sí |
| `reports` | `review_id` | `reviews` | sí |
| `respuestas_ia` | `consulta_id` | `consultas_ia` | no |
| `reviews` | `establishment_id` | `establishments` | no |
| `reviews` | `user_id` | `users` | no |
| `search_history` | `user_id` | `users` | sí |
| `special_hours` | `establishment_id` | `establishments` | no |
