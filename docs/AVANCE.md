# Registro de avance — Easy Search

## Decisiones acordadas

| Tema | Decisión |
|---|---|
| Fuente de datos | OpenStreetMap + información manual y de propietarios |
| Proveedor de LLM | Google Gemini (`gemini-2.5-flash-lite`, respaldo `gemini-2.5-flash`) detrás de una interfaz intercambiable |
| Publicación | Plesk, después de que todo funcione en local |
| Infraestructura | Docker Desktop local |
| Entrega | 25 de noviembre de 2026 |
| Repositorio | github.com/SantiagovillamizarM/Easy-Seach |
| Puertos | PostgreSQL 5440, FastAPI 8010, Spring Boot 8020, n8n 5690, frontend 5173 (otros proyectos ocupan 5432, 5433, 5678 y 8000) |
| Tecnologías exigidas por la materia | Spring Boot + JPA, n8n, embeddings, búsqueda semántica y RAG. El profesor aprobó pgvector en lugar de Qdrant y se usa Gemini en lugar de OpenRouter |
| Alcance tomado del enunciado de la materia | Solo las **tecnologías** y los **entregables**; sus funciones (análisis de datos, dashboard, informe de análisis) no aplican porque Easy Search es un proyecto distinto |
| Arquitectura con Spring Boot | Híbrida: Spring Boot es la única puerta del frontend; atiende con JPA los módulos nuevos (asistente IA, analítica) y reenvía el resto a FastAPI |

## Fases

| Fase | Estado |
|---|---|
| 0 — Entorno de desarrollo | ✅ Completada |
| 1 — Modelo de datos y autenticación | ✅ Completada |
| 2 — Establecimientos, horarios y embeddings | ✅ Completada |
| 3 — Motor de búsqueda inteligente | ✅ Completada |
| 4 — Frontend de búsqueda | ✅ Completada |
| 5 — Recomendaciones IA y cuenta de usuario | ✅ Completada |
| 6 — Reseñas y panel comercial | ✅ Completada |
| 7 — Panel administrativo | ✅ Completada |
| 8 — Calidad y seguridad | ✅ Completada |
| 9 — Puerta de entrada Spring Boot | ✅ Completada |
| 10 — Asistente IA con n8n (RAG) | ✅ Completada |
| 11 — Entregables y cierre | 🔄 En curso |

## Fase 0 — Entorno de desarrollo

**Hecho:**
- `docker-compose.yml` con la imagen `pgvector/pgvector:pg16`, expuesta solo en `127.0.0.1:5440`.
- Extensiones creadas automáticamente: `vector` 0.8.7, `unaccent`, `pg_trgm`.
- Backend FastAPI con configuración por `.env` y endpoint `GET /api/health`, que comprueba la API, la conexión
  a PostgreSQL, la versión de pgvector y ejecuta una consulta real de distancia coseno.
- Frontend React + Vite + Tailwind con una página temporal de estado del sistema y proxy `/api` → backend.
- Prueba automatizada `tests/test_health.py`.

**Verificado:**
- `pytest`: 1 prueba pasando.
- `GET http://127.0.0.1:8010/api/health` y `GET http://localhost:5173/api/health` (a través del proxy) responden
  `{"api":"ok","database":"ok","pgvector":"0.8.7","vector_test_cosine_distance":0.2928…}`.
- `vite build` compila sin errores.

**Problemas encontrados y solución:**
- El puerto 5433 estaba ocupado por otro contenedor (`postgres_db`) → se usa el 5440.
- La conexión con `localhost` tardaba unos 130 s (Windows intenta IPv6 primero) → `DATABASE_URL` usa `127.0.0.1`.
- Vite escuchaba solo en IPv6 (`::1`), y el navegador mostraba `ERR_CONNECTION_REFUSED` → `vite.config.js` fija
  `host: "127.0.0.1"`. El frontend se abre en http://127.0.0.1:5173.

## Fase 1 — Modelo de datos y autenticación

**Hecho:**
- 15 tablas con SQLAlchemy y migración inicial de Alembic: `users`, `places`, `categories`, `establishments`,
  `establishment_categories`, `offerings`, `establishment_photos`, `opening_hours`, `special_hours`, `embeddings`,
  `favorites`, `search_history`, `reviews`, `reports`, `ownership_claims`.
- Tabla `embeddings` con columna `vector(384)` e índice **HNSW** (`vector_cosine_ops`).
- Horarios preparados para horarios divididos, horarios que cruzan la medianoche, excepciones por fecha y zona
  horaria por establecimiento.
- Reglas de integridad en la base de datos: roles válidos, calificación entre 1 y 5, una reseña por usuario y
  establecimiento, rangos de precio coherentes.
- Privacidad: `search_history` no guarda coordenadas del usuario.
- Autenticación: registro, login (OAuth2 + JWT) y `/auth/me`. Contraseñas con Argon2. El registro siempre crea
  rol `user`. El login responde igual si el correo no existe o si la contraseña es incorrecta.
- Roles: dependencia `require_roles(...)`. Endpoints `/admin/users` y `/admin/stats` solo para administradores.
- Script `scripts.create_admin` (la contraseña se pide por teclado, sin quedar en el historial).
- 25 categorías con su equivalencia en etiquetas de OpenStreetMap.
- Script `scripts.import_osm`: reintentos con espera exponencial entre 3 servidores Overpass, copia local de
  las descargas y ejecución repetible sin duplicados. No sobrescribe establecimientos editados por propietarios.

**Datos importados (OpenStreetMap):**

| Municipio | Establecimientos | Con teléfono | Con web | Con horario |
|---|---|---|---|---|
| Bucaramanga | 867 | 72 | 44 | 86 |
| Floridablanca | 154 | 10 | 11 | 11 |
| Piedecuesta | 83 | 8 | 0 | 7 |
| Girón | 57 | 5 | 1 | 9 |
| **Total** | **1.161** | 95 | 56 | 113 |

Además: 4 municipios y 260 barrios con coordenadas reales.

