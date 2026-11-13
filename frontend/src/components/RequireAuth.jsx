import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Protege una página: si no hay sesión, envía al login y luego regresa a donde estaba.
// Con `verified`, además exige el correo confirmado (búsqueda e IA): si no, envía a /verificar.
export default function RequireAuth({ children, verified = false }) {
  const { user } = useAuth();
  const location = useLocation();
  const here = location.pathname + location.search;
  if (!user) {
    return <Navigate to={`/ingresar?next=${encodeURIComponent(here)}`} replace />;
  }
  // "=== false": una sesión guardada antes de este cambio no trae el dato; el servidor lo confirma igual
  if (verified && user.email_verified === false) {
    return <Navigate to={`/verificar?next=${encodeURIComponent(here)}`} replace />;
  }
  return children;
}

/** Solo permite rutas internas como destino después del login (evita redirecciones a otros sitios). */
export function safeNext(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/** A dónde ir después de entrar: si falta confirmar el correo, primero a /verificar. */
export function afterAuthPath(user, next) {
  return user.email_verified === false ? `/verificar?next=${encodeURIComponent(next)}` : next;
}
