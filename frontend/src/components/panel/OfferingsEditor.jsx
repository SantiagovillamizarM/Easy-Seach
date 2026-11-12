import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api.js";
import { formatPrice } from "../../lib/format.js";
import { Notice, PanelField, SaveButton, useAction } from "./common.jsx";

const EMPTY = { kind: "product", name: "", description: "", price: "", is_available: true };

function OfferingForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...initial,
    description: initial?.description ?? "",
    price: initial?.price != null ? String(Number(initial.price)) : "",
  }));
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const idp = initial?.id ?? "new";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          kind: form.kind,
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: form.price === "" ? null : Number(form.price),
          is_available: form.is_available,
        });
      }}
      className="grid gap-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4 sm:grid-cols-2"
    >
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-semibold">Tipo</legend>
        <div className="flex gap-4 text-sm">
          {[
            ["product", "Producto"],
            ["service", "Servicio"],
          ].map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5">
              <input type="radio" name={`kind-${idp}`} className="accent-brand-600" checked={form.kind === value} onChange={() => setForm((f) => ({ ...f, kind: value }))} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <PanelField id={`off-name-${idp}`} label="Nombre" required minLength={2} maxLength={200} value={form.name} onChange={set("name")} placeholder="Ej: Hamburguesa sencilla" />
      <PanelField id={`off-price-${idp}`} label="Precio (COP)" type="number" min={0} step={100} inputMode="numeric" value={form.price} onChange={set("price")} hint="Déjalo vacío si el precio varía." />
      <PanelField id={`off-desc-${idp}`} className="sm:col-span-2" label="Descripción (opcional)" multiline rows={2} maxLength={1000} value={form.description} onChange={set("description")} />
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.is_available} onChange={(e) => setForm((f) => ({ ...f, is_available: e.target.checked }))} />
        Disponible (se muestra en tu perfil)
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <SaveButton loading={loading}>{initial ? "Guardar" : "Agregar"}</SaveButton>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export default function OfferingsEditor({ establishment, onSaved }) {
  const [editing, setEditing] = useState(null); // null | "new" | id del producto
  const { state, run } = useAction();
  const offerings = establishment.offerings;

  async function create(data) {
    if (await run(() => api.addOffering(establishment.id, data), `“${data.name}” agregado.`)) {
      setEditing(null);
      onSaved();
    }
  }

  async function update(id, data, message) {
    if (await run(() => api.updateOffering(id, data), message)) {
      setEditing(null);
      onSaved();
    }
  }

  async function remove(o) {
    if (!window.confirm(`¿Eliminar “${o.name}”? Esta acción no se puede deshacer.`)) return;
    if ((await run(() => api.deleteOffering(o.id), `“${o.name}” eliminado.`)) !== undefined) onSaved();
  }

  const groups = [
    { title: "Productos", items: offerings.filter((o) => o.kind === "product") },
    { title: "Servicios", items: offerings.filter((o) => o.kind === "service") },
  ].filter((g) => g.items.length > 0);

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">Productos y servicios</h2>
          <p className="text-xs text-ink-soft">Lo que agregues aquí también se usa para encontrarte (ej. “dónde venden empanadas”).</p>
        </div>
        {editing !== "new" && (
          <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar
          </button>
        )}
      </div>

      <div className="mb-3"><Notice ok={state.ok} error={state.error} /></div>

      {editing === "new" && (
        <div className="mb-4">
          <OfferingForm onSubmit={create} onCancel={() => setEditing(null)} loading={state.loading} />
        </div>
      )}

      {offerings.length === 0 && editing !== "new" && (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-ink-soft">
          Aún no tienes productos ni servicios. Agrega los más populares con su precio: es lo que más buscan tus clientes.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.title} className="mb-4 last:mb-0">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">{group.title}</h3>
          <ul className="divide-y divide-line">
            {group.items.map((o) =>
              editing === o.id ? (
                <li key={o.id} className="py-3">
                  <OfferingForm initial={o} onSubmit={(data) => update(o.id, data, "Cambios guardados.")} onCancel={() => setEditing(null)} loading={state.loading} />
                </li>
              ) : (
                <li key={o.id} className={`flex flex-wrap items-start justify-between gap-3 py-3 ${o.is_available ? "" : "opacity-60"}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {o.name}
                      {!o.is_available && <span className="chip ml-2 py-0 text-xs">Oculto</span>}
                    </p>
                    {o.description && <p className="text-xs text-ink-soft">{o.description}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="mr-2 text-sm font-semibold">
                      {formatPrice(o.price) ?? <span className="font-normal italic text-ink-soft">Sin precio</span>}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-ink-soft hover:bg-brand-50 hover:text-ink"
                      aria-label={o.is_available ? `Ocultar ${o.name}` : `Mostrar ${o.name}`}
                      title={o.is_available ? "Ocultar (agotado o temporal)" : "Volver a mostrar"}
                      onClick={() => update(o.id, { is_available: !o.is_available }, o.is_available ? `“${o.name}” oculto.` : `“${o.name}” visible de nuevo.`)}
                    >
                      {o.is_available ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                    <button type="button" className="rounded-lg p-2 text-ink-soft hover:bg-brand-50 hover:text-ink" aria-label={`Editar ${o.name}`} onClick={() => setEditing(o.id)}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" className="rounded-lg p-2 text-ink-soft hover:bg-closed-bg hover:text-closed" aria-label={`Eliminar ${o.name}`} onClick={() => remove(o)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
    </section>
  );
}
