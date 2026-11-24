import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./workspace.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { FavoritesProvider } from "./context/FavoritesContext.jsx";
import { LocationProvider } from "./context/LocationContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { enableMotion } from "./lib/motion.js";

// Activa las animaciones de entrada solo cuando hay JavaScript (sin él, todo se ve igual)
enableMotion();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* Última línea de defensa: si falla algo global (p. ej. un contexto), nunca queda la página en blanco */}
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <FavoritesProvider>
              <LocationProvider>
                <App />
              </LocationProvider>
            </FavoritesProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
