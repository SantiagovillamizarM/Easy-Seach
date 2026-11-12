import { Link } from "react-router-dom";

// Marca: una lupa cuyo mango es un destello (búsqueda + inteligencia).
export function LogoMark({ className = "h-8 w-8" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="es-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b84ff" />
          <stop offset="1" stopColor="#3b31b8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#es-g)" />
      <circle cx="14" cy="14" r="6.5" fill="none" stroke="white" strokeWidth="2.6" />
      <path d="M19 19l5.5 5.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24 6.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#a7f3d0" />
    </svg>
  );
}

export default function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-lg" aria-label="Easy Search, ir al inicio">
      <LogoMark />
      <span className="text-lg font-extrabold tracking-tight">
        Easy<span className="text-brand-600">Search</span>
      </span>
    </Link>
  );
}
