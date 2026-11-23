import { Check, Clock3, Coins, MapPin, MessageSquareText, Pause, Play, Search, Sparkles, Utensils } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal.jsx";
import TrustPanel from "./TrustPanel.jsx";
import "./how-it-works.css";

const QUERY = "Almuerzo barato en Cabecera abierto ahora";
const STEPS = [
  { icon: MessageSquareText, title: "Escribe como hablas", detail: "Cuenta qué necesitas, en qué zona y cuánto quieres gastar.", duration: 5200 },
  { icon: Sparkles, title: "La IA entiende tu necesidad", detail: "Identifica qué buscas, el lugar, el presupuesto y el horario.", duration: 5700 },
  { icon: MapPin, title: "Explora las coincidencias", detail: "Compara los lugares por ubicación, horarios y precios disponibles.", duration: 7600 },
];
const CRITERIA = [
  ["Qué buscas", "Almuerzo", Utensils], ["Ubicación", "Cabecera", MapPin],
  ["Presupuesto", "Económico", Coins], ["Horario", "Abierto ahora", Clock3],
];
const TYPING_BEATS = [64, 98, 76, 124, 70, 86, 106];
const TYPING_TIMES = Array.from(QUERY).reduce((times, letter, index) => {
  const previous = times.at(-1) ?? 560;
  times.push(previous + TYPING_BEATS[index % TYPING_BEATS.length] + (letter === " " ? 78 : 0));
  return times;
}, []);

function DemoMap() {
  return (
    <div className="workflow-map" aria-hidden="true">
      <svg viewBox="0 0 240 180" preserveAspectRatio="none" className="workflow-map-art">
        <rect width="240" height="180" fill="#eef0fa" />
        <path d="M0 0h66l-8 40L0 65zm181 113 59-16v83h-54l-19-34zM6 124l30-13 26 37-18 32H0z" fill="#cde9dc" />
        <path d="m74 9 35 3-4 31-36-4zm44 6 41 7-8 25-37-4zm54 19 43 8-12 29-41-11zM18 74l37-19 19 29-48 16zm82-17 41 4-8 26-34 1zm-18 42 30-1 12 28-29 9zm55 29 27-9 7 26-33 10zm-68 23 36-13 13 42H60z" fill="#d8def2" />
        <path d="M-10 112 65 77l87 16 107-19M73-10 62 48l15 45 30 97M161-12l-13 71-20 56 18 77M-8 55l72-9 91 10 92 24M-8 151l90-10 81-29 84-16" fill="none" stroke="#fff" strokeWidth="7" />
        <path d="M219-10c-22 45-32 69-40 93s-5 64 20 105" fill="none" stroke="#c4ccef" strokeWidth="8" />
        <path className="workflow-route" d="m77 92 75 1 23-4 6 45" pathLength="1" fill="none" stroke="#7364df" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="workflow-pin" style={{ "--pin-x": "32%", "--pin-y": "51%", "--delay": "1.55s" }}>A</span>
      <span className="workflow-pin" style={{ "--pin-x": "75%", "--pin-y": "74%", "--delay": "2.05s" }}>B</span>
      <span className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-1 text-xs font-semibold text-ink">Cabecera</span>
    </div>
  );
}

