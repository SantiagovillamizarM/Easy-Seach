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
| Puertos | PostgreSQL 5440, backend 8010, frontend 5173 (otros proyectos ocupan 5432, 5433 y 8000) |

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
| 7 — Panel administrativo | ⏳ Pendiente |
| 8 — Calidad y seguridad | ⏳ Pendiente |
| 9 — Documentación y cierre | ⏳ Pendiente |

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

## Convención de commits

Al terminar cada fase se propone un mensaje en formato [Conventional Commits](https://www.conventionalcommits.org/es/)
y el desarrollador hace el commit.
