<div align="center">

# 🔎 Easy Search

**Encuentra negocios, productos y servicios del área metropolitana de Bucaramanga escribiendo lo que necesitas,
tal como lo dirías.**

Búsqueda semántica con PostgreSQL + **pgvector**, filtros de ubicación, presupuesto y horario, y recomendaciones con
IA que solo usan datos reales de la base.

![React](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS_4-0F172A?logo=tailwindcss&logoColor=38BDF8)
![Spring Boot](https://img.shields.io/badge/Spring_Boot_4-6DB33F?logo=springboot&logoColor=white)
![Java](https://img.shields.io/badge/Java_21-ED8B00?logo=openjdk&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python_3.12-3776AB?logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16_+_pgvector-4169E1?logo=postgresql&logoColor=white)
![n8n](https://img.shields.io/badge/n8n-EA4B71?logo=n8n&logoColor=white)
![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?logo=docker&logoColor=white)

![Inicio de Easy Search](docs/imagenes/app/inicio.jpg)

</div>

---

## 📑 Contenido

1. [Qué hace](#-qué-hace)
2. [El programa en imágenes](#-el-programa-en-imágenes)
3. [Arquitectura](#-arquitectura)
4. [Cómo funciona por dentro](#-cómo-funciona-por-dentro)
5. [Base de datos: entidad-relación y modelo relacional](#-base-de-datos)
6. [Cómo iniciarlo](#-cómo-iniciarlo)
   - [Opción A · Solo con Docker](#opción-a--solo-con-docker-todo-en-contenedores)
   - [Opción B · Desarrollo con 4 terminales](#opción-b--desarrollo-con-4-terminales)
7. [Instalación (solo la primera vez)](#-instalación-solo-la-primera-vez)
8. [Variables de entorno](#-variables-de-entorno)
9. [Roles y panel de administración](#-roles-y-panel-de-administración)
10. [Seguridad y privacidad](#-seguridad-y-privacidad)
11. [Pruebas](#-pruebas)
12. [Comandos útiles](#-comandos-útiles)
13. [Solución de problemas](#-solución-de-problemas)
14. [Estructura del proyecto](#-estructura-del-proyecto)
15. [Documentación y créditos](#-documentación-y-créditos)

---

## ✨ Qué hace

| | Función | En pocas palabras |
|---|---|---|
| 🔎 | **Búsqueda en lenguaje natural** | "hamburguesas en Piedecuesta por menos de 25 mil" → la IA entiende qué, dónde y cuánto; pgvector encuentra lo más parecido |
| 🗺️ | **Mapa, distancia y "abierto ahora"** | Resultados en un mapa, ordenables por cercanía (la ubicación nunca se guarda) y con el horario de hoy |
| 🤖 | **Recomendaciones con IA** | "Por qué te lo recomendamos", escrito solo con datos guardados; precios u horas inventados se borran |
| 💬 | **Asistente RAG** | Chat que responde con negocios reales, muestra sus fuentes y la similitud de cada una, y se puede calificar |
| 🚦 | **Aviso de trancón** | Con TomTom: demora extra del domicilio y los tramos con trancón marcados en rojo en el mapa |
| ⭐ | **Reseñas y favoritos** | Reseñas moderadas, respuestas del negocio, favoritos e historial de búsquedas |
| 🏪 | **Perfil comercial** | El dueño pide su negocio (o registra uno nuevo), lo verificamos y edita horario, carta, precios y fotos |
| 🌌 | **Panel de administración** | Dashboard "Horizonte de eventos": tráfico, búsquedas, IA y costos, negocios, solicitudes y moderación |
| 🌓 | **Modo claro y oscuro** | Automático según la hora (de 6 p. m. a 6 a. m. oscuro), con selector manual |

---

## 📸 El programa en imágenes

<table>
  <tr>
    <td width="50%"><img src="docs/imagenes/app/resultados.jpg" alt="Resultados de búsqueda"><br>
      <b>Resultados.</b> Lo que entendió la IA, filtros, lista con recomendaciones y mapa.</td>
    <td width="50%"><img src="docs/imagenes/app/lugar.jpg" alt="Página de un negocio"><br>
      <b>Página de un negocio.</b> Datos de contacto, carta con precios, horario y mapa.</td>
  </tr>
  <tr>
    <td><img src="docs/imagenes/app/asistente.jpg" alt="Asistente con IA"><br>
      <b>Asistente con IA (RAG).</b> Responde solo con negocios registrados y muestra sus fuentes.</td>
    <td><img src="docs/imagenes/app/registrar-negocio.jpg" alt="Registrar un negocio"><br>
      <b>Registrar un negocio.</b> El dueño envía sus datos; un administrador lo verifica.</td>
  </tr>
  <tr>
    <td><img src="docs/imagenes/app/admin-resumen.jpg" alt="Panel de administración"><br>
      <b>Panel de administración.</b> Agujero negro en WebGL de fondo e indicadores del negocio.</td>
    <td><img src="docs/imagenes/app/admin-busquedas.jpg" alt="Analítica de búsquedas"><br>
      <b>Búsquedas.</b> Qué busca la gente, qué no encuentra y cuánto por día.</td>
  </tr>
</table>

---

## 🏗️ Arquitectura

El navegador **solo habla con el frontend**, y toda la API pasa por **Spring Boot**: él atiende sus rutas propias
(asistente, sistema) y reenvía el resto a **FastAPI**. Nadie llama directo a FastAPI, n8n, la base de datos ni a la IA.

```mermaid
flowchart LR
    U(["👤 Navegador"])

    subgraph docker["Docker Compose"]
        direction LR
        F["<b>Frontend</b><br/>React + Vite + Tailwind<br/>:5173 (dev) · :8090 (Nginx)"]
        G["<b>Puerta de entrada</b><br/>Spring Boot 4 · Java 21<br/>Security (JWT) · JPA · Swagger<br/>:8020"]
        B["<b>Backend</b><br/>FastAPI · Python 3.12<br/>SQLAlchemy · Alembic<br/>modelo e5 de embeddings<br/>:8010"]
        N["<b>Orquestador de IA</b><br/>n8n<br/>flujo 1: indexación<br/>flujo 2: asistente RAG<br/>:5690"]
        D[("<b>PostgreSQL 16</b><br/>+ pgvector (HNSW)<br/>:5440")]
    end

    IA["☁️ IA en cadena<br/>Grok → OpenAI → Gemini"]
    TT["☁️ TomTom<br/>tráfico"]
    OSM["☁️ OpenStreetMap<br/>importación"]

    U --> F
    F -->|"/api"| G
    G -->|"asistente y sistema (JPA)"| D
    G -->|"todo lo demás (proxy)"| B
    G -->|"webhook X-N8N-Key"| N
    N -->|"/api/internal"| B
    N -->|"similitud e índice"| D
    N --> IA
    B --> D
    B -->|"interpretar búsquedas<br/>y recomendar"| IA
    B --> TT
    B -.->|scripts| OSM
```

| Componente | Tecnologías | Responsabilidad |
|---|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS 4, Leaflet, WebGL | Búsqueda, fichas, cuenta, asistente, panel del dueño y panel de administración |
| **Puerta de entrada** | Spring Boot 4, Spring Security, Spring Data JPA, springdoc | Única API del navegador: valida el JWT, atiende el asistente con JPA y reenvía el resto |
| **Backend** | FastAPI, SQLAlchemy, Alembic, sentence-transformers (multilingual-e5-small) | Búsqueda híbrida, cuentas, reseñas, paneles, analítica y rutas internas para n8n |
| **Orquestador** | n8n | Indexación en pgvector y flujo RAG del asistente |
| **Base de datos** | PostgreSQL 16, pgvector, unaccent, pg_trgm | Datos relacionales, vectores de 384 dimensiones e índice HNSW por similitud coseno |
| **IA** | Grok (xAI), OpenAI, Gemini | Interpretar búsquedas, recomendar y responder; en cadena, con cupo diario por usuario |

### Puertos

| Servicio | Dirección |
|---|---|
| Aplicación (desarrollo) | http://127.0.0.1:5173 |
| Aplicación (solo Docker) | http://127.0.0.1:8090 |
| Spring Boot (API) | http://127.0.0.1:8020 |
| **Swagger** (Spring Boot + FastAPI) | http://127.0.0.1:8020/swagger-ui.html |
| Estado de los servicios | http://127.0.0.1:8020/api/sistema/estado |
| FastAPI | http://127.0.0.1:8010 (documentación en `/docs`) |
| n8n | http://127.0.0.1:5690 |
| PostgreSQL | `127.0.0.1:5440` |

> Diagramas completos (seguridad del recorrido de una petición, asistente RAG e indexación):
> [docs/diagramas/arquitectura.md](docs/diagramas/arquitectura.md).

---

## ⚙️ Cómo funciona por dentro

### Una búsqueda, paso a paso

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant F as Frontend
    participant S as Spring Boot
    participant B as FastAPI
    participant IA as IA (Grok → OpenAI → Gemini)
    participant DB as PostgreSQL + pgvector

    U->>F: "hamburguesas en Piedecuesta por menos de 25 mil"
    F->>S: POST /api/search (con o sin sesión)
    S->>B: reenvía la petición
    B->>B: Reglas: categorías, lugar, presupuesto,<br/>"abierto ahora", saludos y texto sin sentido
    B->>IA: Interpretar la consulta (respuesta en JSON estricto)
    IA-->>B: qué busca, dónde, cuánto, preferencias
    B->>DB: Vector de la consulta (e5) + similitud coseno (HNSW)<br/>+ coincidencias de texto + filtros
    DB-->>B: negocios y productos candidatos
    B->>B: Ordena (similitud, distancia, horario, calificación)
    B->>IA: "Por qué te lo recomendamos" con SOLO los datos guardados
    IA-->>B: textos
    B->>B: Valida: borra precios u horas que no estén en la base
    B->>DB: Guarda la búsqueda en el historial (sin ubicación)
    B-->>F: resultados + lo que se entendió + recomendaciones
    F-->>U: lista, mapa y filtros
```

### La IA en cadena (y su costo)

```mermaid
flowchart LR
    Q["Consulta"] --> C{"¿Le queda cupo<br/>de IA paga hoy?"}
    C -- Sí --> X["Grok (xAI)"]
    X -- falla --> O["OpenAI"]
    O -- falla --> GM["Gemini (gratis)"]
    C -- No --> GM
    GM -- falla --> R["Reglas sin IA"]
    X --> V["Validación contra la base"]
    O --> V
    GM --> V
    R --> V
```

- Cada usuario tiene un **cupo diario** de IA paga (búsquedas y preguntas al asistente). Al agotarlo responde Gemini.
- Cada respuesta tiene un **tope de tokens**. El panel de administración muestra el **costo estimado** por día y al mes.

### El asistente (RAG)

1. Spring Boot guarda la pregunta (`PENDIENTE`) y llama al flujo 2 de n8n.
2. n8n convierte la pregunta en vector y busca en pgvector los 5 negocios **activos** más parecidos.
3. Si ninguno supera el **umbral de 0,82**, responde `SIN_RESULTADOS` sin gastar IA.
4. Si hay fuentes, la IA responde **solo** con sus datos; FastAPI borra lo inventado.
5. Spring Boot guarda la respuesta, sus fuentes y similitudes (`RESPONDIDA` / `SIN_RESULTADOS` / `ERROR`).

> El umbral se calibró con `scripts/calibrar_umbral.py`: acepta 29 de 30 preguntas relevantes y rechaza 18 de 20
> sin relación. Se cambia con `ASISTENTE_UMBRAL`.

### Registrar un negocio y darle su perfil

```mermaid
flowchart LR
    A["Dueño o encargado<br/>llena 'Registrar mi negocio'<br/>(o 'Solicitar administración')"] --> B["Solicitud PENDIENTE<br/>+ correo al administrador"]
    B --> C["El administrador llama<br/>y verifica (RUT, cámara de comercio)"]
    C --> D{"¿Aprueba?"}
    D -- Sí --> E["Se crea el negocio verificado<br/>y la persona pasa a PROPIETARIO<br/>+ correo con su panel"]
    D -- No --> F["Rechazada<br/>+ correo con el motivo"]
```

---

## 🗄️ Base de datos

**21 tablas y 34 llaves foráneas.** Una sola fuente de verdad: las **migraciones de Alembic** crean todas las tablas
(también las del asistente, que usa Spring Boot con JPA en modo `validate`).

### Diagrama general de relaciones

```mermaid
erDiagram
    USERS ||--o{ ESTABLISHMENTS : "owner_id"
    PLACES |o--o{ ESTABLISHMENTS : "municipality_id"
    PLACES |o--o{ PLACES : "parent_id"
    CATEGORIES |o--o{ CATEGORIES : "parent_id"
    ESTABLISHMENTS ||--o{ ESTABLISHMENT_CATEGORIES : "establishment_id"
    CATEGORIES ||--o{ ESTABLISHMENT_CATEGORIES : "category_id"
    ESTABLISHMENTS ||--o{ OFFERINGS : "establishment_id"
    ESTABLISHMENTS ||--o{ OPENING_HOURS : "establishment_id"
    ESTABLISHMENTS ||--o{ SPECIAL_HOURS : "establishment_id"
    ESTABLISHMENTS ||--o{ ESTABLISHMENT_PHOTOS : "establishment_id"
    ESTABLISHMENTS ||--o{ EMBEDDINGS : "establishment_id"
    ESTABLISHMENTS |o--o{ ESTABLISHMENTS : "duplicate_of_id"
    ESTABLISHMENTS ||--o{ DUPLICATE_DISMISSALS : "a / b"
    USERS ||--o{ FAVORITES : "user_id"
    ESTABLISHMENTS ||--o{ FAVORITES : "establishment_id"
    USERS ||--o{ REVIEWS : "user_id"
    ESTABLISHMENTS ||--o{ REVIEWS : "establishment_id"
    REVIEWS |o--o{ REPORTS : "review_id"
    USERS |o--o{ REPORTS : "reporter / resolved_by"
    ESTABLISHMENTS |o--o{ REPORTS : "establishment_id"
    USERS ||--o{ OWNERSHIP_CLAIMS : "user_id"
    ESTABLISHMENTS |o--o{ OWNERSHIP_CLAIMS : "establishment_id"
    USERS |o--o{ SEARCH_HISTORY : "user_id"
    ESTABLISHMENTS |o--o{ PAGE_VIEWS : "establishment_id"
    USERS ||--o{ CONSULTAS_IA : "usuario_id"
    CONSULTAS_IA ||--o{ RESPUESTAS_IA : "consulta_id"
    RESPUESTAS_IA ||--o{ FUENTES_RESPUESTA : "respuesta_id"
    ESTABLISHMENTS |o--o{ FUENTES_RESPUESTA : "establecimiento_id"
    RESPUESTAS_IA ||--o{ CALIFICACIONES : "respuesta_id"
```

### Diagramas entidad-relación (con columnas y tipos)

Generados desde la base real con `scripts/generar_diagrama_er.py`
(fuente Mermaid en [docs/diagramas/entidad-relacion.md](docs/diagramas/entidad-relacion.md)).

<details open>
<summary><b>Catálogo de negocios y búsqueda semántica</b></summary>

![Entidad-relación: catálogo](docs/diagramas/imagenes/entidad-relacion-catalogo-de-negocios-y-busqueda-semantica.png)
</details>

<details>
<summary><b>Usuarios e interacción</b> (cuentas, favoritos, historial, reseñas, reportes, solicitudes y visitas)</summary>

![Entidad-relación: usuarios e interacción](docs/diagramas/imagenes/entidad-relacion-usuarios-e-interaccion.png)
</details>

<details>
<summary><b>Asistente con IA</b> (tablas que usa Spring Boot con JPA)</summary>

![Entidad-relación: asistente](docs/diagramas/imagenes/entidad-relacion-asistente-con-ia-spring-boot-jpa.png)
</details>

### Modelo relacional

Notación `TABLA(atributos)`: <u>**subrayado**</u> = llave primaria, *cursiva →* = llave foránea y la tabla a la que
apunta, `?` = puede quedar vacío. El modelo completo, con todos los tipos y todas las llaves foráneas, está en
[docs/diagramas/modelo-relacional.md](docs/diagramas/modelo-relacional.md)
(se regenera con `scripts/generar_modelo_relacional.py`).

<details>
<summary><b>Ver las tablas principales</b></summary>

- **USERS**(<u>**id**</u>, email `UQ`, password_hash, full_name, role, is_active, email_verified_at?, …)
- **PLACES**(<u>**id**</u>, name, normalized_name, kind, *parent_id → places*?, latitude, longitude, …)
- **CATEGORIES**(<u>**id**</u>, name, slug `UQ`, description?, *parent_id → categories*?)
- **ESTABLISHMENTS**(<u>**id**</u>, name, slug `UQ`, address?, *municipality_id → places*?, latitude, longitude,
  phone?, whatsapp?, price_min?, price_max?, rating_avg?, *owner_id → users*?, is_verified, status,
  *duplicate_of_id → establishments*?, source, …)
- **ESTABLISHMENT_CATEGORIES**(<u>***establishment_id → establishments***</u>, <u>***category_id → categories***</u>)
- **OFFERINGS**(<u>**id**</u>, *establishment_id → establishments*, kind, section?, name, description?, price?, is_available)
- **OPENING_HOURS**(<u>**id**</u>, *establishment_id → establishments*, day_of_week, opens_at, closes_at)
- **EMBEDDINGS**(<u>**id**</u>, entity_type, entity_id, *establishment_id → establishments*, embedding vector(384), content_hash)
- **REVIEWS**(<u>**id**</u>, *establishment_id → establishments*, *user_id → users*, rating, comment?, status, owner_reply?)
- **OWNERSHIP_CLAIMS**(<u>**id**</u>, kind, *establishment_id → establishments*?, *user_id → users*, contact_phone?,
  applicant_role?, proposed_data?, consent_at?, status, *reviewed_by_id → users*?, …)
- **SEARCH_HISTORY**(<u>**id**</u>, *user_id → users*?, query_text, parsed_query, location_label?, results_count, …)
- **PAGE_VIEWS**(<u>**id**</u>, created_at, section, path, *establishment_id → establishments*?, visitor_hash, device, referrer?)
- **CONSULTAS_IA**(<u>**id**</u>, *usuario_id → users*, pregunta, estado, umbral, mejor_similitud?, duracion_ms?, …)
- **RESPUESTAS_IA**(<u>**id**</u>, *consulta_id → consultas_ia*, respuesta, pasos, modelo?)
- **FUENTES_RESPUESTA**(<u>**id**</u>, *respuesta_id → respuestas_ia*, *establecimiento_id → establishments*?, similitud, posicion)
- **CALIFICACIONES**(<u>**id**</u>, *respuesta_id → respuestas_ia*, puntuacion, comentario?)

</details>

---

## 🚀 Cómo iniciarlo

Hay dos formas. **¿Solo quieres verlo funcionando?** → Opción A. **¿Vas a programar?** → Opción B.

> **Antes de cualquiera:** abre **Docker Desktop** y espera a que diga *Engine running*. Si `docker` responde
> `failed to connect to the docker API`, es que Docker Desktop está cerrado.

### Opción A · Solo con Docker (todo en contenedores)

No hace falta instalar Python, Java ni Node: un comando levanta los cinco servicios (PostgreSQL, n8n, FastAPI,
Spring Boot y el frontend con Nginx).

```powershell
Copy-Item .env.example .env          # la primera vez: complétalo (ver "Variables de entorno")
docker compose --profile completo up -d --build
```

Abre **http://127.0.0.1:8090**.

- La primera vez tarda varios minutos: se construyen las imágenes y se descarga el modelo de embeddings (~470 MB).
- Una base nueva **se crea sola** con el esquema y los datos iniciales (`docker/initdb/`).
- Crea tu administrador:
  `docker exec -it easysearch-backend python -m scripts.create_admin --email tu@correo.com --nombre "Tu Nombre"`
- Sin correo (SMTP), el código para confirmar una cuenta aparece en `docker logs easysearch-backend`.
- Apagar: `docker compose --profile completo down` (los datos quedan guardados en los volúmenes).

> Si también tienes los servidores de desarrollo encendidos, apágalos: el modo completo usa los puertos 8010 y 8020.

### Opción B · Desarrollo con 4 terminales

```mermaid
flowchart LR
    T1["<b>Terminal 1</b><br/>Docker<br/>PostgreSQL + n8n"] --> T2["<b>Terminal 2</b><br/>FastAPI<br/>:8010"]
    T2 --> T3["<b>Terminal 3</b><br/>Spring Boot<br/>:8020"]
    T3 --> T4["<b>Terminal 4</b><br/>Frontend<br/>:5173"]
```

Abre 4 terminales en la carpeta del proyecto (en VS Code: botón `+` del panel de terminal). Hazlo en orden.

**Terminal 1 · Docker** (base de datos y n8n)
```powershell
docker compose up -d
```

**Terminal 2 · Backend FastAPI**
```powershell
cd backend
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```
> Sin `--reload`: en Windows se queda pegado. Si cambias código del backend, `Ctrl + C` y vuelve a ejecutarlo.

**Terminal 3 · Puerta de entrada Spring Boot**
```powershell
cd gateway
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot"   # ruta de tu JDK 21 o superior
.\mvnw spring-boot:run
```
Está lista cuando muestra `Tomcat started on port 8020`.

**Terminal 4 · Frontend**
```powershell
cd frontend
npm run dev
```

Abre **http://127.0.0.1:5173**. El panel de administración está en **http://127.0.0.1:5173/admin**.

**Para apagar:** `Ctrl + C` en las terminales 2, 3 y 4, y `docker compose stop` en la 1.

---

## 🧰 Instalación (solo la primera vez)

**Requisitos:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) ·
[Python 3.12](https://www.python.org/downloads/) · [Node.js 20+](https://nodejs.org/) ·
[JDK 21+](https://adoptium.net/) (Maven no hace falta: el proyecto trae `mvnw`) · Git.
Todos los comandos son de **PowerShell** desde la carpeta del proyecto.

| Paso | Comando |
|---|---|
| 1. Variables de entorno | `Copy-Item .env.example .env` y complétalo ([ver tabla](#-variables-de-entorno)) |
| 2. Base de datos | `docker compose up -d` |
| 3. Backend | `cd backend` → `python -m venv .venv` → `.\.venv\Scripts\python -m pip install -r requirements.txt` |
| 4. Tablas | `.\.venv\Scripts\python -m alembic upgrade head` (desde `backend`) |
| 5. Administrador | `.\.venv\Scripts\python -m scripts.create_admin --email tu@correo.com --nombre "Tu Nombre"` |
| 6. Frontend | `cd frontend` → `npm install` |

<details>
<summary><b>Datos: base inicial, OpenStreetMap y carga manual</b></summary>

**Base nueva: se crea sola.** La primera vez que Docker crea la base, PostgreSQL ejecuta `docker/initdb/`:

| Archivo | Contenido |
|---|---|
| `01-extensions.sql` | Extensiones `vector` (pgvector), `unaccent` y `pg_trgm` |
| `02-esquema.sql` | Todas las tablas, restricciones, índices (incluido el HNSW) y la versión de Alembic |
| `03-datos-iniciales.sql` | Negocios cargados a mano con sus productos y horarios, 32 categorías, municipios y barrios |

**Importar miles de negocios de OpenStreetMap** (opcional, desde `backend`):

```powershell
.\.venv\Scripts\python -m scripts.import_osm           # municipios, barrios y negocios reales (unos minutos)
.\.venv\Scripts\python -m scripts.reindex_embeddings   # vectores semánticos (la 1.ª vez descarga ~470 MB)
.\.venv\Scripts\python -m scripts.import_csv           # vuelve a cargar los negocios completados a mano
```

Para completar negocios con descripción, carta y precios: [guía de carga manual](docs/CARGA_MANUAL.md).
Preguntas para pedirle los datos a un negocio: [docs/PREGUNTAS_REGISTRO.md](docs/PREGUNTAS_REGISTRO.md).
</details>

<details>
<summary><b>n8n: flujos de IA</b></summary>

`docker compose up -d` también levanta n8n. Al arrancar, el contenedor crea sus credenciales con los valores del
`.env`, importa los flujos de `n8n/workflows/` y los publica: no hay que configurar nada a mano. Abre
http://127.0.0.1:5690 y crea la cuenta local la primera vez (solo sirve para ver los flujos).

- **Flujo 1 · indexación:** cada 30 minutos genera los vectores que faltan o cambiaron (sin duplicados). A mano:

  ```powershell
  $clave = (Select-String -Path .env -Pattern '^N8N_WEBHOOK_KEY=(.+)$').Matches.Groups[1].Value
  Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5690/webhook/easysearch/indexar -Headers @{ "X-N8N-Key" = $clave }
  ```
- **Flujo 2 · asistente RAG:** lo llama solo Spring Boot.
- Los flujos del repositorio son la fuente de verdad: si cambias uno en n8n, expórtalo a `n8n/workflows/`.
</details>

> **Si `npm` dice "la ejecución de scripts está deshabilitada"**, ejecuta una vez
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, o usa `npm.cmd` en lugar de `npm`.

---

## 🔐 Variables de entorno

Se copian de `.env.example` a `.env` (que **nunca** se sube a Git).

| Variable | Qué poner | ¿Obligatoria? |
|---|---|---|
| `POSTGRES_PASSWORD` y `DATABASE_URL` | La misma contraseña en las dos líneas (solo letras y números) | Sí |
| `SECRET_KEY` | Clave aleatoria de **32+ caracteres** (firma las sesiones; más corta, Spring Boot no arranca) | Sí |
| `INTERNAL_API_KEY` | Clave aleatoria (n8n → FastAPI) | Sí |
| `N8N_WEBHOOK_KEY` | Clave aleatoria (Spring Boot → n8n) | Sí |
| `N8N_ENCRYPTION_KEY` | Clave aleatoria; **no la cambies** después del primer arranque | Sí |
| `GEMINI_API_KEY` | Clave gratis de https://aistudio.google.com/apikey | Recomendada |
| `XAI_API_KEY` · `XAI_MODEL` · `XAI_BASE_URL` | Grok (de pago). Si está, responde primero | Opcional |
| `OPENAI_API_KEY` · `OPENAI_MODEL` | OpenAI (de pago), respaldo de Grok | Opcional |
| `LLM_PROVIDER` | `auto` (en cadena), `xai`, `openai` o `gemini` | Opcional |
| `OPENAI_SEARCHES_PER_DAY` · `ASISTENTE_OPENAI_POR_DIA` | Cupo diario de IA paga por usuario (búsquedas · asistente) | Opcional |
| `TOMTOM_API_KEY` · `TOMTOM_DAILY_LIMIT` | Aviso de trancón (gratis en developer.tomtom.com) | Opcional |
| `SMTP_*` | Correo para códigos y avisos; sin él, los códigos salen en la terminal del backend | Opcional |
| `TURNSTILE_SITE_KEY` · `TURNSTILE_SECRET_KEY` | Anti-robots de Cloudflare (gratis) | Opcional |
| `ASISTENTE_UMBRAL` · `ASISTENTE_CONSULTAS_POR_HORA` | Umbral de similitud (0,82) y límite de preguntas | Opcional |

Para generar una clave aleatoria (una vez por clave):

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_').TrimEnd('=')
```

> Usa `127.0.0.1` y **no** `localhost` en las direcciones: en Windows, `localhost` prueba primero IPv6 y puede
> tardar más de 2 minutos.

---

## 👥 Roles y panel de administración

| Rol | Qué puede hacer |
|---|---|
| **Visitante** | Ver negocios y probar unas pocas búsquedas |
| **Usuario** (correo confirmado) | Buscar, usar el asistente, reseñar, guardar favoritos, ver su historial y registrar su negocio |
| **Propietario** | Todo lo anterior + editar su negocio (datos, horario, carta, precios y fotos) y responder reseñas |
| **Administrador** | Todo + el panel de administración |

**Panel de administración** (`/admin`), siempre en modo oscuro (negro y grises), con un agujero negro en WebGL de fondo
(se convierte en protector de pantalla tras 2 minutos sin actividad):

| Sección | Para qué |
|---|---|
| **Resumen** | Visitantes, búsquedas, usuarios, IA y costo estimado, horas pico, tráfico, crecimiento, demanda y negocios |
| **Reseñas** | Moderar reseñas y reportes |
| **Solicitudes** | Verificar a quien pide un negocio o registra uno nuevo, y aprobar o rechazar (con correo) |
| **Negocios · Duplicados** | Editar, ocultar, quitar dueño y unir negocios repetidos |
| **Usuarios** | Cambiar roles y desactivar cuentas |
| **Búsquedas · Categorías** | Qué busca la gente, qué no encuentra y cómo está repartido el catálogo |

---

## 🛡️ Seguridad y privacidad

- **Sesión:** FastAPI emite un JWT (HS256) y Spring Boot lo valida con la misma clave; las contraseñas usan Argon2.
- **Rutas internas:** `/api/internal/*` solo acepta la clave de n8n; desde afuera Spring Boot responde 404.
- **IP real:** cada servicio solo acepta `X-Forwarded-For` del servicio anterior, así nadie se salta los límites.
- **Ubicación:** viaja solo en la búsqueda y **nunca se guarda** (ni en el historial ni se envía a la IA).
- **Visitas (analítica propia):** anónimas, **sin cookies** ni servicios externos. No se guarda la IP: solo un
  código del visitante que cambia cada día. No se cuentan robots, el panel de administración ni a quien activó
  "No rastrear".
- **Solicitudes de negocios:** piden autorización expresa para el tratamiento de datos (Ley 1581 de 2012).
- **IA:** nunca inventa datos verificables; precios, horas y calificaciones que no estén en la base se eliminan.
- **Secretos:** todo en `.env`; las credenciales de n8n se crean al arrancar y no quedan en los flujos exportados.

---

## 🧪 Pruebas

| Qué | Comando | Notas |
|---|---|---|
| **Backend** (FastAPI) | `cd backend` → `.\.venv\Scripts\python -m pytest` | Usa la base aparte `easysearch_test` (se crea sola) |
| **Puerta de entrada** (Spring Boot) | `cd gateway` → `.\mvnw test` | Perfil `test` (sin base) y `it` (base de pruebas real; corre antes `pytest`) |
| **Frontend** | `cd frontend` → `npm run lint` · `npm run build` | ESLint y compilación |
| **Calidad de la búsqueda** | `.\.venv\Scripts\python -m scripts.benchmark_search` | Precisión@5, municipio correcto y tiempos (`--con-ia` usa la IA) |
| **Una búsqueda desde la terminal** | `.\.venv\Scripts\python -m scripts.eval_search "pizza en Cabecera"` | No guarda historial |
| **Dependencias** | `npm audit` · `pip_audit -r requirements.txt` | Vulnerabilidades conocidas |

---

## 🛠️ Comandos útiles

```powershell
# (desde backend)
.\.venv\Scripts\python -m alembic revision --autogenerate -m "descripcion"   # nueva migración
.\.venv\Scripts\python -m alembic upgrade head                               # aplicar migraciones
.\.venv\Scripts\python -m scripts.generar_diagrama_er                        # diagramas entidad-relación
.\.venv\Scripts\python -m scripts.generar_modelo_relacional                  # modelo relacional
.\.venv\Scripts\python -m scripts.exportar_sql_inicial                       # scripts SQL de docker/initdb
docker exec -it easysearch-db psql -U easysearch -d easysearch               # consola SQL
```

---

## 🩺 Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| `failed to connect to the docker API` | Docker Desktop está cerrado: ábrelo y espera *Engine running* |
| La base tarda minutos en conectar | Estás usando `localhost`: cámbialo por `127.0.0.1` |
| El backend se queda pegado al cambiar código | No uses `--reload` en Windows; reinicia con `Ctrl + C` |
| `mvnw` dice que Java es muy viejo | Define `JAVA_HOME` con un JDK 21+ antes de `.\mvnw spring-boot:run` |
| `ERR_CONNECTION_REFUSED` en el navegador | La terminal 4 (`npm run dev`) no está corriendo |
| "Puerto en uso" (8010, 8020 o 5173) | Quedó un servidor abierto: ciérralo, o apaga el modo completo de Docker |
| No aparece el "Panel administrativo" | Crea el administrador con `scripts.create_admin` y vuelve a iniciar sesión |
| El asistente responde `ERROR` | Falta `GEMINI_API_KEY` (u otra clave de IA) en el `.env` |

---

## 📁 Estructura del proyecto

```
├── docker-compose.yml     PostgreSQL + pgvector y n8n; con --profile completo, todo el sistema
├── docker/initdb/         SQL de la base inicial: extensiones, esquema y datos reales
├── .env.example           plantilla de variables de entorno
├── docs/                  propuesta, avance, diagramas, imágenes del programa y evidencias
├── gateway/               puerta de entrada Spring Boot (Java)
│   └── src/main/java/com/easysearch/gateway/
│       ├── config/        propiedades, CORS, rutas propias y Swagger
│       ├── asistente/     asistente IA: entidades JPA, servicio, cliente de n8n y endpoints
│       ├── seguridad/     validación del JWT, permisos y errores 401/403
│       ├── usuario/       entidad Usuario (solo lectura)
│       ├── sistema/       estado de los servicios y sesión actual
│       └── proxy/         reenvío de peticiones a FastAPI
├── n8n/                   flujos exportados (JSON), arranque y credenciales
├── backend/               FastAPI
│   ├── app/
│   │   ├── api/routes/    endpoints (búsqueda, cuentas, catálogo, reseñas, dueño, admin, analítica, tráfico…)
│   │   ├── services/      búsqueda, IA (llm/), recomendaciones, embeddings, correos, dashboard…
│   │   ├── models/        tablas (SQLAlchemy)
│   │   ├── schemas/       validación (Pydantic)
│   │   └── core/ · db/    configuración, seguridad (Argon2, JWT) y conexión
│   ├── alembic/           migraciones
│   ├── scripts/           importación OSM, administrador, diagramas, SQL inicial, evaluación
│   └── tests/
└── frontend/              React + Vite
    └── src/
        ├── pages/         inicio, resultados, lugar, asistente, perfil, panel del dueño y admin/
        ├── components/    mapa, tarjetas, agujero negro (admin/blackhole) y piezas compartidas
        └── lib/ · context/ API, formato, analítica, sesión y tema
```

---

## 📚 Documentación y créditos

| Documento | Contenido |
|---|---|
| [docs/Propuesta_Easy_Search.pdf](docs/Propuesta_Easy_Search.pdf) | Propuesta técnica y plan de trabajo |
| [docs/AVANCE.md](docs/AVANCE.md) | Registro de avance por fases |
| [docs/diagramas/](docs/diagramas/) | Arquitectura, entidad-relación, modelo relacional e imágenes |
| [AI_USAGE.md](AI_USAGE.md) | Uso de inteligencia artificial en el desarrollo |

Los datos de establecimientos provienen en parte de © colaboradores de
[OpenStreetMap](https://www.openstreetmap.org/copyright), disponibles bajo licencia ODbL.
