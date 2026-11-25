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
// `variant="admin"`: el panel de administración va siempre en oscuro, con su propia paleta de negros,
// azules y grises (admin-scope en theme.css) y un fondo fijo de vacío azul, sin selector de tema.
export default function ThemedPage({ children, variant }) {
  const { theme: chosen } = useTheme();
  const admin = variant === "admin";
  const theme = admin ? "dark" : chosen;
  return (
    <div className={`theme-scope themed-page under-header ${admin ? "admin-scope" : ""}`} data-theme={theme}>
      {/* Fondo animado: líquido perla en claro y cielo estrellado en oscuro (igual que en resultados) */}
      <div className="themed-page-sky" aria-hidden="true">
        {admin ? (
          <div className="admin-void" />
        ) : theme === "dark" ? (
          <NightSkyBackdrop className="themed-page-sky-canvas" />
        ) : (
          <LiquidBackdrop className="themed-page-sky-canvas" />
        )}
      </div>
      {children}
    </div>
  );
}
