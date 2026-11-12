import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import { Notice, PanelField, SaveButton, useAction } from "./common.jsx";

const MAX_CATEGORIES = 10;
const TEXT_FIELDS = ["name", "description", "address", "neighborhood", "phone", "whatsapp", "email", "website", "instagram", "facebook"];

function fromEstablishment(est) {
  const form = {};
  for (const f of TEXT_FIELDS) form[f] = est[f] ?? "";
  form.price_min = est.price_min != null ? String(Number(est.price_min)) : "";
  form.price_max = est.price_max != null ? String(Number(est.price_max)) : "";
  form.category_ids = est.categories.map((c) => c.id).sort((a, b) => a - b);
  return form;
}

// "www.minegocio.com" -> "https://www.minegocio.com" (el servidor exige http:// o https://)
function withProtocol(url) {
  const v = url.trim();
  return v && !/^https?:\/\//i.test(v) ? `https://${v}` : v;
}

export default function InfoForm({ establishment, onSaved }) {
  const initial = useMemo(() => fromEstablishment(establishment), [establishment]);
  const [form, setForm] = useState(initial);
  const [categories, setCategories] = useState([]);
  const { state, run, fail } = useAction();

  useEffect(() => setForm(initial), [initial]);
  useEffect(() => {
    api.categories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function toggleCategory(id) {
    setForm((f) => {
      const has = f.category_ids.includes(id);
      if (!has && f.category_ids.length >= MAX_CATEGORIES) return f;
      const ids = has ? f.category_ids.filter((c) => c !== id) : [...f.category_ids, id];
      return { ...f, category_ids: ids.sort((a, b) => a - b) };
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (form.name.trim().length < 2) return fail("El nombre debe tener al menos 2 caracteres.");
    if (form.category_ids.length === 0) return fail("Elige al menos una categoría para que te encuentren.");
    const min = form.price_min === "" ? null : Number(form.price_min);
    const max = form.price_max === "" ? null : Number(form.price_max);
    if (min !== null && max !== null && min > max) return fail("El precio mínimo no puede ser mayor que el máximo.");

    const payload = {
      ...form,
      website: withProtocol(form.website),
      facebook: withProtocol(form.facebook),
      price_min: min,
      price_max: max,
    };
    const saved = await run(() => api.updateEstablishment(establishment.id, payload), "Información guardada. Ya se ve en tu perfil público.");
    if (saved) onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="card space-y-4 p-5">
        <h2 className="font-bold">Datos generales</h2>
        <PanelField id="info-name" label="Nombre del negocio" required maxLength={200} value={form.name} onChange={set("name")} />
        <PanelField
          id="info-description"
          label="Descripción"
          multiline
          rows={5}
          maxLength={3000}
          value={form.description}
          onChange={set("description")}
          hint={`Cuenta qué ofreces, qué te hace especial y para quién es. Esto ayuda a que la búsqueda inteligente te encuentre. (${form.description.length}/3000)`}
        />
        <div>
          <p className="mb-1.5 text-sm font-semibold">Categorías <span className="font-normal text-ink-soft">({form.category_ids.length}/{MAX_CATEGORIES})</span></p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = form.category_ids.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleCategory(c.id)}
                  className={`chip cursor-pointer ${active ? "border-brand-600 bg-brand-600 text-white" : "hover:border-brand-200"}`}
                >
                  {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-bold sm:col-span-2">Ubicación y precios</h2>
        <PanelField id="info-address" label="Dirección" maxLength={300} value={form.address} onChange={set("address")} placeholder="Ej: Calle 35 # 27-40" />
        <PanelField id="info-neighborhood" label="Barrio" maxLength={200} value={form.neighborhood} onChange={set("neighborhood")} />
        <PanelField id="info-price-min" label="Precio desde (COP)" type="number" min={0} step={100} inputMode="numeric" value={form.price_min} onChange={set("price_min")} hint="El producto o servicio más económico." />
        <PanelField id="info-price-max" label="Precio hasta (COP)" type="number" min={0} step={100} inputMode="numeric" value={form.price_max} onChange={set("price_max")} hint="Déjalo vacío si no aplica." />
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-bold sm:col-span-2">Contacto y redes</h2>
        <PanelField id="info-phone" label="Teléfono" type="tel" autoComplete="off" maxLength={50} value={form.phone} onChange={set("phone")} placeholder="607 123 4567" />
        <PanelField id="info-whatsapp" label="WhatsApp" type="tel" autoComplete="off" maxLength={50} value={form.whatsapp} onChange={set("whatsapp")} placeholder="300 123 4567" />
        <PanelField id="info-email" label="Correo del negocio" type="email" autoComplete="off" maxLength={255} value={form.email} onChange={set("email")} />
        <PanelField id="info-website" label="Sitio web" maxLength={300} value={form.website} onChange={set("website")} placeholder="www.minegocio.com" />
        <PanelField id="info-instagram" label="Instagram" maxLength={300} value={form.instagram} onChange={set("instagram")} placeholder="@minegocio" />
        <PanelField id="info-facebook" label="Facebook" maxLength={300} value={form.facebook} onChange={set("facebook")} placeholder="facebook.com/minegocio" />
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <SaveButton loading={state.loading} disabled={!dirty} />
        {dirty && !state.loading && (
          <button type="button" className="btn-ghost" onClick={() => setForm(initial)}>Descartar</button>
        )}
        <div className="min-w-0 flex-1"><Notice ok={!dirty ? state.ok : null} error={state.error} /></div>
      </div>
    </form>
  );
}
