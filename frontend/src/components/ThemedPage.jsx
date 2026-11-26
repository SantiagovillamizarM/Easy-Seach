import { Suspense, lazy } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import LiquidBackdrop from "./LiquidBackdrop.jsx";
import NightSkyBackdrop from "./NightSkyBackdrop.jsx";
import "../theme.css";

// El agujero negro solo se descarga en el panel de administración
const BlackHole = lazy(() => import("./admin/blackhole/BlackHole.jsx"));

// Contenedor de página que respeta el modo claro/oscuro elegido en el encabezado.
// - Sube por detrás del encabezado (under-header) para que el fondo empiece en el borde de la pantalla.
// - Mismo fondo animado que el dashboard de resultados: líquido perla en claro y cielo estrellado en oscuro.
// - Los colores del modo oscuro (tarjetas, botones, campos, chips…) están en theme.css.
// Para llevar el modo oscuro a otra página basta con envolverla en <ThemedPage> (en App.jsx) y
// añadir su ruta a isThemedRoute en Layout.jsx.
// `variant="admin"`: el panel usa su propia paleta monocroma sobre el agujero negro.
export default function ThemedPage({ children, variant }) {
  const { theme: chosen } = useTheme();
  const admin = variant === "admin";
  const theme = admin ? "dark" : chosen;
  return (
    <div className={`theme-scope themed-page under-header ${admin ? "admin-scope" : ""}`} data-theme={theme}>
      {/* Fondo animado: líquido perla en claro y cielo estrellado en oscuro (igual que en resultados) */}
      <div className="themed-page-sky" aria-hidden="true">
        {admin ? (
          <>
            {/* Fondo del administrador: el agujero negro de cerca (como en Interstellar) y una sombra encima
                para que los paneles se lean */}
            <div className="admin-void" />
            <Suspense fallback={null}>
              <BlackHole className="themed-page-sky-canvas admin-hole" quality={0.8} intensity={0.6} />
            </Suspense>
            <div className="admin-hole-shade" />
          </>
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
