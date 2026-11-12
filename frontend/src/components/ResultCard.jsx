import { BadgeCheck, MapPin, Navigation, Sparkles, Star, Tag } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistance, formatPriceRange } from "../lib/format.js";
import HoursBadge from "./HoursBadge.jsx";

const GAP_LABELS = { precios: "precios", horario: "horario", "reseñas": "reseñas", "descripción": "descripción" };

function RecommendationBox({ recommendation, loading }) {
  if (loading) {
    return (
      <div className="mt-3 animate-pulse rounded-xl bg-brand-50/70 p-3" aria-hidden="true">
        <div className="h-3 w-3/4 rounded bg-brand-100" />
        <div className="mt-2 h-3 w-1/2 rounded bg-brand-100" />
      </div>
    );
  }
  if (!recommendation) return null;
  return (
    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/70 p-3">
      <p className="flex gap-2 text-sm leading-relaxed text-ink">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        <span>
          <span className="sr-only">Por qué te lo recomendamos: </span>
          {recommendation.text}
        </span>
      </p>
      {recommendation.data_gaps.length > 0 && (
        <p className="mt-1.5 pl-6 text-xs text-ink-soft">
          Aún no tenemos información de: {recommendation.data_gaps.map((g) => GAP_LABELS[g] ?? g).join(", ")}.
        </p>
      )}
    </div>
  );
}

export default function ResultCard({ result, index, active, onHover, recommendation, recommendationLoading }) {
  const price = formatPriceRange(result.price_min, result.price_max, result.price_level);
  const place = [result.neighborhood, result.municipality].filter(Boolean).join(", ");
  const distance = formatDistance(result.distance_km);

  return (
    <article
      onMouseEnter={() => onHover?.(result.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`card group relative flex gap-4 p-4 transition hover:border-brand-200 ${active ? "border-brand-400 ring-4 ring-brand-100" : ""}`}
    >
      <div
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700"
        aria-hidden="true"
      >
        {index + 1}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 className="text-base font-bold leading-snug">
            {/* El enlace cubre toda la tarjeta (patrón "stretched link") */}
            <Link to={`/lugar/${result.slug}`} className="after:absolute after:inset-0 after:rounded-2xl focus:outline-none">
              {result.name}
            </Link>
            {result.is_verified && (
              <BadgeCheck className="ml-1 inline h-4 w-4 text-brand-600" aria-label="Perfil verificado" />
            )}
          </h3>
          {result.rating_count > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
              {Number(result.rating_avg).toFixed(1)}
              <span className="font-normal text-ink-soft">({result.rating_count})</span>
            </span>
          )}
        </div>

        <p className="mt-0.5 text-sm text-ink-soft">{result.categories.map((c) => c.name).join(" · ")}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-soft">
          {place && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {place}
            </span>
          )}
          {distance && (
            <span className="inline-flex items-center gap-1">
              <Navigation className="h-4 w-4" aria-hidden="true" />a {distance}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Tag className="h-4 w-4" aria-hidden="true" />
            {price ?? <span className="italic">Precio no registrado</span>}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <HoursBadge status={result.hours_status} />
          {result.matched_text && <span className="chip">Coincide: {result.matched_text}</span>}
          {result.budget_fit === "dentro" && <span className="chip border-open/30 text-open">Dentro de tu presupuesto</span>}
        </div>

        <RecommendationBox recommendation={recommendation} loading={recommendationLoading} />
      </div>
    </article>
  );
}

export function ResultCardSkeleton() {
  return (
    <div className="card flex animate-pulse gap-4 p-4" aria-hidden="true">
      <div className="h-9 w-9 rounded-xl bg-slate-100" />
      <div className="flex-1 space-y-2.5">
        <div className="h-4 w-1/2 rounded bg-slate-100" />
        <div className="h-3 w-1/3 rounded bg-slate-100" />
        <div className="h-3 w-2/3 rounded bg-slate-100" />
        <div className="h-6 w-40 rounded-full bg-slate-100" />
      </div>
    </div>
  );
}
