import { Star } from "lucide-react";
import { useState } from "react";

/** Estrellas de solo lectura (admite medias por redondeo visual). */
export function Stars({ value, size = "h-4 w-4" }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${Number(value).toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${size} ${n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

const LABELS = ["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"];

/** Selector de estrellas accesible (funciona con teclado: flechas y Tab). */
export function StarInput({ value, onChange, name = "rating" }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset>
      <legend className="sr-only">Calificación</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
            />
            <Star
              className={`h-8 w-8 rounded transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 ${
                n <= shown ? "fill-amber-400 text-amber-400" : "fill-slate-100 text-slate-300"
              }`}
              aria-hidden="true"
            />
            <span className="sr-only">{n} estrella{n > 1 ? "s" : ""}</span>
          </label>
        ))}
        <span className="ml-2 text-sm font-semibold text-ink-soft">{LABELS[shown] ?? ""}</span>
      </div>
    </fieldset>
  );
}
