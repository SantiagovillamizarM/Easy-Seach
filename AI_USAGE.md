# Uso de inteligencia artificial en Easy Search

Este documento cumple la directriz de la materia: registra qué herramientas de inteligencia artificial se usaron,
cuánto participaron en el desarrollo, qué componentes asistieron y qué decisiones técnicas se tomaron con su
apoyo. Se actualizó en cada fase.

**Autor:** Santiago Villamizar Mantilla (proyecto individual).

## 1. Resumen

La IA tuvo una **participación alta** en este proyecto. El asistente de programación **Claude Code generó la mayor
parte del código** de todas las fases, siguiendo los requisitos, el alcance y las decisiones que definió el
autor. El autor dirigió el trabajo fase por fase, revisó y probó cada entrega, pidió explicaciones de las partes
que no entendía y aprobó cada commit; todos los commits del repositorio son suyos.

| Aspecto | Participación de la IA | Participación del autor |
|---|---|---|
| Idea del producto y propuesta (`docs/Propuesta_Easy_Search.pdf`) | ✏️ | ✏️ |
| Requisitos y alcance de cada fase | Propuso planes por fase con alternativas | Definió el alcance, eligió entre alternativas y aprobó cada plan |
| Código (backend, frontend, Spring Boot, n8n) | Generó la mayor parte | Revisó, probó y pidió cambios |
| Datos de los negocios | Scripts de importación desde OpenStreetMap | Carga manual de negocios completos (`docs/CARGA_MANUAL.md`) |
| Pruebas automatizadas | Las escribió y ejecutó | Comprobó que pasaran antes de cada commit |
| Pruebas con la app real | Recorridos automatizados y verificaciones | Uso de cada función en el navegador antes del commit |
| Control de versiones | Indicó cuándo hacer commit y propuso los mensajes | Creó todos los commits, Pull Requests y merges |
| Documentación (README, AVANCE, este archivo) | La redactó | La revisó y aportó la información que solo él conocía |

## 2. Herramientas utilizadas

| Herramienta | Tipo | Para qué se usó |
|---|---|---|
| Claude Code (Anthropic, modelo Claude Opus), extensión de VS Code | Asistente de programación | Análisis del enunciado, propuestas de arquitectura, generación y revisión de código, pruebas automatizadas, verificaciones con la app real y documentación |
| Google Gemini (chat) | Asistente conversacional | Consultas puntuales del autor, entre ellas si Gemini podía reemplazar a OpenRouter |
| Google Gemini API (`gemini-2.5-flash-lite`, respaldo `gemini-2.5-flash`) | **Componente del producto**, no herramienta de desarrollo | Interpreta las búsquedas, redacta recomendaciones y responde en el asistente RAG, siempre con datos de la base |
| OpenAI API (`gpt-4.1-mini`, configurable) | **Componente del producto** (opcional, de pago) | Con clave configurada interpreta las búsquedas, redacta recomendaciones, modera reseñas y responde en el asistente RAG (n8n), con salida JSON estricta; Gemini queda de respaldo automático y las reglas como último plan B |
| multilingual-e5-small (sentence-transformers) | **Componente del producto** | Genera los embeddings guardados en pgvector para la búsqueda semántica y el asistente |

## 3. Forma de trabajo

1. **Planeación por fase.** El asistente proponía un plan con sus alternativas; el autor decidía. Cuando una decisión
   dependía del profesor (usar pgvector en vez de Qdrant, Gemini en vez de OpenRouter), el autor la consultó.
2. **Desarrollo en bloques.** Cada fase se dividió en 2 o 3 bloques. Al terminar un bloque, el asistente se detenía
   en un punto estable y verificado para que el autor revisara e hiciera el commit.
3. **Ramas y Pull Requests.** Desde la fase 4, una rama por fase (`feature/fase-N-...`) fusionada a `main` con un
   Pull Request (8 PR hasta la fase 10). Las fases 0 a 3 se hicieron directamente en `main`.
4. **Verificación antes de cada commit:**
   - pruebas automatizadas: `pytest` (FastAPI), `mvnw test` (Spring Boot) y `npm run lint` (React);
   - pruebas contra la aplicación real: búsquedas reales, inicios de sesión, flujos de n8n y recorridos con Chrome;
   - revisión del autor: probó cada función en el navegador, leyó los cambios en VS Code y pidió explicaciones de
     las decisiones y del código que no entendía.
5. **Privacidad.** No se enviaron a la IA datos personales de usuarios ni credenciales. Las claves viven en `.env`,
   que no se sube al repositorio.

## 4. Registro por fase

### Fases 0 a 8: producto base (FastAPI, React, pgvector, Gemini)

Claude Code generó la mayor parte del código de estas fases a partir de la propuesta del proyecto y de las
indicaciones del autor. El detalle de lo construido, lo verificado y los problemas encontrados está en
[docs/AVANCE.md](docs/AVANCE.md).