**Verificado:**
- `pytest`: 14 pruebas pasando (registro, validaciones, duplicados, login, token inválido, 401/403 por rol,
  categorías OSM).
- Las pruebas usan una base de datos separada (`easysearch_test`) que se crea y se migra sola.
- Prueba manual contra el servidor: registro → login → `/me` = 200; `/admin/users` = 403 como usuario
  normal y 401 sin token.
- Segunda ejecución de la importación: 0 nuevos y 1.161 actualizados (sin duplicados).

**Limitaciones encontradas:**
- OSM no tiene precios ni descripciones, y solo el ~10 % de los establecimientos tiene teléfono u horario.
  Hay que completar datos a mano o desde el panel de propietarios.
- Los servidores públicos de Overpass se saturan con frecuencia: la importación puede tardar unos 15 minutos.

## Fase 2 — Establecimientos, horarios y embeddings

**Hecho:**
- Intérprete del formato `opening_hours` de OSM: rangos de días, listas, horarios partidos, reglas que se
  sobrescriben, reglas aditivas, `24/7`, `24:00`, cruces de medianoche, `off`. Lo que no se entiende con
  seguridad (ej. `sunrise-sunset`) queda como "sin información".
- Cálculo de **abierto / cerrado / sin información** en la zona horaria del establecimiento, con excepciones
  por fecha, próxima apertura y hora de cierre. Indica si el horario fue verificado por una persona.
- Embeddings locales con `intfloat/multilingual-e5-small` (384 dimensiones). Texto canónico con nombre,
  categorías, cocina traducida al español, descripción, productos y ubicación. Se recalcula solo si cambia
  el hash del texto.
- API del catálogo: categorías, lugares (autocompletar), listado, detalle, crear (admin), editar,
  horario semanal, horarios especiales, productos y servicios (admin o propietario del establecimiento).
  Cada edición regenera los embeddings afectados.
- `GET /api/semantic-preview`: búsqueda vectorial pura con pgvector, para verificar (no es la búsqueda final).
- Scripts: `reindex_embeddings`, `import_csv` (con `--dry-run`) y guía `docs/CARGA_MANUAL.md`.

**Verificado:**
- `pytest`: 39 pruebas pasando (16 de horarios, 9 de catálogo, permisos y regeneración de embeddings).
- 112 de 113 horarios reales de OSM interpretados (el restante es `sunrise-sunset`).
- 1.161 vectores generados en 110 s; segunda ejecución: 0 regenerados (1 s).
- Búsqueda vectorial real: "quiero comer una hamburguesa" → hamburgueserías; "mecánico que arregle llantas de
  busetas" → Clínica de Llantas y Rines; "tomar café y desayunar" → cafeterías; "medicamentos para la gripa"
  → droguerías.
- `import_csv --dry-run`: acepta las filas válidas y rechaza con mensaje claro municipio, slug, rango de
  precios, horario y categoría inválidos.

**Limitaciones:**
- La similitud vectorial sola trae algo de ruido (ej. "welcome — Deportes" al buscar llantas). En la Fase 3 se
  combina con búsqueda por palabras clave y filtros.
- Los festivos (`PH`) de OSM se ignoran porque no hay un calendario de festivos por establecimiento; se
  manejan con horarios especiales.

## Fase 3 — Motor de búsqueda inteligente

**Hecho:**
- Capa de IA intercambiable (`services/llm`) con adaptador para Gemini (API REST, salida JSON con esquema,
  modelo de respaldo si el principal está saturado). La clave va en un encabezado, nunca en la URL.
- Selección del modelo con pruebas reales: `gemini-2.5-flash-lite` interpretó correctamente en 1,3 s;
  `gemini-3.5-flash-lite` tardó 9,6 s; `gemini-3.8-flash` estaba saturado.
- Intérprete de consultas: Gemini primero, reglas como respaldo (presupuesto en formatos "25 mil", "25.000",
  "$25000", "20k"; "cerca" vs "cerca de <lugar>"; abierto ahora; barato; bien calificado; categorías).
  **Antiinvención:** se descarta un presupuesto o lugar que la IA devuelva sin que el usuario lo haya escrito.
  Caché en memoria para no gastar cuota con consultas repetidas.
- Resolución de lugares contra la tabla `places` (municipios, barrios, alias como "bga" o "Cabecera"). Las
  coordenadas siempre salen de la base de datos.
- Búsqueda híbrida en una sola petición:
  - vectorial con pgvector (índice HNSW + `hnsw.iterative_scan` para no perder resultados al filtrar),
  - full-text en español sin tildes, ignorando palabras genéricas,
  - fusión con Reciprocal Rank Fusion, más ajustes por categoría, calificación, cercanía, presupuesto y verificación,
  - descarte de resultados que solo "se parecen" pero no son de una categoría afín.
- Ubicación: lugar escrito → filtro por municipio; "cerca" + GPS → radio de 3 km (se amplía a 8 km si hay
  pocos resultados); "cerca" sin GPS → se pide la ubicación; GPS sin pedir lugar → se prioriza lo cercano.
- Filtros: presupuesto (solo excluye lo que se sabe que es más caro), calificación mínima, categoría y
  abierto ahora (oculta lo que no tiene horario y lo avisa).
- `POST /api/search` (coordenadas en el cuerpo, no en la URL). Guarda historial **sin coordenadas**.
- El modelo de embeddings se precarga al iniciar el servidor (la primera búsqueda ya no tarda 30 s).
- `/api/semantic-preview` queda solo para administradores.
- Script `scripts.eval_search` para evaluar con los ejemplos de la propuesta.

**Verificado:**
- `pytest`: 60 pruebas pasando (21 nuevas: presupuestos, cercanía, respaldo ante fallo de la IA,
  antiinvención, caché, filtros por lugar/presupuesto/radio/horario, historial sin coordenadas, validaciones).
  Las pruebas nunca llaman a la IA real.
