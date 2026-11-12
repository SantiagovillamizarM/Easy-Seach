import { BadgeCheck, Clock, Store, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

// Tarjeta "¿Eres el dueño?" en el detalle de un establecimiento.
export default function OwnerClaimCard({ establishment }) {
  const { user } = useAuth();
  const location = useLocation();
  const [claim, setClaim] = useState(undefined); // undefined = cargando
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ message: "", contact_phone: "" });
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const isOwner = user && establishment.owner_id === user.id;
  const hasOtherOwner = establishment.owner_id && !isOwner;

  useEffect(() => {
    if (!user || establishment.owner_id) {
      setClaim(null);
      return;
    }
    api
      .myClaims()
      .then((claims) => setClaim(claims.find((c) => c.establishment_id === establishment.id) ?? null))
      .catch(() => setClaim(null));
  }, [user, establishment.id, establishment.owner_id]);

  if (hasOtherOwner) return null; // el perfil ya lo administra su propietario (se ve el sello "Verificado")

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (form.message.trim().length < 20) {
      setError("Cuéntanos un poco más (mínimo 20 caracteres) para poder verificarte.");
      return;
    }
    setSending(true);
    try {
      setClaim(await api.createClaim(establishment.id, { message: form.message.trim(), contact_phone: form.contact_phone.trim() }));
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
        <Store className="h-4 w-4 text-brand-600" aria-hidden="true" />
        {isOwner ? "Tu negocio" : "¿Eres el dueño de este negocio?"}
      </h2>

      {isOwner && (
        <>
          <p className="text-sm text-ink-soft">Mantén actualizada la información, el horario, los precios y las fotos.</p>
          <Link to={`/panel/lugar/${establishment.id}`} className="btn-primary mt-3 w-full">Administrar este negocio</Link>
        </>
      )}

      {!isOwner && !user && (
        <p className="text-sm text-ink-soft">
          <Link to={`/ingresar?next=${encodeURIComponent(location.pathname)}`} className="font-semibold text-brand-700 hover:underline">
            Inicia sesión
          </Link>{" "}
          para solicitar la administración del perfil y mantener tu información al día.
        </p>
      )}

      {!isOwner && user && claim?.status === "pending" && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Tu solicitud está en revisión. Te contactaremos al {claim.contact_phone} para verificarla.
        </p>
      )}

      {!isOwner && user && claim?.status === "rejected" && !open && (
        <div className="space-y-2">
          <p className="flex items-start gap-2 rounded-xl bg-closed-bg p-3 text-sm text-closed">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Tu solicitud anterior no fue aprobada: {claim.review_note}
          </p>
          <button type="button" className="btn-ghost w-full" onClick={() => setOpen(true)}>Enviar una nueva solicitud</button>
        </div>
      )}

      {!isOwner && user && claim === null && !open && (
        <>
          <p className="text-sm text-ink-soft">
            Administra este perfil gratis: actualiza horarios, precios, productos y fotos, y obtén el sello de verificado.
          </p>
          <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setOpen(true)}>
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            Solicitar administración
          </button>
        </>
      )}

      {!isOwner && user && open && (
        <form onSubmit={submit} className="mt-2 space-y-3">
          <div>
            <label htmlFor="claim-message" className="mb-1 block text-sm font-semibold">¿Cómo podemos verificar que eres el propietario?</label>
            <textarea
              id="claim-message"
              rows={3}
              maxLength={1000}
              className="input"
              placeholder="Ej: Soy el dueño desde 2019. Puedo enviar el RUT o la cámara de comercio."
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="claim-phone" className="mb-1 block text-sm font-semibold">Teléfono de contacto</label>
            <input
              id="claim-phone"
              className="input"
              inputMode="tel"
              autoComplete="tel"
              maxLength={25}
              value={form.contact_phone}
              onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
            />
          </div>
          {error && <p role="alert" className="text-sm text-closed">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1" disabled={sending}>Enviar solicitud</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  );
}
