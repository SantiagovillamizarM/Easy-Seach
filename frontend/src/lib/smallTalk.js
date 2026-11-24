// Charla y preguntas sobre el propio asistente, respondidas al instante en el navegador (sin gastar una
// consulta a la IA ni guardarla en el historial):
// - Charla: "hola", "gracias", "chao", "¿qué puedes hacer?".
// - Preguntas frecuentes sobre cómo funciona: ubicación, de dónde saca los datos, similitud, historial,
//   límites, precios… Las respuestas están escritas a mano para que digan EXACTAMENTE lo que el sistema
//   hace (una IA improvisando podría prometer algo falso, por ejemplo sobre la privacidad).
// Si el mensaje trae algo que buscar ("hola, necesito una ferretería"), va a la IA como siempre.

const SALUDO = ["hola", "ola", "holi", "holis", "hello", "hey", "ey", "buenas", "buenos", "buen", "dia", "dias", "tardes", "noches", "saludos", "alo", "que", "tal", "como", "estas", "esta", "vas", "va", "todo", "bien"];
const AYUDA = ["quien", "eres", "puedes", "haces", "hacer", "sirves", "funcionas", "funciona", "ayuda", "ayudas", "ayudame", "ayudar", "ayudarme", "ayudarias", "explicas", "explicame", "como", "que", "para", "me", "en", "sirve", "usar", "uso", "te", "tu"];
const GRACIAS = ["gracias", "muchas", "mil", "muy", "amable", "genial", "perfecto", "excelente", "chevere", "bacano"];
const DESPEDIDA = ["chao", "adios", "bye", "hasta", "luego", "pronto", "manana", "nos", "vemos", "cuidate"];
const OK = ["ok", "okay", "vale", "listo", "dale", "si", "no", "jaja", "jajaja", "jeje", "xd", "hmm", "mmm", "uy", "ah", "oh"];
const VOCABULARIO = new Set([...SALUDO, ...AYUDA, ...GRACIAS, ...DESPEDIDA, ...OK, "y", "a", "la", "el", "lo", "de", "un", "una", "por"]);

