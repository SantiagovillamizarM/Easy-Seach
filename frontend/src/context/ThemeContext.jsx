import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { flushSync } from "react-dom";

// Tema claro/oscuro elegido por el usuario. Se recuerda en este navegador (localStorage); por
// defecto es claro, que es el diseño base. Por ahora solo el dashboard de resultados lo aplica.
const STORAGE_KEY = "easysearch-theme";
const ThemeContext = createContext({ theme: "light", toggleTheme: () => {} });

function savedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : "light";
  } catch {
    return "light"; // almacenamiento bloqueado (modo privado, cookies desactivadas)
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(savedTheme);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* sin almacenamiento: el cambio dura solo esta visita */
    }
    const apply = () => flushSync(() => setTheme(next));
    // Fundido suave entre temas donde el navegador lo permite (View Transitions)
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduce) document.startViewTransition(apply);
    else apply();
  }, [theme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
