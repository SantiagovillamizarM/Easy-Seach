import { History, Info, Loader2, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import AiBot from "../components/AiBot.jsx";
import AssistantAnswer from "../components/AssistantAnswer.jsx";
import Reveal from "../components/Reveal.jsx";
import { api } from "../lib/api.js";
import "./assistant.css";

const MAX = 500;
const PAGE_SIZE = 10;
const EJEMPLOS = [
  "¿Dónde puedo almorzar barato en Cabecera?",
  "Tengo un problema con el internet de mi casa, ¿dónde me ayudan?",
  "Necesito una ferretería en Piedecuesta",
  "Busco un veterinario para mi gato",
];

// Presentación que el robot "dice" al entrar (en primera persona). Los tramos con strong van en negrita.
const INTRO = [
  { text: "¡Hola! Cuéntame qué necesitas con tus palabras. Respondo " },
  { text: "solo", strong: true },
  {
    text:
      " con negocios registrados en Easy Search, te muestro de dónde saqué cada dato y, si no encuentro información suficiente, te lo digo en lugar de inventar.",
  },
];
const INTRO_TEXT = INTRO.map((part) => part.text).join("");
const INTRO_SEEN_KEY = "easysearch-assistant-intro";

// Pausa tras cada carácter: un ritmo de escritura natural, con respiros en comas y puntos
function delayFor(char) {
  if (char === "." || char === "!" || char === "?") return 340;
  if (char === ",") return 170;
  if (char === " ") return 26;
  return 20 + Math.random() * 18;
}

// El mensaje se escribe poco a poco. Devuelve cuántos caracteres van y si ya terminó.
// Con movimiento reducido, o si ya se vio en esta sesión, aparece completo de una vez.
function useTypewriter(text) {
  const instant = (() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    try {
      return sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
    } catch {
      return false;
    }
  })();
  const [count, setCount] = useState(instant ? text.length : 0);
  const done = count >= text.length;

  useEffect(() => {
    if (done) {
      try {
        sessionStorage.setItem(INTRO_SEEN_KEY, "1");
      } catch {
        /* sin almacenamiento: se volverá a escribir la próxima vez */
      }
      return undefined;
    }
    const timer = setTimeout(() => setCount((n) => n + 1), count === 0 ? 650 : delayFor(text[count - 1]));
    return () => clearTimeout(timer);
  }, [count, done, text]);

  return { count, done, skip: () => setCount(text.length) };
}

// Pinta los primeros `count` caracteres respetando las negritas. La última letra se monta con su
// propia clave, así cada letra nueva entra con un fundido suave (efecto de tinta, no de golpe).
function TypedIntro({ count }) {
  let start = 0;
  return INTRO.map((part, i) => {
    const end = start + part.text.length;
    const shown = Math.max(0, Math.min(count, end) - start);
    const segStart = start;
    start = end;
    if (shown === 0) return null;
    const isLast = count > segStart && count <= end;
    const body = isLast ? (
      <>
        {part.text.slice(0, shown - 1)}
        <span key={count} className="assistant-ink">{part.text[shown - 1]}</span>
      </>
    ) : (
      part.text.slice(0, shown)
    );
    return part.strong ? <strong key={i}>{body}</strong> : <span key={i}>{body}</span>;
  });
}

