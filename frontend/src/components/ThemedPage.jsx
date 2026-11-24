import { useTheme } from "../context/ThemeContext.jsx";
import LiquidBackdrop from "./LiquidBackdrop.jsx";
import NightSkyBackdrop from "./NightSkyBackdrop.jsx";
import "../theme.css";

// Contenedor de página que respeta el modo claro/oscuro elegido en el encabezado.
// - Sube por detrás del encabezado (under-header) para que el fondo empiece en el borde de la pantalla.
// - Mismo fondo animado que el dashboard de resultados: líquido perla en claro y cielo estrellado en oscuro.
// - Los colores del modo oscuro (tarjetas, botones, campos, chips…) están en theme.css.
// Para llevar el modo oscuro a otra página basta con envolverla en <ThemedPage> (en App.jsx) y
// añadir su ruta a isThemedRoute en Layout.jsx.
export default function ThemedPage({ children }) {
  const { theme } = useTheme();
  return (
    <div className="theme-scope themed-page under-header" data-theme={theme}>
      {/* Fondo animado: líquido perla en claro y cielo estrellado en oscuro (igual que en resultados) */}
      <div className="themed-page-sky" aria-hidden="true">
        {theme === "dark" ? (
          <NightSkyBackdrop className="themed-page-sky-canvas" />
        ) : (
          <LiquidBackdrop className="themed-page-sky-canvas" />
        )}
      </div>
      {children}
    </div>
  );
}