- Evaluación real (Gemini + pgvector + OSM):
  - "Hamburguesa en Piedecuesta" → Pancha comida, Lis Burger, Garroteros (hamburgueserías de Piedecuesta).
  - "Mecánico que arregle llantas de busetas en Bucaramanga" → Clínica de Llantas y Rines + talleres.
  - "Hamburguesas en Bucaramanga, máximo 25.000" → hamburgueserías + aviso de precios no registrados.
  - "Comprar llantas para una buseta" → Clínica de Llantas y Rines + talleres y repuestos (sin ruido).
  - "Algo rico, no tan caro, cerca" con GPS en Piedecuesta → restaurantes a 0,1–0,7 km; sin GPS → pide ubicación.
  - "hamburguesas" con GPS en Piedecuesta → primero las 3 de Piedecuesta (< 1 km), luego Bucaramanga.
- Servidor real: ~2 s por búsqueda con Gemini.

**Limitaciones:**
- Con los datos actuales de OSM no hay precios, así que el filtro de presupuesto casi nunca puede confirmar
  "dentro del presupuesto". Se avisa al usuario. Mejora con la carga manual (CSV) y el panel de propietarios.
- "en la cancha" puede confundirse con el barrio "La Cancha" (nombre genérico en OSM).
- Plan gratuito de Gemini: si se agota la cuota, la búsqueda sigue funcionando con reglas.

## Fase 4 — Frontend de búsqueda

Rama: `feature/fase-4-frontend`.

**Hecho:**
- Sistema de diseño propio (`src/index.css`): tinta azul profundo, índigo de marca, verde para "abierto",
  tipografía Plus Jakarta Sans instalada localmente, componentes `card`, `btn-*`, `chip`, `input`.
- Páginas:
  - **Inicio** (`/`): el buscador como protagonista, ejemplos de la propuesta, accesos rápidos, "Cómo funciona" y
    compromiso de información real.
  - **Resultados** (`/buscar?q=…`): barra "Entendimos" (transparencia de la IA), avisos, lista con tarjetas
    numeradas, mapa con marcadores sincronizados, filtros (lugar con autocompletar, distancia, presupuesto,
    calificación, categoría, abierto ahora). En celular: panel inferior de filtros y pestañas Lista/Mapa.
  - **Detalle** (`/lugar/:slug`): estado del horario, precio, dirección, botones (Cómo llegar, Llamar, WhatsApp,
    Sitio web, Instagram; solo si existe el dato), descripción, productos y servicios, fotos, mapa, horario semanal
    con el día de hoy resaltado, horarios especiales y la fuente de los datos.
  - **404** para rutas inexistentes.
- Ubicación del navegador: se pide solo cuando el usuario lo decide; las coordenadas viven en memoria (no en URL ni
  localStorage). Si la búsqueda dice "cerca" y no hay permiso, aparece un aviso con el botón "Usar mi ubicación".
- Los filtros viven en la URL (se pueden compartir), sin coordenadas. El panel muestra los filtros que aplicó la IA,
  y desmarcar "abierto ahora" envía un `false` explícito para respetar al usuario.
- El mapa se carga aparte (lazy loading): la página inicial pesa menos.
- Atribución de OpenStreetMap en el pie de página, el mapa y el detalle.

**Verificado (capturas con Edge headless contra el backend real):**
- Escritorio: inicio, resultados con mapa, detalle, búsqueda con "abierto ahora" + presupuesto (el panel refleja
  lo que entendió la IA).
- Celular (iframe de 390 px): inicio, resultados y detalle sin desbordamientos.
- Consola del navegador sin errores en inicio, resultados, detalle, lugar inexistente y ruta inexistente.
- `vite build` sin errores.

**Problemas encontrados y solución:**
- Tailwind v4 no permite `@apply` de clases propias declaradas en `@layer components` → se usan `@utility`.
- Lucide eliminó los íconos de marcas (Instagram) → ícono genérico `AtSign`.
- La regla global de foco estaba fuera de las capas de Tailwind y ganaba a las clases → movida a `@layer base`.

**Pendiente para fases siguientes:** recomendaciones de IA en los resultados (Fase 5), iniciar sesión, favoritos e
historial (Fase 5), reseñas (Fase 6).

## Fase 5 — Recomendaciones IA y cuenta de usuario

Rama: `feature/fase-5-cuenta-recomendaciones` (3 bloques, un commit por bloque).

**Bloque 1 — Recomendaciones con IA:**
- `POST /api/recommendations`: recibe la consulta y hasta 6 ids; el servidor vuelve a leer los datos de la base
  (no confía en el navegador) y reutiliza la interpretación en caché (no gasta otra llamada a Gemini).
- Ficha de hechos por establecimiento: solo datos guardados (categorías, cocina, descripción, precios, productos,
  calificación, reseñas aprobadas). El horario NO se envía a la IA: la interfaz ya lo muestra con su advertencia.
- **Validación anti-invención:** se eliminan las frases con precios, horas o calificaciones que no estén en la
  ficha. Si todo se elimina o la IA falla, se usa una recomendación por plantillas.
- Las carencias de información (precios, horario, reseñas, descripción) se calculan sin IA y siempre se muestran.
- Gemini: si un modelo responde 429 (cuota agotada) o 503, se salta 60 s y se usa el de respaldo.
- Frontend: los resultados se muestran primero y las recomendaciones llegan después (no retrasan la búsqueda).

**Bloque 2 — Cuenta:**
- `PATCH /api/auth/me` (nombre) y `POST /api/auth/change-password` (exige la contraseña actual).
- Páginas `/ingresar`, `/registro` y `/perfil`; menú de usuario en el encabezado; rutas protegidas que regresan a
  la página original después del login (solo redirecciones internas).
- Sesión: token en `localStorage` con verificación de expiración; si el servidor responde 401, la sesión se cierra.

**Bloque 3 — Favoritos e historial:**
- `GET/PUT/DELETE /api/me/favorites[/{id}]`, `GET /api/me/favorites/ids`, `GET /api/me/history`,
  `DELETE /api/me/history[/{id}]`. Las rutas no reciben un `user_id`: solo operan sobre el usuario del token.
