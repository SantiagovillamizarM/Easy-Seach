import { useTheme } from "../context/ThemeContext.jsx";
import NightSkyBackdrop from "./NightSkyBackdrop.jsx";
import "../theme.css";

// Contenedor de página que respeta el modo claro/oscuro elegido en el encabezado.
// - Sube por detrás del encabezado (under-header) para que el fondo empiece en el borde de la pantalla.
// - En oscuro pinta la noche fría del sitio con el mismo cielo estrellado del dashboard de resultados.
// - Los colores del modo oscuro (tarjetas, botones, campos, chips…) están en theme.css.
// Para llevar el modo oscuro a otra página basta con envolverla en <ThemedPage> (en App.jsx) y
// añadir su ruta a THEMED_ROUTES en Layout.jsx.
export default function ThemedPage({ children }) {
  const { theme } = useTheme();
  return (
    <div className="theme-scope themed-page under-header" data-theme={theme}>
      {theme === "dark" && (
        <div className="themed-page-sky" aria-hidden="true">
          <NightSkyBackdrop className="themed-page-sky-canvas" />
        </div>
      )}
      {children}
    </div>
  );
}