| Fase | Componentes asistidos |
|---|---|
| 0. Entorno | Docker Compose con PostgreSQL + pgvector, base de FastAPI y React, endpoint de salud |
| 1. Modelo de datos y autenticación | 15 tablas y migraciones de Alembic, índice HNSW, registro e inicio de sesión con JWT y Argon2, roles, importación desde OpenStreetMap |
| 2. Establecimientos y embeddings | Intérprete de horarios de OSM, cálculo de abierto o cerrado, embeddings con e5, API del catálogo, carga manual por CSV |
| 3. Motor de búsqueda | Capa de IA intercambiable, intérprete de consultas (Gemini con respaldo por reglas), búsqueda híbrida (pgvector + texto completo con Reciprocal Rank Fusion), filtros de ubicación, presupuesto y horario |
| 4. Frontend | Sistema de diseño, páginas de inicio, resultados y detalle, mapa |
| 5. Recomendaciones y cuenta | Recomendaciones con IA basadas solo en datos reales y su validación anti-invención, favoritos, historial, perfil |
| 6. Reseñas y panel comercial | Reseñas con moderación, solicitudes de propiedad, panel para dueños de negocios |
| 7. Panel administrativo | Moderación, duplicados, usuarios, categorías, estadísticas de búsqueda |
| 8. Calidad y seguridad | Límites de intentos, cabeceras de seguridad, ESLint, pantalla de error, benchmark de búsqueda |
| Ajustes | Recuperar contraseña, búsquedas de prueba sin cuenta, respuestas del dueño a reseñas, avisos por correo |

**Decisiones técnicas tomadas con apoyo de la IA:**

| Decisión | Alternativas consideradas | Cómo se decidió |
|---|---|---|
| Datos de OpenStreetMap + carga manual | Solo carga manual | Daba datos reales de miles de negocios desde el inicio |
| Embeddings locales con multilingual-e5-small | API de embeddings de pago | Gratis, en español y sin depender de cuotas externas |
| Gemini detrás de una interfaz intercambiable | Atar el código a un proveedor | Permite cambiar de proveedor de IA sin tocar la búsqueda |
| Cadena OpenAI → Gemini → reglas (FastAPI) y OpenAI → Gemini → Gemini respaldo (asistente en n8n) | Reemplazar Gemini por OpenAI | El autor tenía API de pago de OpenAI y quería respuestas más precisas; la cadena mantiene el servicio si se acaba el saldo o un proveedor cae, y Gemini (aprobado por el profesor) sigue siempre disponible. El prompt del asistente se reforzó para razonar la necesidad real y comparar opciones con datos de las fichas |
| `gemini-2.5-flash-lite` | Otros modelos de Gemini | Pruebas reales: el más rápido que interpretaba bien (1,3 s) |
| Búsqueda híbrida (vectorial + texto completo) | Solo búsqueda vectorial | Los nombres propios y las palabras exactas se encuentran mejor con texto completo |
| Validar las respuestas de la IA contra los datos | Confiar en el prompt | Se eliminan precios, horas o calificaciones que la IA no saque de la base |

### Fase 9: puerta de entrada Spring Boot

**Componentes asistidos:**
- proyecto `gateway/` completo: configuración, `FastApiProxyController`, CORS, seguridad JWT, entidad JPA `Usuario`, Swagger y pruebas;
- cambio del proxy de Vite;
- documentación: README, `.env.example` y AVANCE.

| Decisión | Alternativas consideradas | Cómo se decidió |
|---|---|---|
| Arquitectura híbrida: Spring Boot delante de FastAPI | Migrar todo el backend a Spring Boot | El autor, por el plazo (68 endpoints existentes). Cumple la regla de que toda consulta pase primero por Spring Boot |
| Conservar pgvector y no usar Qdrant | Agregar Qdrant | Aprobado por el profesor |
| Gemini en lugar de OpenRouter | Migrar a OpenRouter | El autor, con aval del profesor |
| Mantener n8n | Hacer el RAG directamente en Spring | El autor: n8n es tecnología obligatoria de la materia |
| Reenvío con `java.net.http.HttpClient` en un controlador comodín (`/api/**`) | Spring Cloud Gateway | Propuesta de la IA: menos dependencias, y los endpoints nuevos de Spring tienen prioridad automáticamente |
| Spring envía la IP real en `X-Forwarded-For` y descarta la del navegador | Reenviar la cabecera recibida | Los límites de intentos de FastAPI son por IP; reenviarla permitiría falsificarla |
| `forward-headers-strategy` en `none` por defecto | `native` siempre | Una prueba automatizada mostró que `native` aceptaba IP falsas en desarrollo |
| Spring valida el mismo JWT de FastAPI (HS256 + `SECRET_KEY`) | Un segundo inicio de sesión en Spring | Un solo login para el usuario; se replican las reglas de `deps.py` (cuenta activa, cambio de contraseña) |
| Dos cadenas de seguridad: solo las rutas de Spring exigen token | Validar el token en todas las rutas | FastAPI ya decide qué rutas son públicas; validar todo en Spring cambiaba el comportamiento de rutas públicas |
| Entidad `Usuario` de solo lectura y validación de esquema (`ddl-auto=validate`) | Que Hibernate cree o modifique tablas | Las tablas las administra Alembic: una sola fuente del esquema evita que los dos backends se contradigan |
| Pruebas sin base de datos (perfil `test` y repositorio simulado) | Testcontainers o la base de desarrollo | Corren en cualquier PC sin Docker y nunca tocan los datos reales; la integración se verificó a mano con la app real |