- Borrar del historial **desvincula** la búsqueda de la cuenta (queda anónima para estadísticas).
- Corazón de favorito en resultados y detalle (cambio optimista que se revierte si falla); páginas `/favoritos` e
  `/historial` (agrupado por día, "Buscar de nuevo", eliminar uno o todo con confirmación).

**Verificado:**
- `pytest`: 75 pruebas pasando (8 de recomendaciones, 2 de perfil y contraseña, 6 de favoritos e historial,
  incluidas las de privacidad entre usuarios).
- Recomendaciones reales con Gemini en ~2 s, sin deducciones a partir del nombre del negocio.
- Recorrido completo con un usuario temporal contra el servidor real: login, perfil, favoritos, historial y
  corazones marcados en los resultados (usuario eliminado después).

**Problemas encontrados y solución:**
- Cuota gratuita de `gemini-2.5-flash-lite` agotada (HTTP 429) → pausa de 60 s y modelo de respaldo.
- La IA deducía especialidades a partir del nombre ("Unifrenos se especializa en frenos") → instrucciones más
  estrictas.
- Tras `git pull`, Git en Windows dejó archivos con saltos de línea CRLF y algunos reemplazos automáticos no se
  aplicaron (la app quedó en blanco) → detectado en la consola del navegador y corregido.

## Fase 6 — Reseñas y panel comercial

Rama: `feature/fase-6-resenas-panel-comercial` (3 commits: reseñas, solicitudes y fotos, panel comercial).

**Bloque A — Reseñas con moderación:**
- Una reseña por usuario y establecimiento (1 a 5 estrellas + comentario); el propietario no puede reseñar su
  propio negocio. Se muestra el autor como "Nombre I." (sin el apellido completo).
- Moderación por capas: reglas (insultos, enlaces o correos, teléfonos, todo en mayúsculas, caracteres repetidos)
  → Gemini → si la IA no está
  disponible, la reseña queda **pendiente** para revisión humana. Límite de 5 reseñas por hora y detección de
  duplicados. Editar una reseña la vuelve a moderar.
- La calificación promedio se recalcula solo con reseñas aprobadas. Reportes: uno por usuario y reseña.

**Bloque B1 — Solicitudes de propiedad y fotos:**
- `POST /api/establishments/{id}/claims` y `GET /api/me/claims`. Un admin las aprueba o rechaza
  (`/api/admin/claims`); al aprobar, el negocio queda verificado, el usuario pasa a rol `owner` y las demás
  solicitudes pendientes del mismo negocio se rechazan.
- Fotos (`POST/DELETE /api/establishments/{id}/photos`): solo imágenes reales (Pillow), máximo 5 MB y 10 por negocio.
  Se convierten a WebP, se redimensionan a 1600 px y **se eliminan los metadatos EXIF y la ubicación GPS**.
  Nombres aleatorios y servidas desde `/uploads`.

**Bloque B2 — Panel comercial:**
- `/panel`: negocios del propietario con barra de "perfil completo" (descripción, horario, productos, fotos) y
  estado de sus solicitudes. Enlace "Panel comercial" en el menú para propietarios y administradores.
- `/panel/lugar/:id` con 4 pestañas: **Información** (datos, categorías, precios, contacto), **Horario** (semanal
  con jornada partida, 24 horas, cerrado; festivos y fechas especiales), **Productos y servicios** (crear, editar,
  ocultar temporalmente, eliminar) y **Fotos** (subir y eliminar).
- `GET /api/owner/establishments/{id}`: datos para el editor; incluye los productos ocultos (el detalle público no).
- Guardar el horario lo marca como **confirmado** por el establecimiento.

**Verificado:**
- `pytest`: 103 pruebas pasando (incluye eliminación de EXIF/GPS, rechazo de archivos falsos y permisos entre
  propietarios).
- Recorrido completo con un usuario y un negocio temporales contra el servidor real: información, horario, fecha
  especial, productos (uno oculto), fotos; capturas en escritorio y celular. Subida de fotos probada desde el
  navegador con `FormData`. Datos y archivos de prueba eliminados después.

**Problemas encontrados y solución:**
- En Windows una prueba no podía borrar la foto porque seguía abierta → la prueba cierra la imagen (`with`) y el
  borrado tolera archivos bloqueados.
- Un id de negocio no numérico en la URL mostraba un error técnico en inglés → ahora dice "Este negocio no existe".

## Fase 7 — Panel administrativo

Rama: `feature/fase-7-panel-admin` (2 commits: API y la interfaz).

**Bloque A — API (`/api/admin/*`, solo rol admin):**
- `overview`: tareas pendientes (reseñas, reportes, solicitudes, duplicados) y completitud de los datos.
- Moderación de reseñas (`reviews`, `approve`, `reject`): recalcula la calificación, cierra los reportes y
  conserva `updated_at` (moderar no marca la reseña como "editada").
- Negocios: búsqueda sin tildes, filtros, ocultar/reactivar, marcar como duplicado de otro, verificar y quitar dueño.
  Ocultar no borra nada; todas las vistas públicas ya filtraban por `status = 'active'`.
- Duplicados: nombre parecido (trigramas de `pg_trgm`, ≥ 0,45) a menos de 200 m; se descartan los pares cuyo nombre
  solo cambia en un número o letra ("Cabecera II Etapa" vs "III Etapa"). Tabla nueva `duplicate_dismissals`
  (migración `5d46ac6b4e8a`) para los pares marcados como "no son duplicados".
- Usuarios: búsqueda, cambio de rol (al pasar a "usuario" sus negocios quedan sin dueño) y desactivación. Un admin no
  puede quitarse su propio rol ni desactivarse.
- Categorías: solo lectura con conteos (se definen en `app/data/categories.py` porque el buscador usa sus palabras
  clave). Estadísticas de búsqueda: por día, más buscadas, sin resultados y categorías.

**Bloque B — Interfaz `/admin`** (carga diferida: no pesa para los demás usuarios):
- Resumen, Reseñas (por revisar / reportadas / rechazadas / publicadas, con motivos predefinidos), Solicitudes,
  Negocios (el botón Editar reutiliza el editor del panel comercial), Duplicados (lado a lado, con sugerencia de cuál
  conservar), Usuarios, Búsquedas (gráfica SVG por día con tooltip y tabla para lectores de pantalla) y Categorías.
