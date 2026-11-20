# Uso de inteligencia artificial en Easy Search

Este documento cumple la directriz de la materia: registra qué herramientas de IA se usaron, en qué partes del
desarrollo participaron y qué decisiones técnicas se tomaron con su apoyo. Se actualiza en cada fase.

> **Pendiente del equipo:** completar las secciones marcadas con ✏️ (integrantes, otras herramientas que cada uno
> haya usado y la revisión que hizo cada persona).

## 1. Herramientas utilizadas

| Herramienta | Tipo | Para qué se usó |
|---|---|---|
| Claude Code (Anthropic, modelo Claude Opus) | Asistente de programación en VS Code | Análisis del enunciado, propuestas de arquitectura, generación y revisión de código, pruebas automatizadas y documentación, siempre con aprobación del equipo en cada paso |
| Google Gemini | Asistente conversacional | Consulta del equipo sobre si Gemini podía reemplazar a OpenRouter |
| Google Gemini (`gemini-2.5-flash-lite`, respaldo `gemini-2.5-flash`) | **Componente del producto** (no de desarrollo) | Interpreta las búsquedas en lenguaje natural y redacta recomendaciones usando solo datos de la base |
| multilingual-e5-small (sentence-transformers) | **Componente del producto** | Genera los embeddings guardados en pgvector para la búsqueda semántica |
| ✏️ Otras | | |

## 2. Forma de trabajo con el asistente

- El equipo define el alcance de cada fase y toma las decisiones; el asistente propone opciones con sus ventajas y
  desventajas.
- Cada fase se trabaja en su propia rama (`feature/fase-N-...`) y se integra a `main` mediante Pull Request.
- Los commits los hace el equipo después de revisar los cambios; el asistente indica los puntos estables donde
  conviene hacer commit.
- Todo cambio se verifica antes del commit: pruebas automatizadas (`pytest`, `mvnw test`, `npm run lint`) y
  pruebas manuales contra la aplicación real.
- No se envían a la IA datos personales de usuarios ni credenciales; las claves viven en `.env`, que no se sube
  al repositorio.

## 3. Registro por fase

### Fases 0 a 8 — Producto base (FastAPI, React, pgvector)

✏️ El equipo debe describir aquí la participación de la IA en estas fases. El detalle técnico de cada fase está
en [docs/AVANCE.md](docs/AVANCE.md).

### Fase 9 — Puerta de entrada Spring Boot

**Componentes asistidos:** proyecto `gateway/` completo (configuración, `FastApiProxyController`, CORS,
seguridad JWT, entidad JPA `Usuario`, Swagger, pruebas), cambio del proxy de Vite y documentación (README,
`.env.example`, AVANCE).

**Decisiones técnicas tomadas con apoyo de la IA:**

| Decisión | Alternativas consideradas | Quién decidió y por qué |
|---|---|---|
| Arquitectura híbrida: Spring Boot delante de FastAPI | Migrar todo el backend a Spring Boot | El equipo, por el plazo (68 endpoints existentes). Cumple la regla de que toda consulta pase primero por Spring Boot |
| Conservar pgvector y no usar Qdrant | Agregar Qdrant | Aprobado por el profesor |
| Gemini en lugar de OpenRouter | Migrar a OpenRouter | El equipo, con aval del profesor |
| Mantener n8n | Hacer el RAG directamente en Spring | El equipo: n8n es tecnología obligatoria de la materia |
| Reenvío con `java.net.http.HttpClient` en un controlador comodín (`/api/**`) | Spring Cloud Gateway | La IA lo propuso: menos dependencias, y los endpoints nuevos de Spring tienen prioridad automáticamente |
| Spring envía la IP real en `X-Forwarded-For` y descarta la del navegador | Reenviar la cabecera recibida | Los límites de intentos de FastAPI son por IP; reenviarla permitiría falsificarla |
| `forward-headers-strategy` en `none` por defecto | `native` siempre | Una prueba automatizada mostró que `native` aceptaba IP falsas en desarrollo |
| Spring valida el mismo JWT de FastAPI (HS256 + `SECRET_KEY`) | Un segundo inicio de sesión en Spring | Un solo login para el usuario; se replican las reglas de `deps.py` (cuenta activa, cambio de contraseña) |
| Dos cadenas de seguridad: solo las rutas de Spring exigen token | Validar el token en todas las rutas | FastAPI ya decide qué rutas son públicas; validar todo en Spring cambiaba el comportamiento de rutas públicas |
| Entidad `Usuario` de solo lectura y validación de esquema (`ddl-auto=validate`) | Que Hibernate cree o modifique tablas | Las tablas las administra Alembic: una sola fuente del esquema evita que los dos backends se contradigan |
| Pruebas sin base de datos (perfil `test` y repositorio simulado) | Testcontainers o la base de desarrollo | Corren en cualquier PC sin Docker y nunca tocan los datos reales; la integración se verificó a mano con la app real |

