# Registro de avance — Easy Search

## Decisiones acordadas

| Tema | Decisión |
|---|---|
| Fuente de datos | OpenStreetMap + información manual y de propietarios |
| Proveedor de LLM | Pendiente (Gemini o Claude). Se implementará detrás de una interfaz intercambiable |
| Infraestructura | Docker Desktop local |
| Entrega | 25 de noviembre de 2026 |
| Repositorio | github.com/SantiagovillamizarM/Easy-Seach |
| Puertos | PostgreSQL 5440, backend 8010, frontend 5173 (otros proyectos ocupan 5432, 5433 y 8000) |

## Fases

| Fase | Estado |
|---|---|
| 0 — Entorno de desarrollo | ✅ Completada |
| 1 — Modelo de datos y autenticación | ✅ Completada |
| 2 — Establecimientos, horarios y embeddings | ⏳ Pendiente |
| 3 — Motor de búsqueda inteligente | ⏳ Pendiente |
| 4 — Frontend de búsqueda | ⏳ Pendiente |
| 5 — Recomendaciones IA y cuenta de usuario | ⏳ Pendiente |
| 6 — Reseñas y panel comercial | ⏳ Pendiente |
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

## Convención de commits

Al terminar cada fase se propone un mensaje en formato [Conventional Commits](https://www.conventionalcommits.org/es/)
y el desarrollador hace el commit.
