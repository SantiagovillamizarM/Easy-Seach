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
