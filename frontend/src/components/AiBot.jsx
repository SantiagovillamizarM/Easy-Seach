import { useEffect, useRef, useState } from "react";
import "./ai-bot.css";

// Mini robot de las respuestas de la IA (easter egg).
// - En reposo mira de izquierda a derecha, parpadea y "respira".
// - Al hacer clic se pone feliz: ojos "^ ^", sonrisa abierta, saltito y dos destellos; luego vuelve a mirar.
// - Se muestra como foto de perfil: un círculo con luz suave y el cuerpo recortado por el borde.
// - Con `thinking` mira hacia arriba y la antena brilla (mientras la IA prepara la respuesta).
// Todo es SVG + CSS (solo transform y opacity) para que la animación sea suave.
const HAPPY_MS = 1900;

export default function AiBot({ size = 30, thinking = false, className = "" }) {
  const [burst, setBurst] = useState(0); // cada clic reinicia la animación de alegría
  const [happy, setHappy] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  function cheer() {
    clearTimeout(timer.current);
    setBurst((n) => n + 1);
    setHappy(true);
    timer.current = setTimeout(() => setHappy(false), HAPPY_MS);
  }

  const state = happy ? "happy" : thinking ? "thinking" : "idle";

  return (
    <button
      type="button"
      className={`ai-bot ${className}`}
      data-state={state}
      style={{ "--bot-size": `${size}px` }}
      onClick={cheer}
      aria-label="Saludar al robot de Easy Search"
      title="¡Hola!"
    >
      <svg key={burst} viewBox="0 0 64 56" aria-hidden="true" className="ai-bot-svg">
        <g className="rb-bot">
          <g className="rb-head">
            <rect className="rb-hat" x="22" y="3.5" width="20" height="7" rx="2.2" />
            <rect className="rb-face" x="11" y="10" width="42" height="23" rx="5" />
            {/* Ojos normales (miran y parpadean) */}
            <g className="rb-eyes">
              <rect className="rb-eye" x="19.5" y="15.5" width="7" height="10" rx="2.4" />
              <rect className="rb-eye rb-eye-r" x="37.5" y="15.5" width="7" height="10" rx="2.4" />
            </g>
            {/* Expresión feliz: ojos "^ ^" y sonrisa abierta */}
            <path className="rb-happy-eye" d="M19.5 22.5q3.5-5.5 7 0" pathLength="1" />
            <path className="rb-happy-eye" d="M37.5 22.5q3.5-5.5 7 0" pathLength="1" />
            <path className="rb-mouth" d="M27 25.2h10q0 5.2-5 5.2t-5-5.2z" />
          </g>
          <rect className="rb-neck" x="26" y="33" width="12" height="3" rx="1" />
          <rect className="rb-body" x="5" y="36" width="54" height="16" rx="4.5" />
          <circle className="rb-light" cx="32" cy="44" r="2.4" />
        </g>
        {/* Destellos de alegría (dentro del círculo del avatar) */}
        <path className="rb-spark" d="M7 9l1.1 2.6L10.7 12.7 8.1 13.8 7 16.4 5.9 13.8 3.3 12.7 5.9 11.6z" />
        <path className="rb-spark rb-spark-2" d="M57 5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
      </svg>
    </button>
  );
}
