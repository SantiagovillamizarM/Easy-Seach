import { BadgeCheck, CircleHelp, Clock3, Coins, EyeOff, MapPin, ShieldCheck } from "lucide-react";
import Reveal from "./Reveal.jsx";
import "./trust-panel.css";

function InfoRow({ icon: Icon, label, value, unknown = false, delay }) {
  return (
    <div className="trust-row" style={{ "--delay": delay }}>
      <Icon className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
      <span className="text-ink-soft">{label}</span>
      {unknown ? (
        <span className="trust-chip trust-chip-unknown"><CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />{value}</span>
      ) : (
        <span className="trust-chip"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />{value}</span>
      )}
    </div>
  );
}

function PrivacyMap() {
  return (
    <div className="trust-map">
      <svg viewBox="0 0 200 110" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <rect width="200" height="110" fill="#eef0fa" />
        <path d="M0 0h48l-6 30L0 46zm150 70 50-12v52h-44l-16-22z" fill="#cde9dc" />
        <path d="M-6 74 58 50l70 10 80-14M60-6l-8 40 12 30 20 52M140-8l-10 46-14 40 12 40" fill="none" stroke="#fff" strokeWidth="6" />
      </svg>
      <span className="trust-radius" />
      <span className="trust-pin"><MapPin className="h-4 w-4" aria-hidden="true" /></span>
      <span className="trust-forget"><EyeOff className="h-3.5 w-3.5" aria-hidden="true" />No se guarda</span>
    </div>
  );
}

const TILES = [
  {
    title: "Datos de cada lugar",
    text: "Te mostramos los horarios y precios que conocemos.",
    visual: (
      <div className="trust-card">
        <p className="trust-card-title">Opción A</p>
        <InfoRow icon={Clock3} label="Horario" value="11:00 – 15:00" delay="0.35s" />
        <InfoRow icon={Coins} label="Precio" value="Económico" delay="0.55s" />
      </div>
    ),
  },
  {
    title: "Si falta algo, te lo decimos",
    text: "Si no conocemos el precio o el horario de un lugar, lo marcamos en vez de inventarlo.",
    visual: (
      <div className="trust-card">
        <p className="trust-card-title">Opción B</p>
        <InfoRow icon={Clock3} label="Horario" value="Abierto ahora" delay="0.5s" />
        <InfoRow icon={Coins} label="Precio" value="Sin dato" unknown delay="0.7s" />
      </div>
    ),
  },
  {
    title: "Tu ubicación no se guarda",
    text: "Solo se usa para la búsqueda y los avisos de trancón.",
    visual: <PrivacyMap />,
  },
];

export default function TrustPanel() {
  return (
    <Reveal className="trust mt-4">
      <div className="flex items-start gap-3 sm:items-center">
        <span className="trust-badge"><ShieldCheck className="h-6 w-6" aria-hidden="true" /></span>
        <div>
          <h3 className="text-lg font-bold lg:text-xl">Información real, sin inventos</h3>
          <p className="mt-0.5 text-sm text-ink lg:text-base">Lo que sabemos de un lugar, lo mostramos; lo que no, te lo decimos. Y no guardamos dónde estás.</p>
        </div>
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-3 lg:mt-6 lg:gap-4">
        {TILES.map(({ title, text, visual }, i) => (
          <li key={title} className="trust-tile" style={{ "--i": i }}>
            <div className="trust-visual" aria-hidden="true">{visual}</div>
            <h4 className="mt-3 font-bold lg:mt-4 lg:text-lg">{title}</h4>
            <p className="mt-1 text-sm text-ink-soft lg:text-base">{text}</p>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
