import { BadgeCheck, CheckCircle2, Clock, MapPin, Phone, Store, UserRound, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import LocationPicker, { insideMetro } from "../components/LocationPicker.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { normalizeText } from "../lib/format.js";

// Registrar un negocio que todavía no está en Easy Search. La solicitud llega al panel de administración;
// el administrador llama a la persona, verifica que maneja el negocio y lo aprueba: el negocio se crea
// verificado y a su nombre. El horario, los precios, los productos y las fotos se completan después en su panel.

const MAX_CATEGORIES = 3;
const EMPTY = {
  name: "", description: "", municipality_id: "", neighborhood: "", address: "",
  phone: "", whatsapp: "", email: "", website: "", instagram: "", facebook: "",
  applicant_role: "", applicant_position: "", contact_phone: "", message: "",
};

const STATUS = {
  pending: { label: "En revisión", icon: Clock, className: "bg-warn-bg text-warn" },
  approved: { label: "Aprobada", icon: CheckCircle2, className: "bg-open-bg text-open" },
  rejected: { label: "No aprobada", icon: XCircle, className: "bg-closed-bg text-closed" },
};

function Field({ id, label, hint, required, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label} {required && <span className="text-closed" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

function Section({ icon: Icon, title, hint, children }) {
  return (
    <section className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
          {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function MyRequests({ requests }) {
  if (!requests.length) return null;
  return (
    <section className="card p-5">
      <h2 className="mb-3 font-bold">Tus solicitudes de registro</h2>
      <ul className="divide-y divide-line">
        {requests.map((r) => {
          const st = STATUS[r.status] ?? STATUS.pending;
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                {r.establishment_slug
                  ? <Link to={`/lugar/${r.establishment_slug}`} className="font-semibold hover:underline">{r.establishment_name}</Link>
                  : <span className="font-semibold">{r.establishment_name}</span>}
                <p className="text-xs text-ink-soft">
                  Enviada el {new Date(r.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
                  {r.status === "rejected" && r.review_note && ` · ${r.review_note}`}
                </p>
              </div>
              <span className={`chip border-transparent ${st.className}`}>
                <st.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {st.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function RegisterBusinessPage() {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [categoryIds, setCategoryIds] = useState([]);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [location, setLocation] = useState(null);
  const [focus, setFocus] = useState(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [confirmData, setConfirmData] = useState(false);
  const [categories, setCategories] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      api.categories({ signal: ctrl.signal }),
      api.places({ kind: "municipio", limit: 20 }, { signal: ctrl.signal }),
      api.myClaims({ signal: ctrl.signal }),
    ])
      .then(([cats, places, claims]) => {
        setCategories(cats);
        setMunicipalities(places);
        setRequests(claims.filter((c) => c.kind === "register"));
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError("No pudimos cargar las categorías y los municipios. Recarga la página.");
      });
    return () => ctrl.abort();
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function chooseMunicipality(e) {
    const id = e.target.value;
    setForm((f) => ({ ...f, municipality_id: id }));
    const place = municipalities.find((m) => String(m.id) === id);
    if (place && !location) setFocus({ latitude: place.latitude, longitude: place.longitude, zoom: 14 });
  }

  function toggleCategory(id) {
    setCategoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id)
      : ids.length < MAX_CATEGORIES ? [...ids, id] : ids));
  }

  const shownCategories = useMemo(() => {
    const q = normalizeText(categoryQuery);
    const list = q ? categories.filter((c) => normalizeText(c.name).includes(q)) : categories;
    return list.filter((c) => !categoryIds.includes(c.id)).slice(0, 14);
  }, [categories, categoryQuery, categoryIds]);

  function problem() {
    if (form.name.trim().length < 2) return "Escribe el nombre del negocio.";
    if (!categoryIds.length) return "Elige al menos un tipo de negocio.";
    if (!form.municipality_id) return "Elige el municipio.";
    if (form.address.trim().length < 5) return "Escribe la dirección exacta.";
    if (!location) return "Marca en el mapa dónde queda el negocio.";
    if (!insideMetro(location)) return "El punto del mapa debe estar en el área metropolitana de Bucaramanga.";
    if (form.phone.trim().length < 7) return "Escribe el teléfono o WhatsApp del negocio.";
    if (!form.applicant_role) return "Cuéntanos si eres el dueño o el encargado.";
    if (form.contact_phone.trim().length < 7) return "Escribe un teléfono donde podamos llamarte para verificarte.";
    if (!acceptTerms) return "Debes autorizar el uso de los datos para enviar la solicitud.";
    if (!confirmData) return "Confirma que la información es correcta.";
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    const issue = problem();
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    setSending(true);
    const optional = (v) => v.trim() || null;
    try {
      const claim = await api.registerBusiness({
        business: {
          name: form.name.trim(), category_ids: categoryIds, municipality_id: Number(form.municipality_id),
          address: form.address.trim(), neighborhood: optional(form.neighborhood), description: optional(form.description),
          phone: form.phone.trim(), whatsapp: optional(form.whatsapp), email: optional(form.email),
          website: optional(form.website), instagram: optional(form.instagram), facebook: optional(form.facebook),
          latitude: location.latitude, longitude: location.longitude,
        },
        applicant_role: form.applicant_role, applicant_position: optional(form.applicant_position),
        contact_phone: form.contact_phone.trim(), message: optional(form.message), accept_terms: true,
      });
      setSent(claim);
      setRequests((list) => [claim, ...list]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  function startOver() {
    setForm(EMPTY);
    setCategoryIds([]);
    setLocation(null);
    setFocus(null);
    setAcceptTerms(false);
    setConfirmData(false);
    setSent(null);
  }

  const chosen = categories.filter((c) => categoryIds.includes(c.id));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Para negocios</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Registra tu negocio en Easy Search</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Es gratis. Te llamaremos para verificar que manejas el negocio y, cuando lo aprobemos, aparecerá en las
          búsquedas con el sello de verificado. Después completas el horario, los precios, los productos y las fotos
          desde tu panel.
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          ¿Tu negocio ya aparece en Easy Search? <Link to="/" className="font-semibold text-brand-700 hover:underline">Búscalo</Link>{" "}
          y pulsa “Solicitar administración” en su página.
        </p>
      </header>

      {sent ? (
        <section className="card space-y-3 p-6" aria-live="polite">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CheckCircle2 className="h-5 w-5 text-open" aria-hidden="true" />
            Recibimos tu solicitud
          </h2>
          <p className="text-sm text-ink-soft">
            Te llamaremos al <strong className="text-ink">{sent.contact_phone}</strong> para verificar que manejas{" "}
            <strong className="text-ink">{sent.establishment_name}</strong>. Cuando la aprobemos te llegará un correo a{" "}
            <strong className="text-ink">{user.email}</strong> con el enlace a tu panel.
          </p>
          <p className="text-sm text-ink-soft">
            Para agilizar la verificación, ten a mano el RUT o el certificado de cámara de comercio.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link to="/" className="btn-primary">Volver al inicio</Link>
            <button type="button" className="btn-ghost" onClick={startOver}>Registrar otro negocio</button>
          </div>
        </section>
      ) : (
        <form onSubmit={submit} className="space-y-6" noValidate>
          <Section icon={Store} title="Tu negocio" hint="Así lo encontrarán los clientes.">
            <Field id="reg-name" label="Nombre del negocio" required hint="Tal como lo conocen los clientes.">
              <input id="reg-name" className="input" maxLength={200} value={form.name} onChange={set("name")} placeholder="Ej.: Panadería La Espiga" />
            </Field>
            <div>
              <p className="mb-1 text-sm font-semibold">
                Tipo de negocio <span className="text-closed" aria-hidden="true">*</span>
                <span className="ml-1 font-normal text-ink-soft">(hasta {MAX_CATEGORIES})</span>
              </p>
              {chosen.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {chosen.map((c) => (
                    <button key={c.id} type="button" className="chip border-brand-200 bg-brand-50 text-brand-700" onClick={() => toggleCategory(c.id)} aria-label={`Quitar ${c.name}`}>
                      {c.name} ✕
                    </button>
                  ))}
                </div>
              )}
              <input
                id="reg-category-search"
                className="input"
                value={categoryQuery}
                onChange={(e) => setCategoryQuery(e.target.value)}
                placeholder="Busca el tipo: panadería, ferretería, veterinaria…"
                aria-label="Buscar tipo de negocio"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {shownCategories.map((c) => (
                  <button key={c.id} type="button" className="chip hover:border-brand-200" onClick={() => toggleCategory(c.id)} disabled={categoryIds.length >= MAX_CATEGORIES}>
                    {c.name}
                  </button>
                ))}
                {categories.length > 0 && shownCategories.length === 0 && categoryQuery && (
                  <p className="text-xs text-ink-soft">No encontramos ese tipo. Prueba con otra palabra o elige el más parecido.</p>
                )}
              </div>
            </div>
            <Field id="reg-description" label="Descripción corta" hint={`2 o 3 frases. ${form.description.length}/600`}>
              <textarea id="reg-description" rows={3} maxLength={600} className="input" value={form.description} onChange={set("description")}
                placeholder="Ej.: Panadería familiar desde 2004. Pan artesanal todos los días y tortas por encargo." />
            </Field>
          </Section>

          <Section icon={MapPin} title="Ubicación">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="reg-municipality" label="Municipio" required>
                <select id="reg-municipality" className="input" value={form.municipality_id} onChange={chooseMunicipality}>
                  <option value="">Elige uno</option>
                  {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field id="reg-neighborhood" label="Barrio">
                <input id="reg-neighborhood" className="input" maxLength={200} value={form.neighborhood} onChange={set("neighborhood")} placeholder="Ej.: Cabecera del Llano" />
              </Field>
            </div>
            <Field id="reg-address" label="Dirección exacta" required>
              <input id="reg-address" className="input" maxLength={300} value={form.address} onChange={set("address")} placeholder="Ej.: Carrera 27 # 45-12, local 3" />
            </Field>
            <div>
              <p className="mb-1 text-sm font-semibold">
                Punto en el mapa <span className="text-closed" aria-hidden="true">*</span>
              </p>
              <LocationPicker id="reg-map" value={location} onChange={setLocation} focus={focus} onFocus={setFocus} />
            </div>
          </Section>

          <Section icon={Phone} title="Contacto del negocio" hint="Estos datos se publican para que los clientes te contacten.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="reg-phone" label="Teléfono" required>
                <input id="reg-phone" className="input" inputMode="tel" maxLength={50} value={form.phone} onChange={set("phone")} placeholder="Ej.: 300 123 4567" />
              </Field>
              <Field id="reg-whatsapp" label="WhatsApp">
                <input id="reg-whatsapp" className="input" inputMode="tel" maxLength={50} value={form.whatsapp} onChange={set("whatsapp")} placeholder="Si es otro número" />
              </Field>
              <Field id="reg-email" label="Correo">
                <input id="reg-email" type="email" className="input" maxLength={255} value={form.email} onChange={set("email")} />
              </Field>
              <Field id="reg-instagram" label="Instagram">
                <input id="reg-instagram" className="input" maxLength={300} value={form.instagram} onChange={set("instagram")} placeholder="Ej.: @panaderialaespiga" />
              </Field>
              <Field id="reg-website" label="Página web" hint="Empieza por https://">
                <input id="reg-website" type="url" className="input" maxLength={300} value={form.website} onChange={set("website")} />
              </Field>
              <Field id="reg-facebook" label="Facebook" hint="Enlace completo (https://…)">
                <input id="reg-facebook" type="url" className="input" maxLength={300} value={form.facebook} onChange={set("facebook")} />
              </Field>
            </div>
          </Section>

          <Section icon={UserRound} title="Quién eres" hint="Lo usamos solo para verificarte. No se publica.">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">
                ¿Eres el dueño o el encargado? <span className="text-closed" aria-hidden="true">*</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {[["dueno", "Soy el dueño"], ["encargado", "Soy el encargado y puedo autorizar"]].map(([value, label]) => (
                  <label key={value} className={`chip cursor-pointer ${form.applicant_role === value ? "border-brand-400 bg-brand-50 text-brand-700" : ""}`}>
                    <input type="radio" name="applicant_role" value={value} className="accent-brand-600" checked={form.applicant_role === value} onChange={set("applicant_role")} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="reg-position" label="Tu cargo">
                <input id="reg-position" className="input" maxLength={100} value={form.applicant_position} onChange={set("applicant_position")} placeholder="Ej.: administradora" />
              </Field>
              <Field id="reg-contact" label="Teléfono para llamarte" required>
                <input id="reg-contact" className="input" inputMode="tel" autoComplete="tel" maxLength={25} value={form.contact_phone} onChange={set("contact_phone")} />
              </Field>
            </div>
            <Field id="reg-message" label="¿Algo que nos ayude a verificarte?">
              <textarea id="reg-message" rows={2} maxLength={1000} className="input" value={form.message} onChange={set("message")}
                placeholder="Ej.: Puedo enviar el RUT o la cámara de comercio. Llamar después de las 2 p. m." />
            </Field>
          </Section>

          <section className="card space-y-3 p-5 sm:p-6">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-brand-600" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
              <span>
                Autorizo a Easy Search a publicar los datos del negocio y a usarlos en las búsquedas y en las recomendaciones
                de su asistente con inteligencia artificial. Mis datos personales se usan solo para verificarme y no se
                publican (Ley 1581 de 2012). <span className="text-closed" aria-hidden="true">*</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-brand-600" checked={confirmData} onChange={(e) => setConfirmData(e.target.checked)} />
              <span>
                Confirmo que la información es correcta y sé que puedo pedir que la cambien o la retiren cuando quiera.{" "}
                <span className="text-closed" aria-hidden="true">*</span>
              </span>
            </label>
            {error && <p role="alert" className="rounded-xl bg-closed-bg p-3 text-sm text-closed">{error}</p>}
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={sending}>
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              {sending ? "Enviando…" : "Enviar solicitud"}
            </button>
          </section>
        </form>
      )}

      <MyRequests requests={requests} />
    </div>
  );
}