function DemoScene({ step, typed }) {
  if (step === 0) {
    return (
      <div className="workflow-window mx-auto w-full max-w-md">
        <div className="workflow-search-icon"><Search aria-hidden="true" /></div>
        <p className="mb-4 mt-4 text-xl font-bold">¿Qué estás buscando?</p>
        <div className="workflow-search">
          <Search className="h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
          <p className="min-w-0 text-sm font-medium">
            <span className="sr-only">{QUERY}</span>
            <span aria-hidden="true"><span ref={typed}>{QUERY}</span><span className="workflow-caret" /></span>
          </p>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="workflow-window">
        <p className="workflow-query"><Search className="h-4 w-4 shrink-0" aria-hidden="true" />{QUERY}</p>
        <p className="my-4 flex items-center gap-2 text-sm font-semibold text-brand-700">
          <Sparkles className="workflow-processing h-5 w-5" aria-hidden="true" />
          Analizando tu búsqueda…
        </p>
        <dl className="grid grid-cols-2 gap-2.5">
          {CRITERIA.map(([label, value, Icon], i) => (
            <div key={label} className="workflow-criterion workflow-arrival" style={{ "--delay": `${1.05 + i * 0.62}s` }}>
              <Icon className="mb-2 h-5 w-5 text-brand-700" aria-hidden="true" />
              <dt className="text-xs text-ink-soft">{label}</dt>
              <dd className="mt-0.5 break-words text-sm font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="workflow-window">
      <p className="workflow-result-status mb-3 flex items-center gap-2 text-sm font-semibold text-brand-700">
        <span className="workflow-wait flex items-center gap-2"><Search className="h-4 w-4" aria-hidden="true" />Buscando coincidencias…</span>
        <span className="workflow-found flex items-center gap-2"><Check className="h-4 w-4" aria-hidden="true" />Coincidencias en Cabecera</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className="grid content-center gap-2.5">
          {["0,6 km", "1,2 km"].map((distance, i) => (
            <div key={distance} className="workflow-result workflow-arrival" style={{ "--delay": `${1 + i * 0.7}s` }}>
              <p className="flex items-center justify-between gap-1 text-sm font-bold">Opción {i ? "B" : "A"} <Check className="h-4 w-4 text-open" aria-hidden="true" /></p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                <span className="rounded-full bg-open-bg px-2 py-0.5 font-semibold text-open">Abierto</span>
                <span>{distance}</span><span>Económico</span>
              </p>
            </div>
          ))}
        </div>
        <DemoMap />
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const demo = useRef(null);
  const typed = useRef(null);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const elapsed = useRef(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    const node = demo.current;
    if (reduced) {
      if (typed.current) typed.current.textContent = QUERY;
      return undefined;
    }
    let frame = 0;
    let previous;
    let visible = typeof IntersectionObserver === "undefined";
    let count = -1;
    const duration = STEPS[step].duration;

    function paint() {
      const time = elapsed.current;
      node.style.setProperty("--progress", Math.min(1, time / duration));
      node.toggleAttribute("data-exiting", time >= duration - 380);
      node.toggleAttribute("data-submitting", step === 0 && time >= duration - 900);
      if (!typed.current) return;
      const pending = TYPING_TIMES.findIndex((at) => at > time);
      const next = pending === -1 ? QUERY.length : pending;
      if (next !== count) {
        typed.current.textContent = QUERY.slice(0, next);
        count = next;
      }
    }

    function tick(now) {
      frame = 0;
      if (previous !== undefined) elapsed.current += now - previous;
      previous = now;
      if (elapsed.current >= duration) {
        elapsed.current = 0;
        setStep((step + 1) % STEPS.length);
        return;
      }
      paint();
      frame = requestAnimationFrame(tick);
    }

    function sync() {
      const playing = visible && !paused && !document.hidden;
      node.toggleAttribute("data-playing", playing);
      if (playing && !frame) frame = requestAnimationFrame(tick);
      if (!playing) {
        cancelAnimationFrame(frame);
        frame = 0;
        previous = undefined;
      }
    }

    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer?.observe(node);
    document.addEventListener("visibilitychange", sync);
    paint();
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      node.removeAttribute("data-playing");
    };
  }, [step, paused, reduced]);

  return (
    <section className="mx-auto max-w-5xl px-4 pb-20 pt-44 sm:pt-80">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Cómo funciona</p>
        <h2 className="mt-2 text-balance text-3xl font-bold sm:text-4xl">De una frase a lugares reales</h2>
      </Reveal>
      <Reveal className="mt-10">
        <div ref={demo} className="workflow-demo" data-reduced={reduced || undefined} data-step={step}>
          <ol className="workflow-steps grid content-center gap-3">
            {STEPS.map(({ icon: Icon, title, detail }, i) => (
              <li key={title}>
                <button
                  type="button"
                  className="workflow-step"
                  aria-current={step === i ? "step" : undefined}
                  aria-controls="home-search-example"
                  onClick={() => {
                    if (step === i) return;
                    elapsed.current = 0;
                    setStep(i);
                  }}
                >
                  <span className="workflow-step-icon">
                    <svg className="workflow-step-progress" viewBox="0 0 48 48" aria-hidden="true">
                      <circle cx="24" cy="24" r="22" pathLength="1" />
                    </svg>
                    <Icon className="workflow-step-symbol h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold">{title}</span>
                    <span className="mt-1 block text-sm text-ink-soft">{detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="workflow-panel">
            <div className="workflow-toolbar">
              <span className="flex items-center gap-2 text-sm font-bold text-indigo-50"><Sparkles className="h-4 w-4 text-sky-200" aria-hidden="true" />Demostración de búsqueda</span>
              {!reduced && (
                <button type="button" className="workflow-control" aria-label={paused ? "Reanudar demostración" : "Pausar demostración"} onClick={() => setPaused(!paused)}>
                  {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
                </button>
              )}
            </div>
            <div id="home-search-example" className="workflow-stage">
              <div key={step} className="workflow-scene"><DemoScene step={step} typed={typed} /></div>
            </div>
          </div>
        </div>
      </Reveal>
      <TrustPanel />
    </section>
  );
}
