import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext.jsx";

// Selector de modo claro/oscuro: el sol y la luna se cruzan girando al cambiar.
export default function ThemeToggle({ dark = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}
      data-mode={theme}
      className={`theme-toggle relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border transition-colors ${
        dark
          ? "border-white/15 bg-white/5 text-white/90 hover:bg-white/10 hover:text-white"
          : "border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100"
      }`}
    >
      <Sun className="theme-toggle-sun h-[18px] w-[18px]" aria-hidden="true" />
      <Moon className="theme-toggle-moon h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}
