import { Bot, History, Info, Loader2, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import AssistantAnswer from "../components/AssistantAnswer.jsx";
import { api } from "../lib/api.js";

const MAX = 500;
const PAGE_SIZE = 10;
const EJEMPLOS = [
  "¿Dónde puedo almorzar barato en Cabecera?",
  "Tengo un problema con el internet de mi casa, ¿dónde me ayudan?",
  "Necesito una ferretería en Piedecuesta",
  "Busco un veterinario para mi gato",
];

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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Bot className="h-7 w-7 text-brand-600" aria-hidden="true" />
        Asistente
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Cuéntale qué necesitas con tus palabras. Responde <strong>solo</strong> con negocios registrados en Easy Search,
        te muestra de dónde sacó cada dato y, si no encuentra información suficiente, te lo dice en lugar de inventar.
      </p>

      <form onSubmit={enviar} className="card mt-6 p-4">
        <label htmlFor="pregunta" className="sr-only">Tu pregunta</label>
        <textarea
          id="pregunta"
          ref={textareaRef}
          className="input min-h-24 resize-y"
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-ink-soft">{pregunta.length}/{MAX}</span>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            {enviando ? "Buscando en los negocios registrados…" : "Preguntar"}
          </button>
        </div>
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

      {ultima && (
        <div className="mt-6" aria-live="polite">
          <AssistantAnswer key={ultima.id} consulta={ultima} onActualizada={actualizar} destacada />
        </div>
      )}

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
            <AssistantAnswer key={c.id} consulta={c} onActualizada={actualizar} />
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
  );
}
