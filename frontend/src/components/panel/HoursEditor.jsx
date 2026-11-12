import { CalendarPlus, Copy, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import { DAYS, formatTime } from "../../lib/format.js";
import { Notice, PanelField, SaveButton, useAction } from "./common.jsx";

// Cada día: { mode: "closed" | "open" | "24h", ranges: [{ opens: "08:00", closes: "18:00" }] }
const hhmm = (t) => t.slice(0, 5);

function fromSlots(slots) {
  return DAYS.map((_, day) => {
    const own = slots.filter((s) => s.day_of_week === day).sort((a, b) => a.opens_at.localeCompare(b.opens_at));
    if (own.length === 0) return { mode: "closed", ranges: [{ opens: "08:00", closes: "18:00" }] };
    if (own.length === 1 && hhmm(own[0].opens_at) === "00:00" && hhmm(own[0].closes_at) === "00:00") {
      return { mode: "24h", ranges: [{ opens: "08:00", closes: "18:00" }] };
    }
    return { mode: "open", ranges: own.map((s) => ({ opens: hhmm(s.opens_at), closes: hhmm(s.closes_at) })) };
  });
}

function toSlots(days) {
  return days.flatMap((d, day) => {
    if (d.mode === "closed") return [];
    if (d.mode === "24h") return [{ day_of_week: day, opens_at: "00:00", closes_at: "00:00" }];
    return d.ranges.map((r) => ({ day_of_week: day, opens_at: r.opens, closes_at: r.closes }));
  });
}

function validate(days) {
  for (const [i, d] of days.entries()) {
    if (d.mode !== "open") continue;
    for (const r of d.ranges) {
      if (!r.opens || !r.closes) return `${DAYS[i]}: completa la hora de apertura y de cierre.`;
      if (r.opens === r.closes) return `${DAYS[i]}: la apertura y el cierre no pueden ser iguales (usa “24 horas”).`;
    }
  }
  return null;
}

function WeeklyHours({ establishment, onSaved }) {
  const initial = useMemo(() => fromSlots(establishment.opening_hours), [establishment]);
  const [days, setDays] = useState(initial);
  const { state, run, fail } = useAction();

  useEffect(() => setDays(initial), [initial]);
  const dirty = JSON.stringify(days) !== JSON.stringify(initial);

  const updateDay = (index, fn) => setDays((all) => all.map((d, i) => (i === index ? fn(d) : d)));
  const updateRange = (day, ri, field, value) =>
    updateDay(day, (d) => ({ ...d, ranges: d.ranges.map((r, j) => (j === ri ? { ...r, [field]: value } : r)) }));

  // Atajo: copiar el horario del lunes a martes-viernes
  const copyMondayToWeekdays = () =>
    setDays((all) => all.map((d, i) => (i >= 1 && i <= 4 ? structuredClone(all[0]) : d)));

  async function submit(e) {
    e.preventDefault();
    const problem = validate(days);
    if (problem) return fail(problem);
    const saved = await run(() => api.replaceHours(establishment.id, toSlots(days)), "Horario guardado y marcado como confirmado.");
    if (saved) onSaved();
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">Horario semanal</h2>
          <p className="text-xs text-ink-soft">Si cierras después de medianoche, pon la hora real de cierre (ej. 2:00 a. m.).</p>
        </div>
        <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={copyMondayToWeekdays}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copiar lunes a martes–viernes
        </button>
      </div>

      <ul className="divide-y divide-line">
        {days.map((d, i) => (
          <li key={DAYS[i]} className="grid gap-2 py-3 sm:grid-cols-[110px_150px_1fr] sm:items-start">
            <span className="pt-2 text-sm font-semibold" id={`day-${i}`}>{DAYS[i]}</span>
            <select
              aria-labelledby={`day-${i}`}
              className="input py-2"
              value={d.mode}
              onChange={(e) => updateDay(i, (cur) => ({ ...cur, mode: e.target.value }))}
            >
              <option value="open">Abierto</option>
              <option value="closed">Cerrado</option>
              <option value="24h">24 horas</option>
            </select>
            {d.mode === "open" ? (
              <div className="space-y-2">
                {d.ranges.map((r, ri) => (
                  <div key={ri} className="flex items-center gap-2">
                    <input type="time" className="input py-2" aria-label={`${DAYS[i]}: abre`} value={r.opens} onChange={(e) => updateRange(i, ri, "opens", e.target.value)} />
                    <span className="text-ink-soft" aria-hidden="true">–</span>
                    <input type="time" className="input py-2" aria-label={`${DAYS[i]}: cierra`} value={r.closes} onChange={(e) => updateRange(i, ri, "closes", e.target.value)} />
                    {d.ranges.length > 1 && (
                      <button
                        type="button"
                        className="rounded-lg p-2 text-ink-soft hover:bg-closed-bg hover:text-closed"
                        aria-label={`Quitar franja de ${DAYS[i]}`}
                        onClick={() => updateDay(i, (cur) => ({ ...cur, ranges: cur.ranges.filter((_, j) => j !== ri) }))}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
                {d.ranges.length < 4 && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                    onClick={() => updateDay(i, (cur) => ({ ...cur, ranges: [...cur.ranges, { opens: "14:00", closes: "18:00" }] }))}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Agregar franja (ej. jornada partida)
                  </button>
                )}
              </div>
            ) : (
              <span className="pt-2 text-sm text-ink-soft">{d.mode === "closed" ? "No abre este día" : "Abierto todo el día"}</span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SaveButton
          loading={state.loading}
          disabled={!dirty && (Boolean(establishment.hours_verified_at) || establishment.opening_hours.length === 0)}
        >
          {establishment.hours_verified_at || dirty ? "Guardar horario" : "Confirmar este horario"}
        </SaveButton>
        {dirty && <button type="button" className="btn-ghost" onClick={() => setDays(initial)}>Descartar</button>}
        <div className="min-w-0 flex-1"><Notice ok={!dirty ? state.ok : null} error={state.error} /></div>
      </div>
      {!establishment.hours_verified_at && establishment.opening_hours.length > 0 && !dirty && (
        <p className="mt-3 text-xs text-ink-soft">Este horario viene de OpenStreetMap. Si es correcto, confírmalo para que tus clientes confíen en él.</p>
      )}
    </form>
  );
}

const EMPTY_SPECIAL = { date: "", is_closed: true, opens_at: "09:00", closes_at: "13:00", note: "" };

function SpecialHours({ establishment, onSaved }) {
  const [form, setForm] = useState(EMPTY_SPECIAL);
  const [open, setOpen] = useState(false);
  const { state, run, fail } = useAction();
  const today = new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

  async function submit(e) {
    e.preventDefault();
    if (!form.date) return fail("Elige la fecha.");
    if (!form.is_closed && form.opens_at === form.closes_at) return fail("La apertura y el cierre no pueden ser iguales.");
    const payload = {
      date: form.date,
      is_closed: form.is_closed,
      opens_at: form.is_closed ? null : form.opens_at,
      closes_at: form.is_closed ? null : form.closes_at,
      note: form.note.trim() || null,
    };
    const saved = await run(() => api.addSpecialHours(establishment.id, payload), "Horario especial agregado.");
    if (saved) {
      setForm(EMPTY_SPECIAL);
      setOpen(false);
      onSaved();
    }
  }

  async function remove(s) {
    if (!window.confirm("¿Eliminar este horario especial?")) return;
    const done = await run(() => api.deleteSpecialHours(establishment.id, s.id), "Horario especial eliminado.");
    if (done !== undefined) onSaved();
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">Festivos y fechas especiales</h2>
          <p className="text-xs text-ink-soft">Días en los que cierras o tienes un horario diferente al habitual.</p>
        </div>
        {!open && (
          <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => setOpen(true)}>
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            Agregar fecha
          </button>
        )}
      </div>

      {establishment.special_hours.length === 0 && !open && (
        <p className="text-sm text-ink-soft">No hay fechas especiales próximas.</p>
      )}
      {establishment.special_hours.length > 0 && (
        <ul className="divide-y divide-line">
          {establishment.special_hours.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span>
                <strong className="font-semibold">
                  {new Date(`${s.date}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
                </strong>
                {s.note && <span className="text-ink-soft"> · {s.note}</span>}
              </span>
              <span className="flex items-center gap-2">
                {s.is_closed ? "Cerrado" : `${formatTime(s.opens_at)} – ${formatTime(s.closes_at)}`}
                <button type="button" className="rounded-lg p-1.5 text-ink-soft hover:bg-closed-bg hover:text-closed" aria-label="Eliminar fecha especial" onClick={() => remove(s)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2">
          <PanelField id="special-date" label="Fecha" type="date" min={today} required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <PanelField id="special-note" label="Motivo (opcional)" maxLength={200} placeholder="Ej: Festivo, inventario" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.is_closed} onChange={(e) => setForm((f) => ({ ...f, is_closed: e.target.checked }))} />
            Cerrado todo el día
          </label>
          {!form.is_closed && (
            <>
              <PanelField id="special-opens" label="Abre" type="time" required value={form.opens_at} onChange={(e) => setForm((f) => ({ ...f, opens_at: e.target.value }))} />
              <PanelField id="special-closes" label="Cierra" type="time" required value={form.closes_at} onChange={(e) => setForm((f) => ({ ...f, closes_at: e.target.value }))} />
            </>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <SaveButton loading={state.loading}>Agregar</SaveButton>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </form>
      )}
      <div className="mt-3"><Notice ok={state.ok} error={state.error} /></div>
    </section>
  );
}

export default function HoursEditor({ establishment, onSaved }) {
  return (
    <div className="space-y-6">
      <WeeklyHours establishment={establishment} onSaved={onSaved} />
      <SpecialHours establishment={establishment} onSaved={onSaved} />
    </div>
  );
}
