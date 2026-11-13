import { ArrowRight, Coffee, MapPinned, MessageSquareText, Pill, ShieldCheck, Sparkles, Utensils, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import SearchBar from "../components/SearchBar.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const EXAMPLES = [
  "Quiero comer una hamburguesa en Piedecuesta",
  "Necesito un mecánico que arregle llantas de busetas en Bucaramanga",
  "Hamburguesas en Bucaramanga por máximo 25.000 pesos",
  "Un sitio para tomar café y desayunar abierto ahora",
];

const SHORTCUTS = [
  { label: "Comida", q: "un buen sitio para comer", icon: Utensils },
  { label: "Cafés", q: "un café para desayunar", icon: Coffee },
  { label: "Mecánicos", q: "taller mecánico", icon: Wrench },
  { label: "Droguerías", q: "droguería", icon: Pill },
];

const STEPS = [
  {
    icon: MessageSquareText,
    title: "Escribe como hablas",
    text: "Sin categorías ni palabras exactas. Cuéntanos qué necesitas, dónde y cuánto quieres gastar.",
  },
  {
    icon: Sparkles,
    title: "La IA entiende tu necesidad",
    text: "Identifica qué buscas, el lugar, tu presupuesto y si necesitas que esté abierto.",
  },
  {
    icon: MapPinned,
    title: "Te mostramos lo más adecuado",
    text: "Búsqueda semántica combinada con ubicación, horarios y precios reales.",
  },
];

export default function HomePage() {
  const { user } = useAuth();
  return (
    <>
      <section className="hero-mesh">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-16 pt-14 text-center sm:pb-24 sm:pt-24">
          <span className="chip mb-5 border-brand-200 bg-brand-50 text-brand-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Búsqueda inteligente · Área metropolitana de Bucaramanga
          </span>
          <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">
            Encuentra lo que necesitas,{" "}
            <span className="bg-gradient-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent">tal como lo dirías.</span>
          </h1>
          <p className="mt-4 max-w-xl text-balance text-base text-ink-soft sm:text-lg">
            Negocios, productos y servicios cerca de ti. Escribe tu necesidad y nosotros nos encargamos del resto.
          </p>

          <div className="mt-8 w-full text-left">
            <SearchBar autoFocus />
          </div>
          {!user && (
            <p className="mt-3 text-sm text-ink-soft">
              Para buscar necesitas una cuenta gratuita.{" "}
              <Link to="/registro?next=%2F" className="font-semibold text-brand-700 hover:underline">Créala en 1 minuto</Link>
              {" "}o{" "}
              <Link to="/ingresar" className="font-semibold text-brand-700 hover:underline">inicia sesión</Link>.
            </p>
          )}

          <div className="mt-6 w-full">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Prueba con</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((q) => (
                <Link
                  key={q}
                  to={`/buscar?${new URLSearchParams({ q })}`}
                  className="chip px-3.5 py-1.5 text-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                >
                  {q}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SHORTCUTS.map(({ label, q, icon: Icon }) => (
            <Link
              key={label}
              to={`/buscar?${new URLSearchParams({ q })}`}
              className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-brand-200"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="font-semibold">{label}</span>
              <ArrowRight className="ml-auto h-4 w-4 text-ink-soft" aria-hidden="true" />
            </Link>
          ))}
        </div>

        <h2 className="mt-14 text-center text-2xl font-extrabold tracking-tight">Cómo funciona</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="card p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-xs font-bold text-ink-soft">PASO {i + 1}</span>
              </div>
              <h3 className="mt-4 font-bold">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-open/20 bg-open-bg/60 p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-open" aria-hidden="true" />
          <p className="text-sm text-ink">
            <strong>Información real, sin inventos.</strong> Si no conocemos el precio o el horario de un lugar, te lo
            decimos. Tu ubicación solo se usa para la búsqueda y los avisos de trancón, y nunca se guarda.
          </p>
        </div>
      </section>
    </>
  );
}
