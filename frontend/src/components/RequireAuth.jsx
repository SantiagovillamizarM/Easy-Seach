import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Protege una página: si no hay sesión, envía al login y luego regresa a donde estaba.
export default function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/ingresar?next=${next}`} replace />;
  }
  return children;
}

/** Solo permite rutas internas como destino después del login (evita redirecciones a otros sitios). */
export function safeNext(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
