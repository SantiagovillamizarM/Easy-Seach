import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "./AuthContext.jsx";

// Ids de los establecimientos favoritos del usuario, para marcar los corazones en toda la app.
const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { user } = useAuth();
  const [ids, setIds] = useState(() => new Set());
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setIds(new Set());
      return;
    }
    const controller = new AbortController();
    api
      .favoriteIds({ signal: controller.signal })
      .then((list) => setIds(new Set(list)))
      .catch(() => {});
    return () => controller.abort();
  }, [user]);

  // Referencia al valor actual: React puede ejecutar los "actualizadores" de setIds más tarde,
  // así que no se puede leer de ahí si el lugar ya era favorito.
  const idsRef = useRef(ids);
  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  // Cambio optimista: se marca de inmediato y se revierte si el servidor falla
  const toggle = useCallback(async (id) => {
    const wasFavorite = idsRef.current.has(id);
    setIds((prev) => {
      const next = new Set(prev);
      wasFavorite ? next.delete(id) : next.add(id);
      return next;
    });
    setError(null);
    try {
      await (wasFavorite ? api.removeFavorite(id) : api.addFavorite(id));
    } catch (err) {
      setIds((prev) => {
        const next = new Set(prev);
        wasFavorite ? next.add(id) : next.delete(id);
        return next;
      });
      setError(err.message);
    }
  }, []);

  const value = useMemo(() => ({ ids, toggle, error, isFavorite: (id) => ids.has(id) }), [ids, toggle, error]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites debe usarse dentro de FavoritesProvider");
  return ctx;
}
