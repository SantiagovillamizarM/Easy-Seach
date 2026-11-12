import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-3 text-xl font-bold">No encontramos esta página</h1>
      <p className="mt-2 text-ink-soft">Puede que el enlace esté mal escrito o que la página ya no exista.</p>
      <Link to="/" className="btn-primary mt-6">Ir al inicio</Link>
    </div>
  );
}