export default function AssistantPage() {
  const [pregunta, setPregunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [ultima, setUltima] = useState(null);       // la consulta recién respondida
  const [historial, setHistorial] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const textareaRef = useRef(null);
  const intro = useTypewriter(INTRO_TEXT);

  const cargar = useCallback(async (p = 1) => {
    setCargando(true);
    try {
      const data = await api.asistente.historial({ pagina: p, tamano: PAGE_SIZE });
      setHistorial((prev) => (p === 1 ? data.items : [...prev, ...data.items.filter((i) => !prev.some((c) => c.id === i.id))]));
      setTotal(data.total);
      setPagina(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Asistente · Easy Search";
    cargar(1);
  }, [cargar]);

  async function enviar(e) {
    e?.preventDefault();
    const texto = pregunta.trim();
    if (texto.length < 3) {
      setError("Escribe tu pregunta (mínimo 3 caracteres).");
      textareaRef.current?.focus();
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const consulta = await api.asistente.preguntar(texto);
      setUltima(consulta);
      setPregunta("");
      // La nueva consulta encabeza el historial (sin repetir la que se muestra arriba)
      setHistorial((prev) => [consulta, ...prev.filter((c) => c.id !== consulta.id)]);
      setTotal((t) => t + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  function actualizar(consulta) {
    if (ultima?.id === consulta.id) setUltima(consulta);
    setHistorial((prev) => prev.map((c) => (c.id === consulta.id ? consulta : c)));
  }

  const anteriores = historial.filter((c) => c.id !== ultima?.id);

  return (
    <div className="assistant-page mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Presentación: el robot en el centro "dice" para qué sirve el asistente */}
      <header className="assistant-intro">
        <AiBot
          size={92}
          talking={!intro.done}
          thinking={enviando}
          className="assistant-avatar"
          label="Robot asistente de Easy Search"
        />
        <h1 className="assistant-title">Asistente</h1>
        {/* Clic en la burbuja: termina de escribir de una vez */}
        <div className="assistant-bubble" onClick={intro.skip} data-done={intro.done || undefined} title={intro.done ? undefined : "Clic para ver todo"}>
          <p className="sr-only">{INTRO_TEXT}</p>
          {/* El texto completo invisible reserva el tamaño: la burbuja no crece mientras se escribe */}
          <div className="assistant-bubble-text" aria-hidden="true">
            <p className="assistant-ghost"><TypedIntro count={INTRO_TEXT.length} /></p>
            <p>
              <TypedIntro count={intro.count} />
              {!intro.done && <span className="assistant-caret" />}
            </p>
          </div>
        </div>
      </header>

      {/* El chat aparece con un fundido desde abajo cuando el robot termina de hablar */}
      {intro.done && (
      <div className="assistant-chat">
      {/* Barra de chat compacta: campo de dos renglones (alto fijo, sin redimensionar) y botón al lado */}
      <form onSubmit={enviar} className="card assistant-composer p-3">
        <label htmlFor="pregunta" className="sr-only">Tu pregunta</label>
        <div className="flex items-stretch gap-2">
          <textarea
            id="pregunta"
            ref={textareaRef}
            rows={2}
            className="input assistant-input"
            maxLength={MAX}
            placeholder="Ej.: Se me dañó la pantalla del celular, ¿dónde la pueden cambiar en Floridablanca?"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter hace salto de línea
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!enviando) enviar();
              }
            }}
            disabled={enviando}
          />
          <button type="submit" className="btn-primary shrink-0 px-4" disabled={enviando} aria-label={enviando ? "Buscando" : "Preguntar"}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            <span className="hidden sm:inline">{enviando ? "Buscando…" : "Preguntar"}</span>
          </button>
        </div>
        <p className="mt-1.5 flex justify-between gap-3 px-1 text-[0.7rem] text-ink-soft">
          <span>Enter para enviar · Shift + Enter para un salto de línea</span>
          <span>{pregunta.length}/{MAX}</span>
        </p>
        {!ultima && historial.length === 0 && !cargando && (
          <div className="mt-4 flex flex-wrap gap-2">
            {EJEMPLOS.map((ej) => (
              <button key={ej} type="button" className="chip hover:border-brand-200 hover:text-ink" onClick={() => setPregunta(ej)}>
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {ej}
              </button>
            ))}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-closed" role="alert">{error}</p>}
      </form>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-soft">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        La similitud (de 0 a 1) indica qué tanto se parece cada negocio a tu pregunta. Confirma precios y horarios
        directamente con el negocio.
      </p>

      {/* Mientras el asistente responde se reserva el lugar de la respuesta */}
      {enviando && (
        <div className="card mt-6 p-5" aria-hidden="true">
          <p className="flex items-center gap-2.5 text-sm font-medium text-brand-700">
            <AiBot size={30} thinking interactive={false} />
            Buscando en los negocios registrados…
          </p>
          <div className="skeleton mt-4 h-3 w-11/12 rounded" />
          <div className="skeleton mt-2 h-3 w-4/5 rounded" />
          <div className="skeleton mt-2 h-3 w-2/3 rounded" />
          <div className="skeleton mt-5 h-16 rounded-xl" />
        </div>
      )}

      {/* Región "en vivo" estable para lectores de pantalla; dentro, cada respuesta nueva entra con fundido */}
      <div aria-live="polite">
        {ultima && (
          <div key={ultima.id} className="fade-up mt-6">
            <AssistantAnswer consulta={ultima} onActualizada={actualizar} destacada />
          </div>
        )}
      </div>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <History className="h-5 w-5 text-ink-soft" aria-hidden="true" />
          Preguntas anteriores
        </h2>
        {!cargando && anteriores.length === 0 && (
          <p className="mt-2 text-sm text-ink-soft">Todavía no hay más preguntas en tu historial.</p>
        )}
        <div className="mt-4 space-y-4">
          {anteriores.map((c) => (
            <Reveal key={c.id}>
              <AssistantAnswer consulta={c} onActualizada={actualizar} />
            </Reveal>
          ))}
        </div>
        {historial.length < total && (
          <button type="button" className="btn-ghost mx-auto mt-6 flex" onClick={() => cargar(pagina + 1)} disabled={cargando}>
            {cargando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Ver más
          </button>
        )}
      </section>
      </div>
      )}
    </div>
  );
}
