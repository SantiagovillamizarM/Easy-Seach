import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";

// Tema claro/oscuro automático según la hora local:
// - De noche (18:00 a 6:00) oscuro; de día, claro. Cambia en vivo al llegar la hora.
// - Si el usuario lo cambia con el selector, su elección se respeta hasta el próximo cambio natural
//   (amanecer o anochecer); a partir de ahí vuelve a ser automático.
// La elección manual se guarda en este navegador (localStorage) junto con su vencimiento.
const NIGHT_FROM = 18; // hora en que empieza la noche
const NIGHT_UNTIL = 6; // hora en que amanece
const OVERRIDE_KEY = "easysearch-theme-override";
const CHECK_MS = 30_000;

const ThemeContext = createContext({ theme: "light", toggleTheme: () => {} });

const isNight = (date) => date.getHours() >= NIGHT_FROM || date.getHours() < NIGHT_UNTIL;
const autoTheme = (date = new Date()) => (isNight(date) ? "dark" : "light");

// Siguiente amanecer o anochecer (cuando el modo automático cambiaría)
function nextSwitch(date = new Date()) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  const hour = date.getHours();
  if (hour < NIGHT_UNTIL) next.setHours(NIGHT_UNTIL);
  else if (hour < NIGHT_FROM) next.setHours(NIGHT_FROM);
  else {
    next.setDate(next.getDate() + 1);
    next.setHours(NIGHT_UNTIL);
  }
  return next.getTime();
}

function readOverride() {
  try {
    const saved = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? "null");
    if (saved && (saved.theme === "dark" || saved.theme === "light") && Date.now() < saved.until) return saved.theme;
  } catch {
    /* almacenamiento bloqueado o dato dañado: se usa el automático */
  }
  return null;
}

function saveOverride(theme) {
  try {
    if (theme) localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ theme, until: nextSwitch() }));
    else localStorage.removeItem(OVERRIDE_KEY);
    localStorage.removeItem("easysearch-theme"); // preferencia de la versión anterior (sin vencimiento)
  } catch {
    /* sin almacenamiento: la elección dura solo esta visita */
  }
}

const currentTheme = () => readOverride() ?? autoTheme();

// Cambio con fundido suave donde el navegador lo permite (View Transitions)
function withTransition(apply) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (document.startViewTransition && !reduce) document.startViewTransition(() => flushSync(apply));
  else apply();
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(currentTheme);

  // Revisa cada medio minuto (y al volver a la pestaña) si ya amaneció/anocheció o venció la elección manual
  useEffect(() => {
    const check = () => {
      const next = currentTheme();
      if (next !== theme) withTransition(() => setTheme(next));
    };
    const id = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    // Si la elección coincide con lo automático, no hace falta guardarla
    saveOverride(next === autoTheme() ? null : next);
    withTransition(() => setTheme(next));
  }, [theme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
