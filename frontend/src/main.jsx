import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { FavoritesProvider } from "./context/FavoritesContext.jsx";
import { LocationProvider } from "./context/LocationContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* Última línea de defensa: si falla algo global (p. ej. un contexto), nunca queda la página en blanco */}
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <FavoritesProvider>
            <LocationProvider>
              <App />
            </LocationProvider>
          </FavoritesProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
