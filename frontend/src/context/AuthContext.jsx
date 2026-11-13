import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setAuthToken, setUnauthorizedHandler } from "../lib/api.js";

// Sesión del usuario.
// El token se guarda en localStorage para no pedir el login en cada visita. Expira solo (JWT, 2 horas)
// y al cerrar sesión se borra. Nunca se guardan contraseñas.

const STORAGE_KEY = "easysearch.session";
const AuthContext = createContext(null);

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    // Revisar la fecha de expiración incluida en el token (sin verificar firma: eso lo hace el servidor)
    const payload = JSON.parse(atob(session.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function store(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Navegación privada o almacenamiento bloqueado: la sesión dura solo mientras la pestaña esté abierta
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const stored = readStored();
    setAuthToken(stored?.token ?? null);
    return stored;
  });
  const [checking, setChecking] = useState(Boolean(session));

  const applySession = useCallback((next) => {
    setAuthToken(next?.token ?? null); // inmediato: las siguientes peticiones ya llevan el token
    setSession(next);
  }, []);

  // Guardar en el navegador cada vez que cambia la sesión
  useEffect(() => store(session), [session]);

  const logout = useCallback(() => applySession(null), [applySession]);

  // Si el servidor rechaza el token (expirado o usuario desactivado), se cierra la sesión.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Al abrir la app, confirmar con el servidor que la sesión guardada sigue siendo válida
  useEffect(() => {
    if (!session) return;
    api
      .me()
      .then((user) => applySession({ token: session.token, user }))
      .catch(() => {})
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email, password) => {
      const res = await api.login(email, password);
      applySession({ token: res.access_token, user: res.user });
      return res.user;
    },
    [applySession],
  );

  const register = useCallback(
    async (data) => {
      const res = await api.register(data);
      applySession({ token: res.access_token, user: res.user });
      return res.user;
    },
    [applySession],
  );

  const updateUser = useCallback((user) => setSession((s) => (s ? { ...s, user } : s)), []);

  // Tras cambiar la contraseña el servidor invalida los tokens anteriores y entrega uno nuevo
  const replaceSession = useCallback(
    (res) => applySession({ token: res.access_token, user: res.user }),
    [applySession],
  );

  const value = useMemo(
    () => ({ user: session?.user ?? null, checking, login, register, logout, updateUser, replaceSession }),
    [session, checking, login, register, logout, updateUser, replaceSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