- Contadores de pendientes en el menú lateral; enlace "Panel administrativo" en el menú de usuario.

**Verificado:**
- `pytest`: 114 pruebas pasando (11 del panel admin).
- Con datos reales: 71 pares de posibles duplicados en ~300 ms (muchas estaciones Terpel/Primax duplicadas en OSM).
- Recorrido con un admin, usuarios y un negocio temporales: capturas de todas las secciones y acciones ejecutadas desde
  el navegador con el `api.js` real (aprobar, rechazar con motivo, aprobar solicitud, ocultar, autoprotección del
  admin). Datos de prueba eliminados.

**Problemas encontrados y solución:**
- `/admin/duplicates` y `/admin/establishments` daban error 500 con datos reales: las categorías eran objetos de
  SQLAlchemy dentro de un `dict` (las pruebas no lo detectaron porque sus negocios no tenían categoría) → se convierten
  a dict y la prueba ahora incluye una categoría.
- El parámetro `q` de la URL del panel se mostraba en la barra de búsqueda del encabezado → se renombró a `texto`.
- Abrir una búsqueda desde las estadísticas habría registrado una búsqueda nueva y alterado los datos → las búsquedas
  se muestran como texto, sin enlace.

## Fase 8 — Calidad y seguridad

Rama: `feature/fase-8-calidad-seguridad` (2 commits: seguridad y calidad).

**Bloque A — Seguridad:**
- Límite de intentos en memoria (ventana deslizante, `app/core/rate_limit.py`), con respuesta 429 y `Retry-After`:
  login 20/5 min por IP y 5 fallos/15 min por correo (mismo trato si la cuenta no existe), registro 5/hora por IP,
  búsqueda 60/min y recomendaciones 30/min por IP, cambio de contraseña 5/15 min, solicitudes 5/día, reportes
  20/hora y fotos 30/hora por usuario.
- Cambiar la contraseña invalida los tokens anteriores (`users.password_changed_at`, migración `3d2139ad04b6`) y
  devuelve un token nuevo para el dispositivo actual.
- Cabeceras: `nosniff`, `X-Frame-Options: DENY`, CSP restrictiva en la API, `Permissions-Policy`, COOP y HSTS en
  producción. Peticiones de más de 6 MB → 413. Errores no previstos → mensaje genérico (detalle solo en el log).
- En producción la app no arranca con `SECRET_KEY` de ejemplo o corta, ni con CORS `*` o `http://`; `/docs` se apaga.
  CORS sin cookies y solo con los métodos y cabeceras usados.

**Bloque B — Calidad:**
- ESLint (`npm run lint`) con reglas de React Hooks; las reglas que dieron falsos positivos quedaron documentadas en
  `eslint.config.js`.
- Pantalla de error (ErrorBoundary) en la raíz y por página: nunca más una página en blanco; detecta también cuando
  hay una versión nueva publicada y pide recargar.
- Auditoría de dependencias: npm sin vulnerabilidades; Pillow 12.3 tenía vulnerabilidades conocidas (procesa las fotos
  que suben los usuarios) → actualizado a 13.0; pytest → 9.2.
- Benchmark de búsqueda (`scripts/benchmark_search.py`, 22 consultas etiquetadas, modo solo reglas):
  precisión@5 88 %, **encontrados/disponibles 99 %**, municipio correcto 100 %, 0 consultas sin resultados,
  mediana 232 ms / p95 288 ms. Los casos con baja precisión son de datos escasos (p. ej. 1 sola veterinaria en
  Floridablanca en OSM), no del algoritmo.

**Verificado:**
- `pytest`: 127 pruebas pasando (12 de seguridad, 1 de regresión del intérprete).
- Contra el servidor real: cabeceras presentes, bloqueo tras 5 fallos (incluso con la clave correcta), token viejo
  rechazado tras cambiar la contraseña, petición de 7 MB rechazada con 413.

**Problemas encontrados y solución:**
- El benchmark reveló que las palabras clave del intérprete coincidían dentro de otras palabras: "rin" (rines) en
  "vete**rin**aria", "comer" en "**comer**cial", "unas" (uñas) en el artículo "unas"; y "perro" se tomaba como perro
  caliente → ahora solo coinciden al inicio de una palabra y se ajustaron las palabras ambiguas.
- Una sesión corrupta guardada en el navegador hacía fallar la app en cada recarga → se valida su forma y se descarta.

## Fase 9 — Puerta de entrada Spring Boot

Rama: `feature/fase-9-spring-boot`.

**Por qué:** la materia exige Spring Boot y que toda consulta inteligente pase primero por él, sin que el frontend
consuma directamente la IA ni n8n. Reescribir FastAPI (68 endpoints) no cabía en el plazo, así que Spring Boot se
pone delante como única puerta de entrada.

**Bloque A — Reenvío a FastAPI:**
- Proyecto Maven `gateway/` (Spring Boot 4.2, Java 21) generado con Spring Initializr; lee el mismo `.env`.
- `FastApiProxyController` atiende `/api/**` y `/uploads/**` y reenvía método, ruta, consulta, cuerpo y cabeceras
  tal cual. Spring elige siempre la ruta más específica, así que los endpoints nuevos que se creen en Spring
  tendrán prioridad sin tocar el frontend.
- IP real del cliente: se descarta cualquier `X-Forwarded-For` que mande el navegador y se envía la IP de la
  conexión; uvicorn confía en esa cabecera solo si viene de 127.0.0.1, así los límites de intentos siguen por IP.
- Límite de 6 MB también en Spring (413 sin llamar a FastAPI); si FastAPI está apagado responde 502 y si tarda
  más de 60 s, 504, con el mismo formato `{"detail": "..."}` que el frontend ya sabe mostrar.
