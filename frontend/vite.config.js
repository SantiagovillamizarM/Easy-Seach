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
    // Las peticiones a /api se reenvían al backend (así evitamos problemas de CORS en desarrollo)
    proxy: {
      "/api": "http://127.0.0.1:8010",
      "/uploads": "http://127.0.0.1:8010",
    },
  },
});
