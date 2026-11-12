import { LoaderCircle, LocateFixed, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUserLocation } from "../context/LocationContext.jsx";

function LocationToggle({ compact }) {
  const { coords, status, request, clear } = useUserLocation();

  if (coords) {
    return (
      <span className="chip shrink-0 border-open/30 bg-open-bg text-open">
        <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
        {compact ? "Cerca de ti" : "Usando tu ubicación"}
        <button type="button" onClick={clear} className="-mr-1 rounded-full p-0.5 hover:bg-open/10" aria-label="Dejar de usar mi ubicación">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={request}
      disabled={status === "requesting"}
      className="chip shrink-0 hover:border-brand-200 hover:text-brand-700"
      title="Buscar cerca de donde estás"
    >
      {status === "requesting" ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {status === "requesting" ? "Ubicando…" : compact ? "Mi ubicación" : "Usar mi ubicación"}
    </button>
  );
}

export default function SearchBar({ compact = false, autoFocus = false }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const { error } = useUserLocation();

  // Mantener el texto sincronizado si cambia la búsqueda en la URL
  useEffect(() => setValue(params.get("q") ?? ""), [params]);

  function submit(event) {
    event.preventDefault();
    const q = value.trim();
    if (q.length < 2) return;
    // Una búsqueda nueva empieza sin filtros: la IA interpreta el texto completo
    navigate(`/buscar?${new URLSearchParams({ q })}`);
  }

  return (
    <div>
      <form
        role="search"
        onSubmit={submit}
        className={`flex items-center gap-2 border border-line bg-white transition focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100 ${
          compact ? "rounded-xl px-3 py-1.5" : "rounded-2xl px-4 py-3 shadow-[var(--shadow-float)] sm:py-4"
        }`}
      >
        <Search className={`shrink-0 text-brand-600 ${compact ? "h-4 w-4" : "h-6 w-6"}`} aria-hidden="true" />
        <label htmlFor={compact ? "q-compact" : "q-main"} className="sr-only">
          ¿Qué necesitas?
        </label>
        <input
          id={compact ? "q-compact" : "q-main"}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={300}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="search"
          placeholder={compact ? "Busca lo que necesitas…" : "Ej: hamburguesas en Piedecuesta por menos de 25 mil"}
          className={`min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-soft/70 focus:outline-none focus-visible:outline-none ${
            compact ? "text-sm" : "text-base sm:text-lg"
          }`}
        />
        <div className="hidden sm:block">
          <LocationToggle compact={compact} />
        </div>
        <button type="submit" className={compact ? "btn-primary px-3 py-1.5" : "btn-primary px-5 sm:py-3"} aria-label="Buscar">
          {compact ? <Search className="h-4 w-4" /> : "Buscar"}
        </button>
      </form>
      <div className="mt-2 flex items-center gap-2 sm:hidden">
        <LocationToggle compact={compact} />
      </div>
      {error && <p className="mt-2 text-xs text-closed">{error}</p>}
    </div>
  );
}
