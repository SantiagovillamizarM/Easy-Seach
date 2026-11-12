import { Sparkles } from "lucide-react";
import { formatPrice } from "../lib/format.js";

// Muestra al usuario lo que el sistema entendió de su búsqueda (transparencia de la IA).
export default function InterpretationBar({ interpretation, location }) {
  if (!interpretation) return null;
  const i = interpretation;
  const items = [
    i.need && { label: "Busca", value: i.need },
    location && { label: location.source === "gps" ? "Ubicación" : "Lugar", value: location.label },
    (i.budget_min || i.budget_max) && {
      label: "Presupuesto",
      value: [i.budget_min && `desde ${formatPrice(i.budget_min)}`, i.budget_max && `hasta ${formatPrice(i.budget_max)}`]
        .filter(Boolean)
        .join(" "),
    },
    i.price_preference === "low" && { label: "Precio", value: "económico" },
    i.open_now && { label: "Horario", value: "abierto ahora" },
    i.min_rating && { label: "Calificación", value: `${i.min_rating}+` },
    i.preferences?.length > 0 && { label: "Prefiere", value: i.preferences.join(", ") },
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1.5 font-semibold text-brand-700">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Entendimos:
      </span>
      {items.map((item) => (
        <span key={item.label} className="chip">
          <span className="text-ink-soft/80">{item.label}:</span>
          <span className="text-ink">{item.value}</span>
        </span>
      ))}
      {i.parser === "reglas" && (
        <span className="text-xs text-ink-soft" title="El asistente de IA no estaba disponible">
          (interpretación básica)
        </span>
      )}
    </div>
  );
}
