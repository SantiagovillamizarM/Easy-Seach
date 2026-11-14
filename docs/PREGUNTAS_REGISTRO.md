# Preguntas estándar para registrar un negocio

Cuestionario para pedirle a un negocio los datos que necesita Easy Search. Se puede enviar por WhatsApp o
leer en persona. Cada pregunta corresponde a una columna de `backend/data/locales_easysearch.csv` (ver la
tabla al final). Para cargar las respuestas, sigue la [guía de carga manual](CARGA_MANUAL.md).

> Regla del proyecto: solo se publican datos que el negocio confirma o que ya son públicos (su Instagram,
> su página o Google Maps). Nunca se inventan precios ni horarios.

---

## Mensaje para el negocio (copiar y pegar)

**Hola 👋 Estamos registrando negocios en Easy Search, un buscador gratuito de negocios de Bucaramanga y su
área metropolitana. Te escribimos para que tu negocio aparezca con información correcta. ¿Nos ayudas con
estos datos?**

### 1. Datos básicos

1. ¿Cuál es el nombre exacto del negocio, tal como lo conocen los clientes?
2. ¿Cuál es la dirección? ¿En qué barrio y municipio está?
3. ¿Nos puedes enviar la ubicación por WhatsApp o un enlace de Google Maps?
4. ¿Tienen otras sedes? Si es así, ¿cuáles son sus direcciones?

### 2. Qué hacen

5. En una o dos frases, ¿cómo describirías tu negocio? Por ejemplo: "Asadero de pollo a la brasa con
   domicilios en Girón".
6. ¿Qué es lo más pedido o por lo que más los conocen?
7. ¿Tienen algo especial? Por ejemplo: domicilios, parqueadero, zona para niños, mascotas permitidas,
   música en vivo, opciones vegetarianas o acceso para silla de ruedas.

### 3. Contacto

8. ¿Cuál es el teléfono para llamadas?
9. ¿Tienen WhatsApp? ¿Es el mismo número?
10. ¿Tienen Instagram, Facebook, página web o correo?

### 4. Horario

11. ¿Qué días abren y en qué horario? Si cambia según el día, dinos el horario de cada día.
12. ¿Cierran al mediodía?
13. ¿Abren los festivos? ¿Con qué horario?

### 5. Precios y productos

14. ¿Cuál es el precio más barato y el más caro que manejan, más o menos?
15. ¿Nos puedes enviar la carta, el menú o la lista de servicios con precios? Sirve una foto, un PDF o el
    enlace.
16. ¿Qué medios de pago reciben? Por ejemplo: efectivo, Nequi, Daviplata, tarjeta o transferencia.

### 6. Fotos y administración (opcional)

17. ¿Tienen fotos del lugar o de sus productos que podamos publicar?
18. ¿Te gustaría administrar tu perfil? Con una cuenta comercial gratuita puedes actualizar precios,
    horarios, fotos y carta, y responder a las reseñas.

### 7. Autorización

19. ¿Nos autorizas a publicar esta información en Easy Search?

¡Gracias! 🙌

---

## Notas para quien registra

- **La pregunta 19 es obligatoria.** Sin autorización, registra solo lo que ya es público.
- **Ubicación (pregunta 3):** de un enlace de Google Maps salen la latitud y la longitud. Si no lo envían,
  búscalo en Google Maps → clic derecho sobre el lugar → copiar los dos números.
- **Varias sedes (pregunta 4):** cada sede es una fila aparte, con su propio `slug` (ej.
  `dynamic-sports-gym-piedecuesta` y `dynamic-sports-gym-giron`).
- **Festivos (pregunta 13):** el horario semanal no distingue festivos. Escríbelo en la descripción, o que
  el dueño registre cada festivo como "fecha especial" desde su panel.
- **Horario que cambia mucho** (por temporada, por ejemplo): pide que lo envíen por escrito o con una foto
  del aviso.
- **Si el negocio ya aparece** en Easy Search (vino de OpenStreetMap), completa esa fila con la columna `osm`
  en lugar de crear uno nuevo, para no duplicarlo.
- **Pregunta 18 = sí:** el dueño crea su cuenta en la app, abre la página del negocio y, en el recuadro
  "¿Eres el dueño de este negocio?", pulsa **Solicitar administración**. Un administrador la aprueba en
  Admin → Solicitudes.

## De la respuesta a la columna del CSV

| Pregunta | Columna en `locales_easysearch.csv` | Ejemplo |
|---|---|---|
| 1 | `nombre` | `Dynamic Sports Gym` |
| 2 | `direccion`, `barrio`, `municipio` | `Calle 10 # 13-37`, `San Antonio`, `Piedecuesta` |
| 3 | `latitud`, `longitud` | `6.987636`, `-73.044983` |
| 4 | una fila por sede, cada una con su `slug` | `dynamic-sports-gym-giron` |
| 5, 6, 7, 13, 16 | `descripcion` | `Gimnasio… Abre domingos y festivos de 6 a. m. a 1 p. m. Pagos: efectivo y Nequi.` |
| 5 | `categorias` | `gimnasios` (lista de slugs en la guía de carga manual) |
| 8 | `telefono` | `324 584 0804` |
| 9 | `whatsapp` | `301 809 3201` |
| 10 | `instagram`, `facebook`, `sitio_web`, `correo` | `@dynamic_piedecuesta` |
| 11, 12 | `horario` | `Mo-Fr 05:00-22:00; Sa 05:00-18:00; Su 06:00-13:00` |
| 14 | `precio_min`, `precio_max` | `10000`, `600000` |
| 15 | `productos` o `servicios` | `#Planes 2026\|Mensualidad:80000\|Plan anual:600000` |
| 17 | se suben desde el panel comercial o el panel admin (no van en el CSV) | — |

La descripción es lo que más ayuda a la búsqueda: entre más concreta (qué venden, qué tiene de especial),
mejor la encuentran.