- CORS lo resuelve Spring (mismas reglas que tenía FastAPI) y se descartan las cabeceras CORS de FastAPI.
- Las redirecciones de FastAPI a su dirección interna (`http://127.0.0.1:8010/...`) se convierten en rutas relativas.
- Vite reenvía `/api` y `/uploads` al puerto 8020 en lugar del 8010.

**Verificado:**
- `mvnw test`: 9 pruebas con Tomcat real y un FastAPI falso (cuerpo JSON y formulario intactos, cabeceras
  `Retry-After` y `X-Error-Code`, IP falsificada reemplazada, 413, 502, redirecciones, fotos y CORS).
- Con la app real: `/api/health` idéntico directo y por Spring (incluidas las cabeceras de seguridad); login con
  formulario, perfil, historial, 401 sin token y búsqueda funcionan por Spring, y también desde Vite (5173 → 8020 → 8010).

**Bloque B — Seguridad, JPA y Swagger:**
- Entidad JPA `Usuario` sobre la tabla `users` de FastAPI, de solo lectura (`@Immutable`) y sin la contraseña.
  Hibernate valida al arrancar que coincide con la tabla real (`ddl-auto=validate`); `id` es `Integer` porque la
  columna es `integer`.
- Spring Security valida el **mismo token** que emite FastAPI: HS256 con `SECRET_KEY` y vencimiento, y luego
  las mismas reglas de `deps.py`: usuario existente y activo, y token posterior al último cambio de contraseña.
  Con una `SECRET_KEY` de menos de 32 caracteres Spring no arranca y explica cómo generar una.
- Dos cadenas de seguridad: las rutas propias de Spring (`/api/asistente` exige correo confirmado,
  `/api/analitica` solo admin, `/api/sistema/sesion` sesión) y el resto, que se reenvía sin revisar porque
  FastAPI ya aplica sus reglas (así una búsqueda pública con un token vencido se comporta igual que antes).
- Errores 401/403 con el mismo formato y mensajes de FastAPI, incluido `X-Error-Code: email_not_verified`.
- Una ruta de Spring que no existe responde 404 y nunca se reenvía a FastAPI.
- Endpoints `GET /api/sistema/estado` (público: Spring, PostgreSQL y FastAPI) y `GET /api/sistema/sesion`.
- Swagger UI (springdoc) en `/swagger-ui.html` con las dos especificaciones: la de Spring y la de FastAPI
  (reenviada por `/openapi.json`). Se apaga con `SWAGGER_ENABLED=false`.

**Verificado (bloque B):**
- `mvnw test`: 23 pruebas (11 de seguridad: sin token, vencido, otra clave, sin firma `alg: none`, usuario
  inexistente o inactivo, cambio de contraseña, permisos de admin, correo sin confirmar, cabeceras).
- Con la app real: Hibernate validó `Usuario` contra la base; un token emitido por FastAPI funciona en Spring;
  tras cambiar la contraseña el token viejo da 401 en Spring y en FastAPI y el nuevo funciona; con el usuario
  borrado da 401; un usuario normal recibe 403 en analítica. Respuestas con tildes idénticas byte a byte
  directas y por Spring.

**Problemas encontrados y solución:**
- Spring Initializr generó la versión `4.2.0.RELEASE`, que no existe en Maven Central (se publica como `4.2.0`).
- Con `server.forward-headers-strategy=native`, Tomcat aceptaba un `X-Forwarded-For` falso porque en desarrollo el
  navegador llega por el proxy de Vite desde 127.0.0.1. La prueba lo detectó → queda en `none` por defecto y solo
  se activa (`FORWARD_HEADERS_STRATEGY=native`) en producción detrás de Nginx.

## Fase 10 — Asistente IA con n8n (RAG)

Rama: `feature/fase-10-asistente-ia`.

**Bloque A — n8n y flujo de indexación en pgvector:**
- n8n 2.48.7 en Docker Compose (puerto 5690). Al arrancar, `n8n/arranque.sh` crea las credenciales desde el
  `.env` (las claves nunca quedan en los JSON del repositorio), importa los flujos de `n8n/workflows/` y los
  publica. Solo recibe las variables que necesita, no todo el `.env`.
- FastAPI expone rutas internas protegidas con `X-Internal-Key` (`INTERNAL_API_KEY`), fuera de la documentación
  pública: `POST /api/internal/embeddings` (vectores con el mismo modelo e5 de la búsqueda) y
  `GET /api/internal/indexacion/pendientes` (textos cuyo vector falta o cambió, y vectores sobrantes).
  Spring Boot responde 404 a cualquier `/api/internal`.
- La regla "qué está desactualizado" (`plan_sync` en `embeddings.py`) es una sola: la usan el script de
  reindexación, las ediciones del panel y n8n.
- **Flujo 1** (`n8n/workflows/01-indexacion-pgvector.json`): cada 30 minutos, por webhook o a mano → pide
  pendientes → borra vectores obsoletos → genera vectores → los guarda en pgvector en una sola consulta con
  `ON CONFLICT (entity_type, entity_id) DO UPDATE` (sin duplicados, con actualización) → repite mientras queden
  (máximo 30 vueltas de 64 textos).

**Verificado (bloque A):**
- `pytest`: 215 pruebas (13 nuevas de las rutas internas); `mvnw test`: 24 pruebas.
- Con datos reales: la primera ejecución actualizó 753 vectores desactualizados en 69 s y el total siguió en
  2.319 (0 duplicados por tipo e id); la segunda respondió "todo está indexado" en 2,8 s. Un vector guardado por
  n8n y el recalculado para el mismo texto tienen similitud coseno 1,000000. La búsqueda sigue funcionando.
- Webhook sin clave → 403; rutas internas por Spring → 404; sin clave interna → 401.

**Bloque B — Asistente RAG (flujo 2, tablas y Spring Boot):**
- Migración `d1e2f3a4b5c6` con las tablas `consultas_ia`, `respuestas_ia`, `fuentes_respuesta` y
  `calificaciones`: llaves foráneas (`ON DELETE CASCADE` hacia el usuario; `SET NULL` hacia el negocio, que
  conserva su nombre en el historial), restricciones `CHECK` (estado válido, pregunta no vacía, umbral, similitud,
  puntuación 1-5), únicas (una respuesta por consulta, una calificación por respuesta, una fuente por negocio) e
  índices (historial por usuario y fecha, estado, fecha). Alembic las ignora al autogenerar (`SPRING_TABLES` en
  `alembic/env.py`) porque su modelo vive en Spring.
