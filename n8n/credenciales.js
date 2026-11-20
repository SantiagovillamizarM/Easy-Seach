// Crea el archivo de credenciales de n8n a partir de las variables de entorno.
//
// Las claves nunca se escriben en los flujos (n8n/workflows/*.json): los flujos solo citan la credencial por
// su id, y este script la crea al arrancar el contenedor con los valores del .env.
// Uso: node credenciales.js <archivo-de-salida>
const fs = require("fs");

const env = process.env;
const obligatorias = ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "INTERNAL_API_KEY", "N8N_WEBHOOK_KEY"];
const faltan = obligatorias.filter((k) => !env[k]);
if (faltan.length) {
  console.error(`[easysearch] Faltan variables en el .env: ${faltan.join(", ")}`);
  process.exit(1);
}

const credenciales = [
  {
    id: "EsPostgres000001",
    name: "EasySearch PostgreSQL",
    type: "postgres",
    data: {
      host: env.EASYSEARCH_DB_HOST || "db",
      port: Number(env.EASYSEARCH_DB_PORT || 5432),
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      ssl: "disable",
    },
  },
  {
    // n8n -> FastAPI (/api/internal): embeddings y textos pendientes de indexar
    id: "EsFastapiInterna",
    name: "EasySearch FastAPI interna",
    type: "httpHeaderAuth",
    data: { name: "X-Internal-Key", value: env.INTERNAL_API_KEY },
  },
  {
    // Spring Boot -> n8n: los webhooks solo aceptan peticiones con esta cabecera
    id: "EsWebhookSpring1",
    name: "EasySearch webhook (Spring)",
    type: "httpHeaderAuth",
    data: { name: "X-N8N-Key", value: env.N8N_WEBHOOK_KEY },
  },
  {
    // n8n -> Gemini (flujo RAG). Sin clave el flujo responde con estado de error controlado.
    id: "EsGeminiApiKey01",
    name: "Gemini API",
    type: "httpHeaderAuth",
    data: { name: "x-goog-api-key", value: env.GEMINI_API_KEY || "sin-configurar" },
  },
];

fs.writeFileSync(process.argv[2], JSON.stringify(credenciales), { mode: 0o600 });
console.log(`[easysearch] ${credenciales.length} credenciales preparadas`);
