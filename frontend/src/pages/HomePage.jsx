import { ArrowRight, Coffee, MapPinned, MessageSquareText, Pill, ShieldCheck, Sparkles, Utensils, Wrench } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import QueryDemo from "../components/QueryDemo.jsx";
import Reveal from "../components/Reveal.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const SHORTCUTS = [
  { label: "Comida", q: "un buen sitio para comer", icon: Utensils },
  { label: "Cafés", q: "un café para desayunar", icon: Coffee },
  { label: "Mecánicos", q: "taller mecánico", icon: Wrench },
  { label: "Droguerías", q: "droguería", icon: Pill },
];

const searchUrl = (q) => `/buscar?${new URLSearchParams({ q })}`;

function StepNumber({ n, dark = false }) {
  return (
    <span className={`font-display text-sm font-bold tabular-nums ${dark ? "text-ai" : "text-brand-600"}`}>
      {String(n).padStart(2, "0")}
    </span>
  );
}

function StepIcon({ icon: Icon, dark = false }) {
  return (
    <span
      className={`grid h-10 w-10 place-items-center rounded-xl ${dark ? "bg-white/10 text-ai" : "bg-brand-50 text-brand-600"}`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

function Hero() {
  const { user } = useAuth();
  const [typing, setTyping] = useState(false);
  const onValueChange = useCallback((v) => setTyping(v.trim().length > 0), []);

  return (
    <section className="hero-night">
      <div className="hero-dots" aria-hidden="true" />
      <div className="hero-grain" aria-hidden="true" />

      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pb-28 pt-12 text-center sm:pb-32 sm:pt-20">
        <span
          className="fade-up inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/80"
          style={{ "--i": 0 }}
        >
          <Sparkles className="h-3.5 w-3.5 text-ai" aria-hidden="true" />
          Búsqueda inteligente · Área metropolitana de Bucaramanga
        </span>

        <h1 className="mt-6 text-[2.5rem] font-extrabold sm:text-6xl lg:text-[5.25rem]">
          <span className="line-mask" style={{ "--i": 0 }}>
            <span>Encuentra lo que necesitas,</span>
          </span>{" "}
          <span className="line-mask" style={{ "--i": 1 }}>
            <span className="bg-gradient-to-r from-brand-400 via-[#a5b4fc] to-ai bg-clip-text pb-1 text-transparent">
              tal como lo dirías.
            </span>
          </span>
        </h1>

        <p className="fade-up mt-5 max-w-xl text-balance text-base text-white/70 sm:text-lg" style={{ "--i": 3 }}>
          Negocios, productos y servicios cerca de ti. Escribe tu necesidad y nosotros nos encargamos del resto.
        </p>

        <div className="fade-up mt-8 w-full max-w-3xl text-left" style={{ "--i": 4 }}>
          <SearchBar autoFocus onDark onValueChange={onValueChange} />
        </div>
        {!user && (
          <p className="fade-up mt-3 max-w-3xl text-balance text-sm text-white/70" style={{ "--i": 5 }}>
            Pruébalo sin cuenta con unas búsquedas gratis. Para buscar sin límites,{" "}
            <Link to="/registro?next=%2F" className="font-semibold text-white underline decoration-ai/60 underline-offset-4 hover:decoration-ai">
              crea tu cuenta en 1 minuto
            </Link>{" "}
            o{" "}
            <Link to="/ingresar" className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
              inicia sesión
            </Link>
            .
          </p>
        )}

        <div className="fade-up w-full max-w-3xl" style={{ "--i": 6 }}>
          <QueryDemo userTyping={typing} />
        </div>
      </div>
    </section>
  );
}

function Shortcuts() {
  return (
    // Las tarjetas "flotan" sobre el borde inferior del hero
    <section aria-label="Búsquedas rápidas por categoría" className="relative z-10 mx-auto -mt-12 max-w-5xl px-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SHORTCUTS.map(({ label, q, icon: Icon }, i) => (
          <Reveal key={label} index={i} scale>
            <Link
              to={searchUrl(q)}
              className="card card-hover group flex h-full items-center gap-3 p-3 sm:p-4 shadow-[var(--shadow-lift)]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 truncate font-semibold">{label}</span>
              <ArrowRight
                className="ml-auto hidden h-4 w-4 shrink-0 text-ink-soft transition-transform sm:block duration-200 group-hover:translate-x-0.5 group-hover:text-brand-600"
                aria-hidden="true"
              />
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="mx-auto max-w-5xl px-4 pb-20 pt-20 sm:pt-28">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Cómo funciona</p>
        <h2 className="mt-2 text-balance text-3xl font-bold sm:text-4xl">De una frase a lugares reales, en tres pasos</h2>
      </Reveal>

      {/* Bento: tarjetas de tamaños distintos que aparecen en el orden de los pasos */}
      <div className="mt-10 grid gap-4 md:grid-cols-6">
        <Reveal index={0} scale className="card flex flex-col p-6 md:col-span-3">
          <div className="flex items-center justify-between">
            <StepIcon icon={MessageSquareText} />
            <StepNumber n={1} />
          </div>
          <h3 className="mt-5 text-lg font-bold">Escribe como hablas</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Sin categorías ni palabras exactas. Cuéntanos qué necesitas, dónde y cuánto quieres gastar.
          </p>
          <div className="mt-6 self-start rounded-2xl rounded-bl-md border border-line bg-canvas px-4 py-3 text-sm" aria-hidden="true">
            “Algo barato para almorzar en Cabecera”
          </div>
        </Reveal>

        <Reveal index={1} scale className="relative flex flex-col overflow-hidden rounded-2xl bg-night p-6 text-white md:col-span-3">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/30 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative flex items-center justify-between">
            <StepIcon icon={Sparkles} dark />
            <StepNumber n={2} dark />
          </div>
          <h3 className="relative mt-5 text-lg font-bold">La IA entiende tu necesidad</h3>
          <p className="relative mt-1 text-sm text-white/70">
            Identifica qué buscas, el lugar, tu presupuesto y si necesitas que esté abierto.
          </p>
          <div className="relative mt-6 flex flex-wrap gap-2" aria-hidden="true">
            {[
              ["Busca", "almuerzo"],
              ["Lugar", "Cabecera"],
              ["Precio", "económico"],
            ].map(([k, v]) => (
              <span key={k} className="inline-flex gap-1.5 rounded-full border border-ai/25 bg-ai/10 px-3 py-1 text-xs">
                <span className="text-white/60">{k}:</span>
                <span className="font-semibold text-ai">{v}</span>
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal index={2} scale className="card flex flex-col p-6 md:col-span-4">
          <div className="flex items-center justify-between">
            <StepIcon icon={MapPinned} />
            <StepNumber n={3} />
          </div>
          <h3 className="mt-5 text-lg font-bold">Te mostramos lo más adecuado</h3>
          <p className="mt-1 text-sm text-ink-soft">Búsqueda semántica combinada con ubicación, horarios y precios reales.</p>
          {/* Miniatura abstracta de una lista de resultados (sin nombres inventados) */}
          <div className="mt-6 space-y-2" aria-hidden="true">
            {[
              ["0,6 km", "w-2/5"],
              ["1,2 km", "w-1/3"],
              ["2,0 km", "w-1/2"],
            ].map(([km, w], i) => (
              <div key={km} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">
                  {i + 1}
                </span>
                <span className={`h-2.5 rounded-full bg-line ${w}`} />
                <span className="ml-auto rounded-full bg-open-bg px-2 py-0.5 text-[11px] font-semibold text-open">Abierto</span>
                <span className="hidden text-xs text-ink-soft sm:inline">a {km}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal
          index={3}
          scale
          className="flex flex-col justify-between gap-6 rounded-2xl border border-open/20 bg-open-bg/70 p-6 md:col-span-2"
        >
          <ShieldCheck className="h-8 w-8 text-open" aria-hidden="true" />
          <div>
            <h3 className="text-lg font-bold">Información real, sin inventos</h3>
            <p className="mt-1 text-sm text-ink">
              Si no conocemos el precio o el horario de un lugar, te lo decimos. Tu ubicación solo se usa para la búsqueda y
              los avisos de trancón, y nunca se guarda.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <Shortcuts />
      <HowItWorks />
    </>
  );
}