- Entidades JPA en Spring (`ConsultaIA`, `RespuestaIA`, `FuenteRespuesta`, `Calificacion`, y `Establecimiento`
  de solo lectura) con relaciones `@ManyToOne`, `@OneToOne` y `@OneToMany`; Hibernate valida que coinciden con
  las tablas al arrancar.
- FastAPI agrega dos rutas internas: `asistente/fichas` (datos reales de los negocios recuperados, solo activos)
  y `asistente/validar` (borra frases con precios, horas o calificaciones que no estén en las fichas; la misma
  validación de las recomendaciones de la búsqueda).
- **Flujo 2** (`n8n/workflows/02-asistente-rag.json`, 19 nodos): webhook con clave → validar entrada → vector de
  la pregunta → pgvector (top 5 activos) → umbral → fichas → Gemini (con modelo de respaldo) → ¿las fuentes
  responden? → validar contra las fichas → respuesta. Cada paso que puede fallar tiene salida de error con un
  mensaje claro (`ERROR`).
- Spring Boot: `POST /api/asistente/consultas` (guarda `PENDIENTE` antes de llamar a n8n, vuelve a comprobar que
  cada fuente exista y esté activa, ordena las fuentes por similitud), `GET /api/asistente/consultas` (historial
  paginado), `GET /api/asistente/consultas/{id}` y `PUT /api/asistente/consultas/{id}/calificacion`. Exige
  correo confirmado; límite de 20 preguntas por hora por usuario.

**Calibración del umbral** (`backend/scripts/calibrar_umbral.py`, mejor similitud por pregunta con los datos
reales):

| Umbral | Relevantes aceptadas (de 30) | Sin relación rechazadas (de 20) |
|---|---|---|
| 0,800 | 29 | 6 |
| 0,810 | 29 | 11 |
| **0,820** | **29** | **18** |
| 0,835 | 25 | 19 |
| 0,850 | 19 | 20 |

Primero se eligió 0,835 con 20 preguntas relevantes, pero al agregar 10 redactadas como problemas cotidianos
("mi computador no prende", "se me dañó la pantalla del celular") perdía 5 legítimas. Con **0,82** solo se escapa
"me duele una muela" (0,797) y las 2 sin relación que pasan (lasaña 0,848 y Netflix 0,825) las rechaza Gemini al
comprobar que las fuentes no responden la pregunta. El umbral prioriza no perder preguntas legítimas y la segunda
barrera (Gemini + validación) evita respuestas sin respaldo.

**Pruebas funcionales del enunciado (con la app real: Vite → Spring → n8n → FastAPI/pgvector/Gemini):**

| Prueba | Resultado |
|---|---|
| Incidente de conectividad a internet | RESPONDIDA con 5 fuentes (servicio técnico y puntos de Claro), similitud 0,827–0,833 |
| Necesidad en lenguaje natural ("mi computador no prende") | RESPONDIDA; sugiere preguntar por el servicio en vez de afirmarlo |
| Sin información suficiente ("¿quién ganó el mundial 2014?", "copia de una llave") | SIN_RESULTADOS: no inventa |
| Desactivar un negocio (La Rebaja Plus, Girón) y repetir "farmacia en Girón" | Deja de usarse como fuente; sin otra farmacia, SIN_RESULTADOS |
| Pregunta vacía | 422, no llega a n8n ni se guarda |
| Fallo del servicio de embeddings (FastAPI apagado) | ERROR "El servicio de embeddings no respondió", guardado en la base |
| Historial y calificación | Historial ordenado por fecha; calificación 5 guardada y actualizable |

**Verificado (bloque B):** `pytest` 218 pruebas; `mvnw test` 36 pruebas (12 del asistente contra la base de
pruebas real: pregunta vacía, fuentes desactivadas o inexistentes, sin resultados, errores de n8n, historial
propio, calificación 1-5 y su actualización, límite por hora).

**Bloque C — Pantalla del asistente (`/asistente`):**
- Cuadro para la pregunta (máx. 500 caracteres, Enter envía, ejemplos para empezar) y validación de pregunta vacía
  antes de llamar al servidor.
- Tarjeta de respuesta: estado (Respondida, Sin resultados, Error, Pendiente), orientación, pasos recomendados,
  fuentes enlazadas a la ficha de cada negocio con su similitud real (3 decimales) y cuánto supera el mínimo; en
  "Sin resultados" se muestra la mejor similitud y el umbral.
- Calificación de 1 a 5 estrellas con comentario opcional, que se puede cambiar.
- Historial paginado ("Ver más") con todas las consultas anteriores; enlace "Asistente" en el encabezado y en el
  menú de usuario. Ícono de la pestaña (antes no existía y daba 404).

**Verificado (bloque C):** ESLint sin errores y compilación correcta. Recorrido automatizado con Chrome real
(`playwright-core`): pregunta vacía rechazada, pregunta de conectividad respondida con fuentes, calificación de 5
estrellas guardada, pregunta sin información → "Sin resultados", el historial persiste al recargar, vista de
celular sin desbordes y consola sin errores. Capturas en `docs/evidencias/fase-10/`.

**Problemas encontrados y solución:**
- Las capturas mostraron que, al hacer una segunda pregunta, la tarjeta nueva heredaba las estrellas y el
  comentario de la anterior (React reutilizaba el formulario): calificar ahí habría guardado la nota en la consulta
  equivocada → el formulario se reinicia por consulta (`key`).
- Las barras de similitud se veían casi vacías porque las similitudes reales están entre 0,82 y 0,90 → se
  reemplazaron por el valor exacto y cuánto supera el mínimo.
