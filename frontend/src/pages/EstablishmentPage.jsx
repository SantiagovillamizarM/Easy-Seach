import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  Globe,
  Info,
  AtSign,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Star,
  Tag,
} from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import FavoriteButton from "../components/FavoriteButton.jsx";
import HoursBadge from "../components/HoursBadge.jsx";
import { useUserLocation } from "../context/LocationContext.jsx";
import { api } from "../lib/api.js";
import {
  formatPrice,
  formatPriceRange,
  formatTime,
  instagramUrl,
  safeExternalUrl,
  weeklySchedule,
  whatsappNumber,
} from "../lib/format.js";

const ResultsMap = lazy(() => import("../components/ResultsMap.jsx"));

function ActionLink({ href, icon: Icon, children, primary }) {
  if (!href) return null;
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className={primary ? "btn-primary" : "btn-ghost"}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </a>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
        {Icon && <Icon className="h-4 w-4 text-brand-600" aria-hidden="true" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-8" aria-hidden="true">
      <div className="h-8 w-1/2 rounded bg-slate-100" />
      <div className="mt-3 h-4 w-1/3 rounded bg-slate-100" />
      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="h-64 rounded-2xl bg-slate-100" />
        <div className="h-64 rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}

export default function EstablishmentPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { coords } = useUserLocation();
  const [est, setEst] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setEst(null);
    setError(null);
    api
      .establishment(slug, { signal: controller.signal })
      .then((data) => {
        setEst(data);
        document.title = `${data.name} · Easy Search`;
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err);
      });
    return () => controller.abort();
  }, [slug]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-lg font-bold">{error.status === 404 ? "Este lugar no existe o ya no está disponible." : error.message}</p>
        <Link to="/" className="btn-primary mt-6">Volver al inicio</Link>
      </div>
    );
  }
  if (!est) return <DetailSkeleton />;

  const price = formatPriceRange(est.price_min, est.price_max, est.price_level);
  const schedule = weeklySchedule(est.opening_hours);
  const todayIndex = (new Date().getDay() + 6) % 7; // JS: 0 = domingo → nuestro 0 = lunes
  const wa = whatsappNumber(est.whatsapp);
  const products = est.offerings.filter((o) => o.kind === "product");
  const services = est.offerings.filter((o) => o.kind === "service");
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${est.latitude},${est.longitude}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <button type="button" onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver
      </button>

      {/* Encabezado */}
      <header className="card p-5 sm:p-6">
        <p className="text-sm font-medium text-brand-700">{est.categories.map((c) => c.name).join(" · ")}</p>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
          {est.name}
          {est.is_verified && (
            <span className="chip border-brand-200 bg-brand-50 text-brand-700">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Verificado
            </span>
          )}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-soft">
          <HoursBadge status={est.hours_status} />
          {est.rating_count > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-ink">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
              {Number(est.rating_avg).toFixed(1)}
              <span className="font-normal text-ink-soft">({est.rating_count} reseñas)</span>
            </span>
          ) : (
            <span>Sin reseñas todavía</span>
          )}
          <span className="inline-flex items-center gap-1">
            <Tag className="h-4 w-4" aria-hidden="true" />
            {price ?? "Precio no registrado"}
          </span>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
          {[est.address, est.neighborhood, est.municipality].filter(Boolean).join(", ") || "Dirección no registrada"}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <ActionLink href={directions} icon={Navigation} primary>Cómo llegar</ActionLink>
          <FavoriteButton establishmentId={est.id} name={est.name} withLabel className="px-4 py-2.5" />
          <ActionLink href={est.phone ? `tel:${est.phone.replace(/[^\d+]/g, "")}` : null} icon={Phone}>Llamar</ActionLink>
          <ActionLink href={wa ? `https://wa.me/${wa}` : null} icon={MessageCircle}>WhatsApp</ActionLink>
          <ActionLink href={safeExternalUrl(est.website)} icon={Globe}>Sitio web</ActionLink>
          <ActionLink href={instagramUrl(est.instagram)} icon={AtSign}>Instagram</ActionLink>
        </div>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Section title="Acerca de este lugar" icon={Info}>
            {est.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed">{est.description}</p>
            ) : (
              <p className="text-sm text-ink-soft">Este establecimiento todavía no tiene una descripción.</p>
            )}
          </Section>

          {(products.length > 0 || services.length > 0) && (
            <Section title="Productos y servicios" icon={Tag}>
              {[
                { title: "Productos", items: products },
                { title: "Servicios", items: services },
              ]
                .filter((g) => g.items.length > 0)
                .map((group) => (
                  <div key={group.title} className="mb-4 last:mb-0">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">{group.title}</h3>
                    <ul className="divide-y divide-line">
                      {group.items.map((o) => (
                        <li key={o.id} className="flex items-start justify-between gap-4 py-2.5">
                          <div>
                            <p className="text-sm font-semibold">{o.name}</p>
                            {o.description && <p className="text-xs text-ink-soft">{o.description}</p>}
                          </div>
                          <span className="shrink-0 text-sm font-semibold">
                            {formatPrice(o.price) ?? <span className="font-normal italic text-ink-soft">Sin precio</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </Section>
          )}

          {est.photos.length > 0 && (
            <Section title="Fotos">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {est.photos.map((p) => (
                  <img key={p.id} src={p.url} alt={p.caption ?? est.name} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            </Section>
          )}
        </div>

        <aside className="space-y-5">
          <div className="card h-64 overflow-hidden">
            <Suspense fallback={<div className="h-full w-full animate-pulse bg-slate-100" />}>
              <ResultsMap results={[{ ...est, hours_status: est.hours_status }]} userCoords={coords} activeId={est.id} />
            </Suspense>
          </div>

          <Section title="Horario de atención" icon={CalendarClock}>
            {est.opening_hours.length === 0 ? (
              <p className="text-sm text-ink-soft">No tenemos información del horario de este lugar.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <tbody>
                    {schedule.map(({ day, index, ranges }) => (
                      <tr key={day} className={index === todayIndex ? "font-semibold text-ink" : "text-ink-soft"}>
                        <th scope="row" className="py-1 pr-3 text-left font-inherit">
                          {day}
                          {index === todayIndex && <span className="ml-1 text-xs text-brand-600">(hoy)</span>}
                        </th>
                        <td className="py-1 text-right">{ranges.length ? ranges.join(", ") : "Cerrado"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-ink-soft">
                  {est.hours_verified_at
                    ? `Horario confirmado el ${new Date(est.hours_verified_at).toLocaleDateString("es-CO")}.`
                    : "Horario tomado de OpenStreetMap, sin confirmar por el establecimiento."}
                </p>
              </>
            )}
            {est.special_hours.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">Horarios especiales</h3>
                <ul className="space-y-1 text-sm">
                  {est.special_hours.map((s) => (
                    <li key={s.id} className="flex justify-between gap-3">
                      <span>
                        {new Date(`${s.date}T12:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })}
                        {s.note && <span className="text-ink-soft"> · {s.note}</span>}
                      </span>
                      <span>{s.is_closed ? "Cerrado" : `${formatTime(s.opens_at)} – ${formatTime(s.closes_at)}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          {est.source === "osm" && (
            <p className="px-1 text-xs text-ink-soft">
              Información de{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
                OpenStreetMap
              </a>
              . Puede estar incompleta o desactualizada.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
