# Guía de carga manual de establecimientos (CSV)

OpenStreetMap trae nombre y ubicación, pero casi nunca precios, menús ni descripciones. Esta guía explica
cómo completar esa información **con datos reales** usando un archivo CSV que puedes editar en Excel.

> Regla del proyecto: solo se cargan datos verificados (visitaste el lugar, viste su menú, su página oficial
> o su Instagram). Easy Search nunca debe mostrar información inventada.

Para pedirle los datos a un negocio, usa las [preguntas estándar de registro](PREGUNTAS_REGISTRO.md).

## Locales del proyecto (compartidos en el repositorio)

`backend/data/locales_easysearch.csv` contiene los locales que el equipo completó a mano. Está en Git: quien
clone el proyecto obtiene los mismos datos ejecutando (después de `import_osm`):

```powershell
cd backend
.\.venv\Scripts\python -m scripts.import_csv
```

Se puede ejecutar **todas las veces que quieras**: los locales se actualizan, nunca se duplican.

## Pasos para agregar locales

1. Abre `backend/data/locales_easysearch.csv` en Excel (o usa la plantilla
   `backend/data/plantilla_establecimientos.csv` para un archivo aparte).
2. Llena una fila por establecimiento.
3. Guarda como **CSV UTF-8 (delimitado por comas)**. El separador punto y coma de Excel en español también
   funciona.
4. Valida sin guardar:
   ```powershell
   cd backend
   .\.venv\Scripts\python -m scripts.import_csv --dry-run
   ```
5. Corrige las líneas marcadas con ✗ y, cuando todo esté en ✓, guarda:
   ```powershell
   .\.venv\Scripts\python -m scripts.import_csv
   ```

## ¿Completar uno existente o crear uno nuevo?

- **Completar uno de OpenStreetMap:** escribe su referencia en la columna `osm` (ej. `node/123456` o
  `way/987`) y llena solo las columnas que quieras cambiar; las vacías no modifican nada.
  Usa `osm` y no `slug`: el slug de un local de OSM puede ser distinto en otra computadora
  (ej. `terpel-bucaramanga-3`), la referencia OSM no.
- **Crear uno nuevo:** inventa un `slug` fijo (minúsculas, números y guiones, ej. `burger-house-floridablanca`)
  y llena al menos `nombre`, `municipio`, `latitud` y `longitud`. La primera carga lo crea; las siguientes lo
  actualizan. Para obtener las coordenadas: en Google Maps, clic derecho sobre el lugar → copia los dos números
  (el primero es la latitud y el segundo la longitud).

## Columnas

| Columna | Ejemplo | Notas |
|---|---|---|
| `osm` | `node/123456` | Solo para locales que vinieron de OpenStreetMap |
| `slug` | `burger-house-floridablanca` | Fijo para locales nuevos (así no se duplican) |
| `nombre` | `Al Rock Burguer` | |
| `municipio` | `Bucaramanga` | Bucaramanga, Floridablanca, Girón o Piedecuesta |
| `latitud` / `longitud` | `7.1193` / `-73.1227` | Usa punto decimal |
| `direccion` | `Calle 105 # 26-93` | |
| `barrio` | `Provenza` | |
| `descripcion` | `Hamburguesas artesanales de porción grande…` | Lo más importante para la búsqueda semántica |
| `categorias` | `comida-rapida\|restaurantes` | Slugs separados por `\|` (ver tabla abajo) |
| `telefono` / `whatsapp` | `300 123 4567` | Solo números, espacios, `+`, `-`, `()` |
| `sitio_web` / `facebook` | `https://…` | Deben empezar por `http://` o `https://` |
| `instagram` | `@usuario` o URL | |
| `precio_min` / `precio_max` | `15000` / `35000` | En pesos, sin puntos ni `$` |
| `nivel_precio` | `2` | 1 = económico, 2 = moderado, 3 = costoso, 4 = muy costoso |
| `horario` | `Mo-Fr 08:00-18:00; Sa 08:00-12:00; Su off` | Formato OSM (ver abajo) |
| `productos` | `#Hamburguesas\|Doble:22000:Con tocineta\|#Bebidas\|Limonada:6000` | `Nombre:precio:descripción` separados por `\|`; precio y descripción opcionales. `#Sección` agrupa la carta en pestañas |
| `servicios` | `Despinche:10000\|Alineación` | Igual que productos |

`productos` y `servicios`, si tienen datos, **reemplazan** la lista anterior completa.

## Formato del horario

Días: `Mo` lunes, `Tu` martes, `We` miércoles, `Th` jueves, `Fr` viernes, `Sa` sábado, `Su` domingo.

| Texto | Significado |
|---|---|
| `Mo-Fr 08:00-18:00` | Lunes a viernes de 8 a. m. a 6 p. m. |
| `Mo-Sa 08:00-12:00,14:00-18:00` | Horario partido (cierra a mediodía) |
| `Mo-Fr 08:00-18:00; Sa 09:00-13:00; Su off` | Distinto por día; domingo cerrado |
| `Fr-Sa 18:00-02:00` | Abre en la noche y cierra después de medianoche |
| `24/7` | Siempre abierto |

Cuando cargas un horario por CSV, queda marcado como **verificado**.

## Categorías disponibles

| Slug | Nombre |
|---|---|
| `bancos` | Bancos y cajeros |
| `bares` | Bares |
| `belleza` | Belleza y cuidado personal |
| `cafeterias` | Cafeterías |
| `centros-comerciales` | Centros comerciales |
| `comida-rapida` | Comida rápida |
| `deportes` | Deportes y bicicletas |
| `educacion` | Educación y cursos |
| `entretenimiento` | Entretenimiento |
| `estaciones-servicio` | Estaciones de servicio |
| `farmacias` | Farmacias y droguerías |
| `ferreterias` | Ferreterías y construcción |
| `gimnasios` | Gimnasios |
| `heladerias` | Heladerías |
| `hogar` | Hogar y muebles |
| `hoteles` | Hoteles y hospedaje |
| `lavaderos` | Lavaderos de vehículos |
| `llantas` | Llantas y montallantas |
| `mascotas` | Veterinarias y mascotas |
| `mercados-tiendas` | Supermercados y tiendas |
| `motos` | Motos |
| `oficios` | Oficios y servicios |
| `otros-comercios` | Otros comercios |
| `panaderias` | Panaderías y pastelerías |
| `papelerias` | Papelerías y librerías |
| `repuestos-vehiculos` | Repuestos y vehículos |
| `restaurantes` | Restaurantes |
| `ropa-calzado` | Ropa y calzado |
| `salud` | Salud |
| `servicios-profesionales` | Servicios profesionales |
| `talleres-mecanicos` | Talleres mecánicos |
| `tecnologia` | Tecnología y celulares |

## Qué pasa al guardar

- El establecimiento queda con origen `manual`, así que una nueva importación de OSM **no** borra tus datos.
- Los embeddings se regeneran automáticamente, y la búsqueda semántica usa la nueva descripción y los productos.
