import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 127.0.0.1 (IPv4) para evitar los problemas de "localhost" con IPv6 en Windows
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Las peticiones a /api se reenvían a la puerta de entrada Spring Boot (8020), que a su vez decide si las
    // atiende ella o las pasa a FastAPI. El frontend nunca habla directo con FastAPI, n8n ni la IA.
    proxy: {
      "/api": "http://127.0.0.1:8020",
      "/uploads": "http://127.0.0.1:8020",
    },
  },
});
