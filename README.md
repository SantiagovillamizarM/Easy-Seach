# Easy Search

Plataforma web de búsqueda inteligente de establecimientos, productos y servicios usando lenguaje natural.
Combina búsqueda semántica (PostgreSQL + **pgvector**) con filtros de ubicación, presupuesto y horario, y genera
recomendaciones con IA basadas solo en datos reales.

- Propuesta técnica y plan de trabajo: [docs/Propuesta_Easy_Search.pdf](docs/Propuesta_Easy_Search.pdf)
- Registro de avance: [docs/AVANCE.md](docs/AVANCE.md)

## Tecnologías

| Capa | Tecnología |
|---|---|
| Base de datos | PostgreSQL 16 + pgvector (Docker) |
| Puerta de entrada | Java 21 + Spring Boot 4 (recibe todas las peticiones del frontend) |
| Flujos de IA | n8n 2.48 (Docker): indexación en pgvector y asistente RAG |
| Backend | Python 3.12 + FastAPI + SQLAlchemy |
| Frontend | React + Vite + Tailwind CSS |
| IA | Embeddings locales (multilingual-e5) + LLM (proveedor por definir) |

## Puertos usados

| Servicio | URL |
|---|---|
| PostgreSQL | `127.0.0.1:5440` |
| Puerta de entrada Spring Boot | http://127.0.0.1:8020 — el frontend solo habla con esta |
| Swagger (toda la API) | http://127.0.0.1:8020/swagger-ui.html — arriba a la derecha se elige Spring Boot o FastAPI |
| Estado de los servicios | http://127.0.0.1:8020/api/sistema/estado |
| n8n | http://127.0.0.1:5690 (el 5678 lo usa otro proyecto) |
| Backend FastAPI | http://127.0.0.1:8010 — documentación propia en http://127.0.0.1:8010/docs |

### Arquitectura

```
Navegador ──► React/Vite (5173) ──► Spring Boot (8020) ──┬──► FastAPI (8010) ──► PostgreSQL + pgvector (5440)
                                                         └──► n8n (5690) ──┬──► FastAPI /api/internal (embeddings)
                                                                           ├──► PostgreSQL + pgvector
                                                                           └──► Gemini
```

Spring Boot es la puerta de entrada: el frontend nunca llama directo a FastAPI ni a la IA.

- **Rutas propias de Spring** (`/api/asistente`, `/api/analitica`, `/api/sistema`): Spring valida el token JWT
  (el mismo que emite FastAPI al iniciar sesión, firmado con `SECRET_KEY`) y consulta la base con JPA.
- **Todo lo demás** (búsqueda, cuentas, reseñas, paneles) se reenvía tal cual a FastAPI, que aplica sus propias
  reglas, conservando la IP real del cliente para los límites de intentos.

