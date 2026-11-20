import { Pause, Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

// Demostración del concepto "tus palabras se convierten en lugares": una frase de ejemplo se escribe
// sola y se descompone en lo que entiende la IA (mismas etiquetas que la barra "Entendimos" de resultados).
// Son ejemplos ilustrativos; al hacer clic se lanza la búsqueda real.
export const DEMO_EXAMPLES = [
  {
    q: "Quiero comer una hamburguesa en Piedecuesta",
    chips: [
      ["Busca", "hamburguesa"],
      ["Lugar", "Piedecuesta"],
    ],
  },
  {
    q: "Necesito un mecánico que arregle llantas de busetas en Bucaramanga",
    chips: [
      ["Busca", "mecánico de llantas para busetas"],
      ["Lugar", "Bucaramanga"],
    ],
  },
  {
    q: "Hamburguesas en Bucaramanga por máximo 25.000 pesos",
    chips: [
      ["Busca", "hamburguesas"],
      ["Lugar", "Bucaramanga"],
      ["Presupuesto", "hasta $25.000"],
    ],
  },
  {
    q: "Un sitio para tomar café y desayunar abierto ahora",
    chips: [
      ["Busca", "café y desayuno"],
      ["Horario", "abierto ahora"],
    ],
  },
];

const TYPE_MS = 34; // por carácter
const AFTER_TYPE_MS = 260;
const HOLD_MS = 3000;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return undefined;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const searchUrl = (q) => `/buscar?${new URLSearchParams({ q })}`;

export default function QueryDemo({ userTyping = false }) {
  const reduced = usePrefersReducedMotion();
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState("typing"); // typing → chips → (siguiente ejemplo)
  const [userPaused, setUserPaused] = useState(false);
  const [previewing, setPreviewing] = useState(false); // el usuario está sobre una sugerencia
  const [visible, setVisible] = useState(true);
  const panelRef = useRef(null);

  const example = DEMO_EXAMPLES[idx];
  // Con movimiento reducido se muestra la frase completa y su interpretación, sin ciclo
  const shownChars = reduced ? example.q.length : typed;
  const showChips = reduced || phase === "chips";
  const paused = reduced || userPaused || previewing || userTyping || !visible;

  // No animar si el panel está fuera de pantalla o la pestaña está oculta
  useEffect(() => {
    const el = panelRef.current;
    let onScreen = true;
    const sync = () => setVisible(onScreen && !document.hidden);
    let obs;
    if (el && typeof IntersectionObserver !== "undefined") {
      obs = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      });
      obs.observe(el);
    }
    document.addEventListener("visibilitychange", sync);
    return () => {
      obs?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // Motor de la demostración: un solo temporizador según la fase actual
  useEffect(() => {
    if (paused) return undefined;
    let timer;
    if (phase === "typing") {
      timer =
        typed < example.q.length
          ? setTimeout(() => setTyped((t) => t + 1), TYPE_MS)
          : setTimeout(() => setPhase("chips"), AFTER_TYPE_MS);
    } else {
      timer = setTimeout(() => {
        setIdx((i) => (i + 1) % DEMO_EXAMPLES.length);
        setTyped(0);
        setPhase("typing");
      }, HOLD_MS + example.chips.length * 160);
    }
    return () => clearTimeout(timer);
  }, [paused, phase, typed, example]);

  // Al pasar por una sugerencia se muestra al instante cómo se interpretaría
  function preview(i) {
    setIdx(i);
    setTyped(DEMO_EXAMPLES[i].q.length);
    setPhase("chips");
    setPreviewing(true);
  }

  return (
    <div className="mt-6 text-left">
      <div
        ref={panelRef}
        role="group"
        aria-label="Ejemplo de cómo Easy Search entiende una búsqueda"
        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/60">
            <Sparkles className="h-3.5 w-3.5 text-ai" aria-hidden="true" />
            Así lo entiende Easy Search
          </p>
          {!reduced && (
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-pressed={userPaused}
              className="grid h-7 w-7 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={userPaused ? "Reanudar la demostración" : "Pausar la demostración"}
            >
              {userPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* Texto estable para lectores de pantalla (la animación se oculta para no leerla a trozos) */}
        <p className="sr-only">
          Por ejemplo, «{example.q}» se entiende como: {example.chips.map(([k, v]) => `${k}: ${v}`).join(", ")}.
        </p>

        <div aria-hidden="true">
          {/* Todas las frases apiladas e invisibles reservan la altura de la más larga: nada salta */}
          <div className="mt-3 grid font-medium text-white sm:text-lg">
            {DEMO_EXAMPLES.map((e) => (
              <span key={e.q} className="invisible col-start-1 row-start-1">
                “{e.q}”
              </span>
            ))}
            <span className="col-start-1 row-start-1">
              “{example.q.slice(0, shownChars)}
              {phase === "typing" && !reduced ? <span className="type-caret" /> : "”"}
            </span>
          </div>

          <div className="mt-3 flex min-h-8 flex-wrap gap-2">
            {showChips &&
              example.chips.map(([label, value], i) => (
                <span
                  key={`${idx}-${label}`}
                  className="chip-pop inline-flex items-center gap-1.5 rounded-full border border-ai/25 bg-ai/10 px-3 py-1 text-xs"
                  style={{ "--i": i }}
                >
                  <span className="text-white/60">{label}:</span>
                  <span className="font-semibold text-ai">{value}</span>
                </span>
              ))}
          </div>
        </div>
      </div>

      <p className="mb-2 mt-5 text-center text-xs font-semibold uppercase tracking-wider text-white/60">Prueba con</p>
      <div className="flex flex-wrap justify-center gap-2" onMouseLeave={() => setPreviewing(false)}>
        {DEMO_EXAMPLES.map((e, i) => (
          <Link
            key={e.q}
            to={searchUrl(e.q)}
            onMouseEnter={() => preview(i)}
            onFocus={() => preview(i)}
            onBlur={() => setPreviewing(false)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-200 ${
              i === idx
                ? "border-ai/40 bg-ai/10 text-white"
                : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white"
            }`}
          >
            {e.q}
          </Link>
        ))}
      </div>
    </div>
  );
}
