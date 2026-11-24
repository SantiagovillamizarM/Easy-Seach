import { useEffect, useState } from "react";
import AiBot from "./AiBot.jsx";
import { Calificar, EstadoBadge, Fuentes, formatSimilitud } from "./AssistantAnswer.jsx";

// Mensajes del chat del asistente (estilo Discord/WhatsApp): los del usuario a la derecha y los del
// asistente a la izquierda con su foto de perfil (el robot). La respuesta recién llegada se escribe sola
// y, mientras tanto, el robot mueve la boca; al terminar aparecen los pasos, las fuentes y la calificación.

const hora = (iso) => new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Escribe el texto poco a poco (unos 140 caracteres por segundo). Sin animación muestra todo de una vez.
function useTyping(text, animate) {
  const [count, setCount] = useState(() => (animate && !reducedMotion() ? 0 : text.length));
  const done = count >= text.length;
  useEffect(() => {
    if (done) return undefined;
    const timer = setTimeout(() => setCount((n) => Math.min(text.length, n + 2)), 14);
    return () => clearTimeout(timer);
  }, [count, done, text.length]);
  return { shown: text.slice(0, count), done };
}

// Mientras la respuesta crece, la conversación sigue pegada abajo (solo si la persona ya estaba abajo)
function keepAtBottom() {
  const el = document.scrollingElement;
  if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 260) el.scrollTop = el.scrollHeight;
}

export function UserMessage({ texto, creadaEn }) {
  return (
    <div className="chat-row chat-row-user">
      <div className="chat-bubble chat-bubble-user">
        <p>{texto}</p>
        <span className="chat-time">{creadaEn ? hora(creadaEn) : "Enviando…"}</span>
      </div>
    </div>
  );
}

function AiRow({ talking = false, thinking = false, creadaEn, estado, children }) {
  return (
    <div className="chat-row chat-row-ai">
      <AiBot size={36} talking={talking} thinking={thinking} className="chat-avatar" label="Saludar al asistente" />
      <div className="chat-ai-body">
        <p className="chat-meta">
          <span className="chat-name">Asistente</span>
          {creadaEn && <span className="chat-time">{hora(creadaEn)}</span>}
          {estado && estado !== "RESPONDIDA" && <EstadoBadge estado={estado} />}
        </p>
        <div className="chat-bubble chat-bubble-ai">{children}</div>
      </div>
    </div>
  );
}

/** Respuesta del asistente a una consulta. `animate`: es la que acaba de llegar (se escribe sola). */
export function AiMessage({ consulta, animate = false, onActualizada }) {
  const r = consulta.respuesta;
  const texto =
    consulta.estado === "ERROR"
      ? `${consulta.detalleError || "El asistente no está disponible en este momento."} Intenta de nuevo en unos minutos.`
      : r?.texto || "";
  const typing = useTyping(texto, animate);

  useEffect(() => {
    if (animate) keepAtBottom();
  }, [animate, typing.shown]);

  return (
    <AiRow talking={!typing.done} creadaEn={consulta.creadaEn} estado={consulta.estado}>
      {/* El lector de pantalla recibe el texto completo de una vez; la escritura animada es solo visual */}
      <p className="sr-only">{texto}</p>
      <p aria-hidden="true" className={consulta.estado === "ERROR" ? "text-closed" : undefined}>
        {typing.shown}
        {!typing.done && <span className="assistant-caret" />}
      </p>

      {typing.done && r && (
        <div className="chat-extra">
          {consulta.estado === "SIN_RESULTADOS" && (
            <p className="mt-2 text-xs text-ink-soft">
              Ningún negocio registrado respondía tu pregunta con suficiente similitud
              {consulta.mejorSimilitud != null &&
                ` (la más alta fue ${formatSimilitud(consulta.mejorSimilitud)}; el mínimo es ${formatSimilitud(consulta.umbral)})`}
              . Preferimos decírtelo antes que inventar una respuesta.
            </p>
          )}
          {r.pasos.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Pasos recomendados</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
                {r.pasos.map((paso, i) => <li key={i}>{paso}</li>)}
              </ol>
            </div>
          )}
          {r.fuentes.length > 0 && <Fuentes fuentes={r.fuentes} umbral={consulta.umbral} />}
          {onActualizada && !consulta.local && <Calificar key={consulta.id} consulta={consulta} onActualizada={onActualizada} />}
        </div>
      )}
    </AiRow>
  );
}

/** "Escribiendo…": el asistente está buscando en los negocios registrados. */
export function AiTyping() {
  return (
    <AiRow thinking>
      <span className="chat-typing" role="status">
        <span className="sr-only">El asistente está buscando en los negocios registrados…</span>
        <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
      </span>
    </AiRow>
  );
}
