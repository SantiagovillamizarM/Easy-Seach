import { BadgeCheck, MapPin, Navigation, Sparkles, Star, Tag } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistance, formatPriceRange } from "../lib/format.js";
import FavoriteButton from "./FavoriteButton.jsx";
import HoursBadge from "./HoursBadge.jsx";

const GAP_LABELS = { precios: "precios", horario: "horario", "reseñas": "reseñas", "descripción": "descripción" };

function RecommendationBox({ recommendation, loading }) {
  if (loading) {
    return (
      <div className="ai-surface result-recommendation is-loading mt-3 flex gap-2 rounded-xl p-3" aria-hidden="true">
        <span className="dashboard-icon ai-orb"><Sparkles className="h-4 w-4 animate-pulse" /></span>
        <div className="flex-1 pt-1">
          <div className="skeleton h-3 w-3/4 rounded" />
          <div className="skeleton mt-2 h-3 w-1/2 rounded" />
        </div>
      </div>
    );
  }
  if (!recommendation) return null;
  return (
    <div className="ai-surface result-recommendation mt-3 rounded-xl p-3">
      <p className="flex items-start gap-2.5 text-sm leading-relaxed text-ink">
        <span className="dashboard-icon ai-orb"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
        <span className="min-w-0">
          <span className="result-recommendation-title mb-0.5 block text-xs font-bold text-brand-700">Por qué te lo recomendamos</span>
          {recommendation.text}
        </span>
      </p>
      {recommendation.data_gaps.length > 0 && (
        <p className="mt-1.5 text-xs text-ink-soft">
          Aún no tenemos información de: {recommendation.data_gaps.map((g) => GAP_LABELS[g] ?? g).join(", ")}.
        </p>
      )}
    </div>
  );
}

export default function ResultCard({ result, index, active, onHover, onSelect, recommendation, recommendationLoading }) {
  const price = formatPriceRange(result.price_min, result.price_max, result.price_level);
  const place = [result.neighborhood, result.municipality].filter(Boolean).join(", ");
  const distance = formatDistance(result.distance_km);

  return (
    <article
      onMouseEnter={() => onHover?.(result.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(result.id)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onHover?.(null); }}
      id={index !== undefined ? `resultado-${result.id}` : undefined}
      data-active={active || undefined}
      className="result-card card card-hover group relative flex gap-3 p-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1">
          <h3 className="break-words text-base font-bold leading-snug sm:text-lg">
            {/* El enlace cubre toda la tarjeta (patrón "stretched link") */}
            <Link to={`/lugar/${result.slug}`} className="after:absolute after:inset-0 after:rounded-2xl focus:outline-none">
              {result.name}
            </Link>
            {result.is_verified && (
              <BadgeCheck className="ml-1 inline h-4 w-4 text-brand-600" aria-label="Perfil verificado" />
            )}
          </h3>
          {result.rating_count > 0 && (
            <span className="result-rating inline-flex items-center gap-1 text-sm font-semibold">
              <Star className="h-4 w-4 fill-star text-star" aria-hidden="true" />
              {Number(result.rating_avg).toFixed(1)}
              <span className="font-normal text-ink-soft">({result.rating_count})</span>
            </span>
          )}
          </div>
          <div className="result-actions relative z-10 -mr-1 -mt-1 flex shrink-0 items-center gap-1.5">
            {index !== undefined && (
              <button
                type="button"
                className="result-locate"
                aria-label={`Ver ${result.name} en el mapa`}
                aria-pressed={Boolean(active)}
                onClick={() => onSelect(result.id)}
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Mapa</span>
              </button>
            )}
            <FavoriteButton establishmentId={result.id} name={result.name} className="shrink-0" />
          </div>
        </div>

        <p className="result-category mt-1 text-xs font-semibold text-brand-700">
          {/* Mismo número que el marcador del mapa, como texto discreto */}
          {index !== undefined && <span className="result-index">{String(index + 1).padStart(2, "0")}</span>}
          {result.categories.map((c) => c.name).join(" · ")}
        </p>

        <div className="result-meta mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-soft">
          {place && (
            <span className="result-meta-item inline-flex items-center gap-1">
              <span className="result-meta-icon"><MapPin className="h-4 w-4" aria-hidden="true" /></span>
              {place}
            </span>
          )}
          {distance && (
            <span className="result-meta-item inline-flex items-center gap-1">
              <span className="result-meta-icon"><Navigation className="h-4 w-4" aria-hidden="true" /></span>a {distance}
            </span>
          )}
          <span className="result-meta-item inline-flex items-center gap-1">
            <span className="result-meta-icon"><Tag className="h-4 w-4" aria-hidden="true" /></span>
            {price ?? <span className="italic">Precio no registrado</span>}
          </span>
        </div>

        <div className="result-tags mt-3 flex flex-wrap items-center gap-2">
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
    <div className="result-card card flex gap-3 p-4" aria-hidden="true">
      <div className="flex-1 space-y-2.5">
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
        <div className="skeleton h-6 w-40 max-w-full rounded-full" />
      </div>
    </div>
  );
}