const normalizar = (texto) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin tildes
    .replace(/[^a-zñ0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const contiene = (palabras, lista) => palabras.some((p) => lista.includes(p));

// Preguntas para tocar después del saludo (rellenan el cuadro de texto)
export const SUGERENCIAS = [
  "¿Dónde puedo almorzar barato en Cabecera?",
  "Se me dañó la pantalla del celular, ¿dónde la arreglan?",
  "Necesito una ferretería en Piedecuesta",
];

// ---------------------------------------------------------------------------------------------------
// Preguntas frecuentes sobre el asistente. Cada tema se reconoce por la COMBINACIÓN de palabras (un tema
// y una pregunta sobre el sistema), para no confundir una búsqueda real: "busco algo cerca de mi
// ubicación" es una búsqueda; "¿tomas en cuenta mi ubicación?" es una pregunta sobre el asistente.
// ---------------------------------------------------------------------------------------------------
const tiene = (texto, ...patrones) => patrones.every((p) => p.test(texto));

const FAQ = [
  {
    tema: "ubicacion",
    coincide: (t) =>
      tiene(t, /\b(ubicacion|gps|donde estoy|localizacion)\b/, /\b(tomas?|tienes?|usas?|utilizas?|guardas?|guardan|sabes|conoces|ves|rastreas?|pides|necesitas|cuenta|privacidad|comparto|compartir|para que)\b/),
    texto:
      "En este chat no uso tu ubicación: solo leo lo que me escribes. Si quieres opciones de una zona, nómbrala en tu pregunta, por ejemplo «en Cabecera» o «en Girón», y la tengo en cuenta. En el buscador de Easy Search sí puedes activar «Cerca de ti»: ahí tu ubicación se usa solo para ordenar los resultados por cercanía y avisarte si hay trancón, y nunca se guarda.",
    sugerencias: ["¿Dónde puedo almorzar barato en Cabecera?", "Necesito una droguería en Girón"],
  },
  {
    tema: "fuentes",
    coincide: (t) =>
      /\b(inventas?|alucinas?|de donde (sacas|saca|sale|salen|viene|vienen|obtienes))\b/.test(t) ||
      tiene(t, /\b(informacion|datos|respuestas?|recomendaciones|fuentes)\b/, /\b(confiables?|reales|ciertas?|verdaderas?)\b/, /\b(son|es|estan|tus|tu|esta|estas)\b/),
    texto:
      "Solo uso la información de los negocios registrados en Easy Search: su descripción, su carta y precios, sus horarios y sus reseñas. Debajo de cada respuesta te muestro las fuentes, es decir, los negocios de los que saqué los datos. Además, antes de mostrártela se revisa contra esos datos y se quita cualquier frase sin respaldo. Si no encuentro información suficiente, te lo digo en lugar de inventar.",
  },
  {
    tema: "similitud",
    coincide: (t) => /\b(similitud|umbral)\b/.test(t) || tiene(t, /\bsin resultados?\b/, /\b(por que|significa|que es|salio|sale|aparece|dice)\b/),
    texto:
      "La similitud va de 0 a 1 e indica qué tanto se parece cada negocio a tu pregunta. Solo uso los negocios que superan 0,82; si ninguno llega, te respondo «Sin resultados» en lugar de darte opciones que no sirven. Si te pasa, prueba nombrando el tipo de negocio y la zona, por ejemplo «ferretería en Piedecuesta» o «taller de motos en Girón».",
  },
  {
    tema: "historial",
    coincide: (t) =>
      /\bhistorial\b/.test(t) ||
      tiene(t, /\b(preguntas?|conversaciones?|mensajes?|chats?|datos)\b/, /\b(guardas?|guardan|quedan?|ven|puede ver|privad[oa]s?|borra[rn]?)\b/),
    texto:
      "Tus preguntas al asistente quedan en el historial de tu cuenta, para que puedas volver a verlas y calificar las respuestas; solo tú las ves en este chat. Los saludos y las preguntas sobre cómo funciono, como esta, no se guardan. Y tu ubicación nunca se guarda.",
  },
  {
    tema: "limite",
    coincide: (t) =>
      tiene(t, /\b(cuantas?|limite|maximo|cuantos?)\b/, /\b(preguntas?|consultas?|mensajes?)\b/),
    texto:
      "Puedes hacerme hasta 20 preguntas por hora. El límite existe para proteger el servicio de abusos; si lo alcanzas, solo espera un rato y sigue preguntando. Los saludos y las preguntas sobre cómo funciono no cuentan.",
  },
  {
    tema: "costo",
    coincide: (t) =>
      tiene(t, /\b(gratis|gratuito|gratuita|pagar|pago|cuesta|costo|cobran?|suscripcion)\b/,
            /\b(easy|search|app|aplicacion|asistente|usarte|plataforma|pagina|servicio|cuenta|esto|ustedes)\b/),
    texto:
      "Usar Easy Search es gratis: buscar, guardar favoritos, ver tu historial y preguntarme no tiene costo. Solo necesitas una cuenta con el correo confirmado.",
  },
  {
    tema: "precios",
    coincide: (t) =>
      tiene(t, /\b(precios?|horarios?)\b/, /\b(actualizad[oa]s?|confiables?|reales?|verificad[oa]s?|correct[oa]s?|exact[oa]s?)\b/,
            /\b(estan|son|es|tienen|muestran|pones|ponen|los|sus)\b/),
    texto:
      "Los precios y horarios vienen de lo que registró cada negocio o de OpenStreetMap. Cuando un horario no está confirmado por el propio negocio lo marcamos como «sin verificar», y si no conocemos un precio te lo decimos. Aun así, te recomiendo confirmar con el negocio antes de ir.",
  },
  {
    tema: "buscador",
    coincide: (t) => tiene(t, /\b(diferencia|diferente|distinto|mejor|vs|o)\b/, /\bbuscador\b/),
    texto:
      "El buscador te muestra una lista de lugares con filtros, mapa y distancia, ideal cuando ya sabes qué buscas. Yo converso contigo: entiendo la necesidad detrás de tu pregunta, comparo las opciones y te doy pasos concretos. Puedes usar los dos según lo que te sirva.",
  },
  {
    tema: "negocio",
    coincide: (t) =>
      tiene(t, /\b(mi negocio|mi empresa|mi local|mi tienda|soy (el )?dueno|soy (la )?duena)\b/) ||
      tiene(t, /\b(registrar|agregar|anunciar|publicar|inscribir)\b/, /\b(negocio|empresa|local|tienda)\b/),
    texto:
      "Si tienes un negocio que ya aparece en Easy Search, entra a su página y usa «¿Eres el dueño de este negocio?» para solicitar administrarlo. Cuando se apruebe, lo manejas desde el Panel comercial: descripción, horarios, carta con precios, fotos y respuestas a las reseñas. Mientras más completo esté, mejor te puedo recomendar.",
  },
  {
    tema: "como-preguntar",
    coincide: (t) =>
      tiene(t, /\b(como|que)\b/, /\b(te pregunto|preguntarte|te escribo|escribirte|usarte|te uso|puedo preguntar|pregunto|consejos?|tips?)\b/),
    texto:
      "Escríbeme como le hablarías a alguien de la ciudad: qué necesitas, en qué zona y, si quieres, tu presupuesto o el horario. Por ejemplo: «almuerzo barato en Cabecera», «se me dañó la pantalla del celular, ¿dónde la arreglan en Floridablanca?» o «veterinario abierto ahora». También puedes contarme el problema en lugar del tipo de negocio; yo deduzco a quién acudir.",
    sugerencias: SUGERENCIAS,
  },
];

/** Si el mensaje es charla o una pregunta sobre el asistente, devuelve su respuesta ({ texto, sugerencias? }); si no, null. */
export function respuestaDeCharla(mensaje, nombre) {
  const palabras = normalizar(mensaje);
  if (palabras.length === 0) return null;

  // Preguntas frecuentes sobre cómo funciona el asistente (mensajes cortos, como una pregunta normal)
  if (palabras.length <= 25) {
    const texto = ` ${palabras.join(" ")} `;
    const faq = FAQ.find((f) => f.coincide(texto));
    if (faq) return { texto: faq.texto, sugerencias: faq.sugerencias };
  }

  if (palabras.length > 8 || !palabras.every((p) => VOCABULARIO.has(p))) return null;
  const hola = nombre ? `¡Hola, ${nombre}!` : "¡Hola!";

  if (contiene(palabras, ["quien", "eres", "puedes", "haces", "sirves", "funcionas", "funciona", "ayuda", "ayudas", "ayudame", "ayudar", "ayudarme", "ayudarias", "explicas", "explicame", "sirve", "usar", "uso"])) {
    return {
      texto:
        "Soy el asistente de Easy Search. Me cuentas con tus palabras lo que necesitas —un lugar para comer, alguien que arregle algo, una tienda— y busco entre los negocios registrados en Bucaramanga y su área metropolitana. Te digo cuáles te sirven y por qué, te doy pasos concretos y te muestro de qué negocio saqué cada dato. Si no encuentro información suficiente, te lo digo en lugar de inventar.",
      sugerencias: SUGERENCIAS,
    };
  }
  if (contiene(palabras, DESPEDIDA)) {
    return { texto: "¡Hasta pronto! Cuando necesites encontrar algo en la ciudad, aquí estaré." };
  }
  if (contiene(palabras, GRACIAS)) {
    return { texto: "¡Con mucho gusto! Si necesitas encontrar algo más, solo escríbeme." };
  }
  if (contiene(palabras, ["hola", "ola", "holi", "holis", "hello", "hey", "ey", "buenas", "buenos", "buen", "saludos", "alo"])) {
    return {
      texto: `${hola} Soy el asistente de Easy Search. Cuéntame qué necesitas con tus palabras y te recomiendo negocios registrados en Bucaramanga y su área metropolitana, explicándote por qué y de dónde saqué cada dato. Si no encuentro información suficiente, te lo digo en lugar de inventar. ¿Por dónde empezamos?`,
      sugerencias: SUGERENCIAS,
    };
  }
  return { texto: "¿Te ayudo a encontrar algo? Cuéntame qué necesitas y en qué zona, y busco entre los negocios registrados.", sugerencias: SUGERENCIAS };
}