Las tablas las crean las migraciones de Alembic. Al arrancar, Hibernate comprueba que las entidades JPA coinciden
con las tablas reales (`ddl-auto=validate`) y, si no coinciden, Spring no arranca.
| Frontend | http://127.0.0.1:5173 |

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (encendido)
- [Python 3.12](https://www.python.org/downloads/)
- [Node.js 20 o superior](https://nodejs.org/)
- [Java 21 o superior](https://adoptium.net/) (Maven no hace falta: el proyecto trae `mvnw`)
- Git

## Instalación (solo la primera vez)

Todos los comandos se ejecutan en **PowerShell** desde la carpeta del proyecto.

> **Si `npm` muestra "la ejecución de scripts está deshabilitada en este sistema"**, ejecuta una sola vez:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
> y abre una terminal nueva. Si no quieres cambiar esa configuración, usa `npm.cmd` en lugar de `npm`
> (por ejemplo, `npm.cmd run dev`).

### 1. Variables de entorno

```powershell
Copy-Item .env.example .env
```

Abre `.env` y:
- Cambia `cambia_esta_clave` por una contraseña propia **en las dos líneas** donde aparece
  (`POSTGRES_PASSWORD` y `DATABASE_URL`).
- Cambia `SECRET_KEY` por una clave aleatoria (el comando para generarla está en el mismo archivo).
- Pega tu clave de Gemini en `GEMINI_API_KEY` (créala en https://aistudio.google.com/apikey). Sin clave,
  la búsqueda funciona igual con el intérprete por reglas, pero entiende menos.

> Usa `127.0.0.1` y no `localhost` en `DATABASE_URL`: en Windows, `localhost` intenta primero IPv6 y la
> conexión puede tardar más de 2 minutos.

### 2. Base de datos

```powershell
docker compose up -d
```

Comprueba que pgvector está instalado:

```powershell
docker exec easysearch-db psql -U easysearch -d easysearch -c "SELECT extname, extversion FROM pg_extension;"
```

Debe aparecer `vector` en la lista.

### 3. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
cd ..
```

### 4. Crear las tablas e importar datos reales

Con la base de datos encendida, desde la carpeta `backend`:

```powershell
cd backend
# Crea/actualiza todas las tablas (migraciones de Alembic)
.\.venv\Scripts\python -m alembic upgrade head
# Importa municipios, barrios y establecimientos reales desde OpenStreetMap (tarda unos minutos)
.\.venv\Scripts\python -m scripts.import_osm
# Genera los embeddings (vectores semánticos). La primera vez descarga el modelo (~470 MB)
.\.venv\Scripts\python -m scripts.reindex_embeddings
# Carga los locales que el equipo completó a mano (descripciones, productos, precios, horarios…)
.\.venv\Scripts\python -m scripts.import_csv
# Crea tu usuario administrador (te pedirá la contraseña)
.\.venv\Scripts\python -m scripts.create_admin --email tu@correo.com --nombre "Tu Nombre"
cd ..
```

> Si la importación muestra "servidores ocupados", es normal: el script reintenta solo. Las descargas se
> guardan en `backend/data/osm_cache/`, así que si la vuelves a ejecutar no descarga de nuevo
> (usa `--refresh` para forzar la descarga).

Para completar negocios con descripción, menú y precios reales, sigue la
[guía de carga manual](docs/CARGA_MANUAL.md).

### 5. Frontend

```powershell
cd frontend
npm install
cd ..
```

### 6. n8n (flujos de IA)

`docker compose up -d` también levanta n8n. Al arrancar, el contenedor crea sus credenciales con los valores del
`.env` (`POSTGRES_*`, `INTERNAL_API_KEY`, `N8N_WEBHOOK_KEY`, `GEMINI_API_KEY`), importa los flujos de
`n8n/workflows/` y los publica. No hay que configurar nada a mano.

- Abre http://127.0.0.1:5690 y crea la cuenta local de n8n la primera vez (solo sirve para ver los flujos y sus
  ejecuciones).
- Los flujos del repositorio son la fuente de verdad: si cambias uno en la interfaz, expórtalo
  (**⋯ → Download**) y guárdalo en `n8n/workflows/`, o se perderá al reiniciar el contenedor.

**Flujo 1: indexación en pgvector.** Corre cada 30 minutos y también a pedido. Pide a FastAPI los textos de
negocios y productos cuyo vector falta o cambió (según un hash del texto), genera los vectores con el modelo e5 y
los guarda en la tabla `embeddings` sin duplicados (`ON CONFLICT`). Para ejecutarlo a mano (PowerShell):

```powershell
$clave = (Select-String -Path .env -Pattern '^N8N_WEBHOOK_KEY=(.+)$').Matches.Groups[1].Value
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5690/webhook/easysearch/indexar -Headers @{ "X-N8N-Key" = $clave }
```

**Flujo 2: asistente RAG.** Lo llama solo Spring Boot (`POST /api/asistente/consultas`):

1. Convierte la pregunta en vector (modelo e5).
2. Busca en pgvector los 5 negocios **activos** más parecidos (similitud = 1 − distancia coseno).
3. Si ninguno supera el **umbral (0,82)**, responde `SIN_RESULTADOS` sin llamar a la IA.
4. Si alguno lo supera, pide a FastAPI sus fichas (solo datos guardados) y le pide a Gemini una orientación usando
   **solo** esas fichas. Si Gemini indica que las fichas no responden la pregunta, también es `SIN_RESULTADOS`.
5. Valida la respuesta contra las fichas (borra precios u horas inventados) y la devuelve con fuentes y
   similitudes. Si falla cualquier paso, responde `ERROR` con el motivo.

Spring guarda cada consulta (`PENDIENTE` → `RESPONDIDA` / `SIN_RESULTADOS` / `ERROR`), vuelve a comprobar que
cada fuente exista y esté activa, y permite ver el historial y calificar cada respuesta de 1 a 5.

**Por qué el umbral es 0,82:** se midió con `scripts/calibrar_umbral.py` (30 preguntas que los negocios sí
responden y 20 sin relación). Con 0,82 se aceptan 29 de 30 relevantes y se rechazan 18 de 20 sin relación; las 2
que pasan (una receta de lasaña y series de Netflix) las frena Gemini. Se cambia con `ASISTENTE_UMBRAL`.

## Ejecutar el proyecto (cada vez)

Necesitas **tres terminales** (en VS Code: botón `+` del panel de terminal).

**Terminal 1 — backend FastAPI** (`docker compose up -d` enciende PostgreSQL y n8n):

```powershell
docker compose up -d
cd backend
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

**Terminal 2 — puerta de entrada Spring Boot:**

```powershell
cd gateway
.\mvnw spring-boot:run
```

La primera vez descarga las dependencias (unos minutos). Está lista cuando muestra `Tomcat started on port 8020`.

**Terminal 3 — frontend:**

```powershell
cd frontend
npm run dev
```

Abre http://127.0.0.1:5173 en el navegador. Páginas: inicio (`/`), resultados (`/buscar?q=...`), detalle de un lugar
(`/lugar/<slug>`) y **asistente con IA** (`/asistente`, exige sesión con el correo confirmado).

> Si el navegador muestra `ERR_CONNECTION_REFUSED`, revisa que la terminal 3 siga abierta y muestre
> `VITE ... ready`. La página solo existe mientras `npm run dev` está corriendo.

Para detener: `Ctrl + C` en cada terminal. La base de datos se apaga con `docker compose stop`.

## Pruebas

```powershell
cd backend
.\.venv\Scripts\python -m pytest -v
```

(La base de datos debe estar encendida.) Las pruebas usan una base de datos separada, `easysearch_test`, que se
crea sola; tus datos de desarrollo no se modifican.

### Pruebas de la puerta de entrada (Spring Boot)

```powershell
cd gateway
.\mvnw test
```

- Proxy y seguridad (perfil `test`): no necesitan la base de datos; usan un FastAPI falso y usuarios simulados.
- Asistente (perfil `it`): usan la **base de pruebas real** (`easysearch_test`) y un n8n falso. Necesitan
  PostgreSQL encendido y la base de pruebas migrada, que se migra sola al correr antes las pruebas de FastAPI
  (`pytest`). Cada prueba deshace sus cambios.

### Revisar el frontend con ESLint

```powershell
cd frontend
npm.cmd run lint
```

### Medir la calidad de la búsqueda

```powershell
cd backend
# 22 consultas etiquetadas: precisión@5, municipio correcto, encontrados/disponibles y tiempos
.\.venv\Scripts\python -m scripts.benchmark_search
# Lo mismo, pero interpretando las consultas con Gemini (gasta ~22 llamadas de la cuota)
.\.venv\Scripts\python -m scripts.benchmark_search --con-ia
```

### Revisar vulnerabilidades en las dependencias

```powershell
cd frontend; npm.cmd audit
cd ..\backend; .\.venv\Scripts\python -m pip install pip-audit; .\.venv\Scripts\python -m pip_audit -r requirements.txt
```

### Probar la búsqueda desde la terminal

```powershell
cd backend
# Los ejemplos de la propuesta (usa Gemini, pgvector y los datos reales; no guarda historial)
.\.venv\Scripts\python -m scripts.eval_search
# Una consulta propia
.\.venv\Scripts\python -m scripts.eval_search "pizza en Cabecera abierta ahora"
```

## Comandos útiles de base de datos

```powershell
# Después de cambiar un modelo en app/models/, generar la migración:
.\.venv\Scripts\python -m alembic revision --autogenerate -m "descripcion del cambio"
# Aplicar migraciones pendientes:
.\.venv\Scripts\python -m alembic upgrade head
# Abrir una consola SQL dentro del contenedor:
docker exec -it easysearch-db psql -U easysearch -d easysearch
```

## Estructura

```
├── docker-compose.yml     PostgreSQL + pgvector
├── docker/initdb/         extensiones que se crean al iniciar la base de datos
├── .env.example           plantilla de variables de entorno
├── docs/                  propuesta, avance y documentación
├── gateway/               puerta de entrada Spring Boot (Java)
│   └── src/main/java/com/easysearch/gateway/
│       ├── config/        propiedades, CORS, rutas propias de Spring y Swagger
│       ├── asistente/     asistente IA: entidades JPA, servicio, cliente de n8n y endpoints
│       ├── seguridad/     validación del token JWT, permisos y errores 401/403
│       ├── usuario/       entidad JPA Usuario (tabla users, solo lectura) y su repositorio
│       ├── sistema/       estado de los servicios y sesión actual
│       └── proxy/         reenvío de peticiones a FastAPI
├── n8n/
│   ├── workflows/         flujos exportados (JSON): indexación y asistente RAG
│   ├── arranque.sh        importa credenciales y flujos al iniciar el contenedor
│   └── credenciales.js    crea las credenciales de n8n desde el .env
├── backend/
│   ├── app/
│   │   ├── main.py        punto de entrada de la API
│   │   ├── core/          configuración, seguridad (Argon2, JWT), utilidades de texto
│   │   ├── db/            conexión a la base de datos
│   │   ├── models/        tablas (SQLAlchemy)
│   │   ├── schemas/       validación de datos (Pydantic)
│   │   ├── data/          categorías iniciales
│   │   └── api/           endpoints y dependencias (usuario actual, roles)
│   ├── alembic/           migraciones de la base de datos
│   ├── scripts/           importación OSM, creación de administrador
│   └── tests/
└── frontend/
    └── src/               aplicación React
```

## Créditos de datos

Los datos de establecimientos provienen en parte de © colaboradores de
[OpenStreetMap](https://www.openstreetmap.org/copyright), disponibles bajo licencia ODbL.