- El puerto 5678 lo usa el n8n de otro proyecto → n8n de Easy Search en el 5690.
- Con el negocio correcto desactivado, Gemini recomendó un bar y un supermercado para "farmacia en Girón" → se le
  indica descartar las fichas que no ofrecen lo pedido y responder sin resultados si no queda ninguna.
- Gemini afirmó que un restaurante de Piedecuesta estaba "en Cabecera" porque la búsqueda semántica no filtra por
  ubicación → regla explícita: la ubicación sale solo del campo de la ficha y debe aclarar si es otra zona.
- Los pasos mencionaban ids internos ("ficha 363") → se prohíbe mencionar ids.
- `RestClient.Builder` ya no se configura solo en Spring Boot 4 → se usa `RestClient.builder()`.
- Los nombres de las restricciones `CHECK` salían duplicados (`ck_tabla_ck_tabla_...`) por la convención de
  nombres del proyecto → se corrigió la migración.
- Los textos de los negocios llevan comas y el nodo Postgres separaba los parámetros por comas → se usa la
  versión 2.6 del nodo (evalúa cada expresión por separado) y el lote viaja como un solo parámetro JSON.

## Fase 11 — Entregables y cierre

Rama: `feature/fase-11-entregables`.

**Alcance:** del enunciado de la materia solo aplican las tecnologías y los entregables; sus funciones (análisis
de datos, dashboard e informe de análisis) no, porque Easy Search es un proyecto distinto.

**Bloque A — Registro de uso de IA y Docker Compose completo:**
- `AI_USAGE.md` completo: participación de la IA por aspecto y por fase, herramientas, forma de trabajo,
  decisiones, errores de la IA detectados y lecciones.
- Dockerfiles:
  - `backend/Dockerfile`: Python 3.12 slim, PyTorch solo CPU, usuario sin privilegios, migraciones al arrancar,
    verificación de salud y el modelo de embeddings en un volumen.
  - `gateway/Dockerfile`: dos etapas (compila con Maven y ejecuta con un JRE).
  - `frontend/Dockerfile`: compila con Node y sirve con Nginx, que reenvía `/api` y `/uploads` a Spring Boot.
- `docker compose --profile completo up -d --build` levanta los cinco servicios; `docker compose up -d` sigue
  levantando solo PostgreSQL y n8n para desarrollar.
- Red de Docker con IPs fijas (`172.29.0.0/24`): Nginx reemplaza `X-Forwarded-For` con la IP real, Spring solo
  la acepta de IPs internas y FastAPI solo de Spring (`--forwarded-allow-ips 172.29.0.20`). FastAPI y n8n no
  reciben tráfico del navegador.

**Verificado (bloque A):** con los cinco contenedores, por http://127.0.0.1:8090:
- estado del sistema `ok` en Spring, PostgreSQL y FastAPI; la ruta `/asistente` carga (Nginx devuelve
  `index.html`); Swagger responde y las rutas internas dan 404;
- búsqueda con 10 resultados; FastAPI aplicó las migraciones y cargó el modelo de embeddings;
- el asistente responde de punta a punta (Nginx → Spring → n8n → FastAPI/pgvector → Gemini): "ferretería en
  Piedecuesta" con 3 fuentes del municipio y "capital de Australia" sin resultados; calificación e historial;
- IP real: FastAPI registró la IP del cliente e ignoró las falsas; tras 3 búsquedas distintas como invitado la
  cuarta se bloqueó (429) aunque cada petición traía otra IP falsa en `X-Forwarded-For`.

**Bloque B — Script SQL con datos iniciales:**
- `scripts/exportar_sql_inicial.py` genera, desde la base real, `docker/initdb/02-esquema.sql` (pg_dump del
  esquema completo con la versión de Alembic) y `docker/initdb/03-datos-iniciales.sql`.
- Decisión del autor: los datos iniciales son **solo los negocios que cargó a mano** (3 negocios, 110 productos,
  14 horarios), más los datos de referencia sin los que la app no funciona (32 categorías y 267 municipios y
  barrios). Sin negocios de OpenStreetMap, sin datos personales y sin vectores (los genera n8n).
- La carga desactiva las llaves foráneas mientras inserta (`session_replication_role`) y deja los contadores de
  id después de los datos.

**Verificado (bloque B), simulando un PC nuevo** (proyecto de Docker aparte con volúmenes vacíos):
- PostgreSQL ejecutó los tres scripts sin errores: 3 negocios, 110 productos, 32 categorías, 267 lugares,
  0 usuarios.
- `alembic upgrade head` no aplicó nada (la base ya estaba en `d1e2f3a4b5c6`) y Spring arrancó, es decir,
  Hibernate validó las entidades contra ese esquema.
- El flujo 1 de n8n generó los 113 vectores (3 negocios + 110 productos) en dos vueltas.
- Asistente: "hamburguesas en Piedecuesta" → Garrotero's Pub; "gimnasio en Girón" → la sede de Girón de Dynamic
  Sports Gym; "necesito una farmacia" → sin resultados (no hay farmacias entre los datos iniciales).
- Al terminar se borró el proyecto de prueba y se restauró el original (2.209 negocios, 2.319 vectores).

**Problemas encontrados y solución:**
- `pg_dump --exclude-extension` no existe en PostgreSQL 16 → se quitó; el esquema crea las extensiones con
  `IF NOT EXISTS`, compatible con `01-extensions.sql`.
- Con un volumen nuevo n8n tarda más en arrancar (ejecuta sus migraciones internas); el asistente respondió
  ERROR con un mensaje claro mientras tanto, y funcionó al terminar el arranque.
- La primera prueba de IP falsa parecía fallar (5 búsquedas sin bloqueo), pero repetía la misma búsqueda, que por
  diseño no se cobra dos veces; con búsquedas distintas el bloqueo funciona.
- El código calcula rutas como `<raíz>/backend/uploads`: en la imagen se copia el backend en
  `/easysearch/backend` para conservar la estructura sin cambiar el código.

## Convención de commits

Al terminar cada fase se propone un mensaje en formato [Conventional Commits](https://www.conventionalcommits.org/es/)
y el desarrollador hace el commit.