### Fase 10: asistente IA con n8n

**Bloque A (n8n y flujo de indexación).** Componentes asistidos:
- servicio n8n en Docker Compose;
- scripts de arranque `n8n/arranque.sh` y `n8n/credenciales.js`;
- flujo de indexación `n8n/workflows/01-indexacion-pgvector.json`, generado con un script y probado contra la base real;
- rutas internas de FastAPI con sus pruebas, y el bloqueo de esas rutas en Spring.

| Decisión | Alternativas consideradas | Cómo se decidió |
|---|---|---|
| n8n genera los vectores llamando al modelo e5 de FastAPI | Embeddings de Gemini u OpenRouter | Propuesta de la IA: los 2.319 vectores existentes siguen sirviendo y la búsqueda actual no cambia |
| n8n guarda directo en pgvector con su nodo de Postgres | Que FastAPI guarde y n8n solo dispare | Así n8n realmente consulta, vectoriza y almacena |
| El texto canónico y su hash los calcula FastAPI | Construir el texto con SQL dentro de n8n | Una sola regla de "qué está desactualizado" para el script, el panel y n8n |
| Credenciales creadas al arrancar desde el `.env` | Configurarlas a mano en la interfaz | Reproducible con `docker compose up` y sin claves en el repositorio |

**Bloque B (asistente RAG).** Componentes asistidos:
- migración de las tablas del asistente y sus entidades JPA;
- servicio y controlador del asistente, cliente de n8n y manejador de errores;
- flujo RAG `n8n/workflows/02-asistente-rag.json`;
- rutas internas de fichas y de validación;
- script de calibración del umbral;
- pruebas con pytest y JUnit.

| Decisión | Alternativas consideradas | Cómo se decidió |
|---|---|---|
| Umbral 0,82 | 0,835 (primera calibración) | La IA lo midió con 50 preguntas; 0,835 perdía preguntas legítimas redactadas como problemas cotidianos |
| Dos barreras: umbral + Gemini indica si las fuentes responden | Solo un umbral alto | Con solo umbral había que elegir entre perder preguntas legítimas o aceptar irrelevantes |
| Validar la respuesta con `validate_text` (ya existente) | Confiar en el prompt | Reutiliza la defensa anti-invención de la búsqueda |
| Spring guarda PENDIENTE antes de llamar a n8n | Guardar todo al final | Si n8n falla o tarda, la consulta queda registrada con su estado |
| Spring vuelve a validar las fuentes contra la base | Confiar en n8n | Regla de negocio: toda fuente debe existir y estar activa |
| Tablas creadas por Alembic, entidades en Spring | Hibernate `ddl-auto=update` | Una sola fuente del esquema |
| Pruebas del asistente contra la base de pruebas real | Repositorios simulados | Comprueban las restricciones y el mapeo JPA reales |

**Bloque C (pantalla del asistente).** Componentes asistidos:
- página `/asistente` (`AssistantPage.jsx` y `AssistantAnswer.jsx`);
- métodos del cliente de la API y enlaces de navegación;
- ícono de la pestaña;
- recorrido visual automatizado con capturas.

**Errores de la IA detectados durante las pruebas y corregidos:**
- **En el prompt del asistente**, encontrados al probar con la app real:
  - recomendaba negocios que no servían para la pregunta (un bar para quien pedía una farmacia);
  - afirmaba ubicaciones que no estaban en los datos;
  - mencionaba ids internos.
- **En el código de React:** la calificación de una consulta pasaba a la siguiente. Lo detectó el recorrido visual.

Todos se corrigieron y se volvieron a probar; el detalle está en `docs/AVANCE.md`.

### Fase 11: entregables

Se registrará al terminar la fase.

## 5. Lecciones del uso de IA

- **La IA se equivoca con seguridad.** Varias respuestas del asistente sonaban correctas pero inventaban datos (una
  ubicación, una recomendación sin relación). Solo las pruebas con datos reales las revelaron. Por eso cada
  componente de IA del producto tiene validaciones fuera del modelo: umbral, comprobación de fuentes y
  validación de datos.
- **Las pruebas automatizadas no bastan.** El error de la calificación en React pasó la compilación y el lint, y
  solo apareció en las capturas de pantalla.
- **Las decisiones de alcance las toma una persona.** En la fase 10 el asistente propuso un módulo de análisis de
  datos; el autor lo descartó porque era una función del proyecto original, no una tecnología exigida.
