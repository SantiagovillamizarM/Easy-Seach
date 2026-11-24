import { ArrowRight, Coffee, Pill, Sparkles, Utensils, Wrench } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import HowItWorks from "../components/HowItWorks.jsx";
import QueryDemo from "../components/QueryDemo.jsx";
import Reveal from "../components/Reveal.jsx";
import SearchBar from "../components/SearchBar.jsx";
import StarField from "../components/StarField.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const SHORTCUTS = [
  { label: "Comida", q: "un buen sitio para comer", icon: Utensils },
  { label: "Cafés", q: "un café para desayunar", icon: Coffee },
  { label: "Mecánicos", q: "taller mecánico", icon: Wrench },
  { label: "Droguerías", q: "droguería", icon: Pill },
];

const searchUrl = (q) => `/buscar?${new URLSearchParams({ q })}`;

function Hero() {
  const { user } = useAuth();
  const [typing, setTyping] = useState(false);
  const onValueChange = useCallback((v) => setTyping(v.trim().length > 0), []);

  return (
    <section className="home-hero text-white" data-dark-hero>
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pb-28 pt-12 text-center sm:pb-36 sm:pt-20">
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
            <span>
              <span className="hero-spectrum block bg-clip-text pb-1 text-transparent">tal como lo dirías.</span>
            </span>
          </span>
        </h1>

        <p className="fade-up mt-5 max-w-xl text-balance text-base text-white/70 sm:text-lg" style={{ "--i": 3 }}>
          Negocios, productos y servicios cerca de ti. Escribe tu necesidad y nosotros nos encargamos del resto.
        </p>

        <div className="hero-search fade-up mt-8 w-full max-w-3xl text-left" style={{ "--i": 4 }}>
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
    <section aria-label="Búsquedas rápidas por categoría" className="relative z-10 mx-auto -mt-12 max-w-5xl px-4 sm:-mt-16">
      <div className="shortcut-grid">
        {SHORTCUTS.map(({ label, q, icon: Icon }, i) => (
          <Reveal key={label} index={i} scale className={i < 2 ? "shortcut-featured" : ""}>
            <Link
              to={searchUrl(q)}
              className="home-shortcut text-[#f3f2ff] focus-visible:outline-[#c4b5fd]"
            >
              <span className="shortcut-icon grid shrink-0 place-items-center text-[#e6edff]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="shortcut-copy">
                <span className="block font-semibold">{label}</span>
                {i < 2 && <span className="shortcut-example">{q[0].toUpperCase() + q.slice(1)}</span>}
              </span>
              <span className="shortcut-action" aria-hidden="true">
                <ArrowRight className="shortcut-arrow h-4 w-4" />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="home-sky under-header">
      <div className="hero-night home-sky-background">
        <div className="hero-grain" aria-hidden="true" />
      </div>
      <StarField canvasClassName="home-sky-stars" />
      <div className="home-sky-blend" aria-hidden="true" />
      <Hero />
      <div className="space-to-light">
        <Shortcuts />
        <HowItWorks />
      </div>
    </div>
  );
}
