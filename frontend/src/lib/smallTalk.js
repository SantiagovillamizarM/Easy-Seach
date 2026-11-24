// Charla corta con el asistente ("hola", "gracias", "¿qué puedes hacer?"): se responde al instante en el
// navegador, sin gastar una consulta a la IA ni guardarla en el historial. Si el mensaje trae algo que
// buscar ("hola, necesito una ferretería"), NO es charla y va a la IA como siempre.

const SALUDO = ["hola", "ola", "holi", "holis", "hello", "hey", "ey", "buenas", "buenos", "buen", "dia", "dias", "tardes", "noches", "saludos", "alo", "que", "tal", "como", "estas", "esta", "vas", "va", "todo", "bien"];
const AYUDA = ["quien", "eres", "puedes", "haces", "hacer", "sirves", "funcionas", "funciona", "ayuda", "ayudas", "ayudame", "ayudar", "ayudarme", "ayudarias", "explicas", "explicame", "como", "que", "para", "me", "en", "sirve", "usar", "uso", "te", "tu"];
const GRACIAS = ["gracias", "muchas", "mil", "muy", "amable", "genial", "perfecto", "excelente", "chevere", "bacano"];
const DESPEDIDA = ["chao", "adios", "bye", "hasta", "luego", "pronto", "manana", "nos", "vemos", "cuidate"];
const OK = ["ok", "okay", "vale", "listo", "dale", "si", "no", "jaja", "jajaja", "jeje", "xd", "hmm", "mmm", "uy", "ah", "oh"];
const VOCABULARIO = new Set([...SALUDO, ...AYUDA, ...GRACIAS, ...DESPEDIDA, ...OK, "y", "a", "la", "el", "lo", "de", "un", "una", "por"]);

const normalizar = (texto) =>
  texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zñ\s]/g, " ").split(/\s+/).filter(Boolean);

const contiene = (palabras, lista) => palabras.some((p) => lista.includes(p));

// Preguntas para tocar después del saludo (rellenan el cuadro de texto)
export const SUGERENCIAS = [
  "¿Dónde puedo almorzar barato en Cabecera?",
  "Se me dañó la pantalla del celular, ¿dónde la arreglan?",
  "Necesito una ferretería en Piedecuesta",
];

/** Si el mensaje es solo charla, devuelve la respuesta del asistente ({ texto, sugerencias? }); si no, null. */
export function respuestaDeCharla(mensaje, nombre) {
  const palabras = normalizar(mensaje);
  if (palabras.length === 0 || palabras.length > 8 || !palabras.every((p) => VOCABULARIO.has(p))) return null;
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