**Revisión humana:** ✏️ quién revisó el código y cómo lo probó.

### Fase 10 — Asistente IA con n8n

**Componentes asistidos (bloque A):** servicio n8n en Docker Compose, scripts de arranque
(`n8n/arranque.sh`, `n8n/credenciales.js`), flujo de indexación (`n8n/workflows/01-indexacion-pgvector.json`,
generado con un script y probado contra la base real), rutas internas de FastAPI y sus pruebas, bloqueo de esas
rutas en Spring.

| Decisión | Alternativas consideradas | Quién decidió y por qué |
|---|---|---|
| n8n genera los vectores llamando al modelo e5 de FastAPI | Embeddings de Gemini u OpenRouter | La IA lo propuso: los 2.319 vectores existentes siguen sirviendo y la búsqueda actual no cambia |
| n8n guarda directo en pgvector con su nodo de Postgres | Que FastAPI guarde y n8n solo dispare | Así n8n realmente consulta, vectoriza y almacena, como pide el flujo 1 del enunciado |
| El texto canónico y su hash los calcula FastAPI | Construir el texto con SQL dentro de n8n | Una sola regla de "qué está desactualizado" para el script, el panel y n8n |
| Credenciales creadas al arrancar desde el `.env` | Configurarlas a mano en la interfaz | Reproducible con `docker compose up` y sin claves en el repositorio |

**Componentes asistidos (bloque B):** migración de las tablas del asistente, entidades JPA, servicio y
controlador del asistente, cliente de n8n, manejador de errores, flujo RAG
(`n8n/workflows/02-asistente-rag.json`), rutas internas de fichas y validación, script de calibración del umbral
y pruebas (pytest y JUnit).

| Decisión | Alternativas consideradas | Quién decidió y por qué |
|---|---|---|
| Umbral 0,82 | 0,835 (primera calibración) | La IA lo midió con 50 preguntas; 0,835 perdía preguntas legítimas redactadas como problemas cotidianos |
| Dos barreras: umbral + Gemini indica si las fuentes responden | Solo umbral alto | Con solo umbral había que elegir entre perder preguntas legítimas o aceptar irrelevantes |
| Validar la respuesta con `validate_text` (ya existente) | Confiar en el prompt | Reutiliza la defensa anti-invención de la búsqueda |
| Spring guarda PENDIENTE antes de llamar a n8n | Guardar todo al final | Si n8n falla o tarda, la consulta queda registrada con su estado |
| Spring vuelve a validar las fuentes contra la base | Confiar en n8n | Regla de negocio: toda fuente debe existir y estar activa |
| Tablas creadas por Alembic, entidades en Spring | Hibernate `ddl-auto=update` | Una sola fuente del esquema |
| Pruebas del asistente contra la base de pruebas real | Repositorios simulados | Comprueban las restricciones y el mapeo JPA reales |

Las pruebas con la app real revelaron tres fallas del prompt (recomendar negocios que no sirven, inventar la
ubicación, mencionar ids) que se corrigieron y se volvieron a probar; están descritas en `docs/AVANCE.md`.

**Revisión humana:** ✏️
