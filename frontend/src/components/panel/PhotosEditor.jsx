import { ImagePlus, ShieldCheck, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../lib/api.js";
import { Notice, PanelField, SaveButton, useAction } from "./common.jsx";

const MAX_PHOTOS = 10;
const MAX_MB = 5;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export default function PhotosEditor({ establishment, onSaved }) {
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const inputRef = useRef(null);
  const { state, run, fail } = useAction();
  const photos = establishment.photos;
  const full = photos.length >= MAX_PHOTOS;

  function pick(e) {
    const chosen = e.target.files?.[0] ?? null;
    if (chosen && !ACCEPTED.includes(chosen.type)) {
      e.target.value = "";
      return fail("Formato no permitido. Usa fotos JPG, PNG o WebP.");
    }
    if (chosen && chosen.size > MAX_MB * 1024 * 1024) {
      e.target.value = "";
      return fail(`La foto pesa más de ${MAX_MB} MB. Prueba con una más liviana.`);
    }
    setFile(chosen);
  }

  async function upload(e) {
    e.preventDefault();
    if (!file) return fail("Elige una foto primero.");
    const saved = await run(() => api.uploadPhoto(establishment.id, file, caption.trim()), "Foto publicada.");
    if (saved) {
      setFile(null);
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
      onSaved();
    }
  }

  async function remove(photo) {
    if (!window.confirm("¿Eliminar esta foto? Esta acción no se puede deshacer.")) return;
    if ((await run(() => api.deletePhoto(establishment.id, photo.id), "Foto eliminada.")) !== undefined) onSaved();
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Fotos</h2>
        <span className="text-sm text-ink-soft">{photos.length} de {MAX_PHOTOS}</span>
      </div>

      {photos.length === 0 ? (
        <p className="mb-4 rounded-xl bg-slate-50 p-4 text-sm text-ink-soft">
          Los perfiles con fotos generan más confianza. Sube la fachada, tus productos o el interior del local.
        </p>
      ) : (
        <ul className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p, i) => (
            <li key={p.id} className="group relative overflow-hidden rounded-xl border border-line">
              <img src={p.url} alt={p.caption ?? `Foto ${i + 1}`} loading="lazy" className="aspect-square w-full object-cover" />
              {i === 0 && <span className="chip absolute left-2 top-2 border-transparent bg-white/90 py-0.5 text-xs">Principal</span>}
              <button
                type="button"
                onClick={() => remove(p)}
                className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 text-closed shadow-sm hover:bg-white"
                aria-label={`Eliminar foto ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
              {p.caption && <p className="truncate px-2 py-1.5 text-xs text-ink-soft">{p.caption}</p>}
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="text-sm text-ink-soft">Llegaste al máximo de {MAX_PHOTOS} fotos. Elimina alguna para subir otra.</p>
      ) : (
        <form onSubmit={upload} className="grid gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-2">
          <div>
            <label htmlFor="photo-file" className="mb-1.5 block text-sm font-semibold">Foto</label>
            <input
              ref={inputRef}
              id="photo-file"
              type="file"
              accept={ACCEPTED.join(",")}
              onChange={pick}
              className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700"
            />
            <p className="mt-1 text-xs text-ink-soft">JPG, PNG o WebP, hasta {MAX_MB} MB.</p>
          </div>
          <PanelField id="photo-caption" label="Descripción (opcional)" maxLength={200} placeholder="Ej: Fachada del local" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <SaveButton loading={state.loading} disabled={!file}>
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              Subir foto
            </SaveButton>
            <p className="flex items-center gap-1.5 text-xs text-ink-soft">
              <ShieldCheck className="h-4 w-4 text-open" aria-hidden="true" />
              Quitamos la ubicación GPS y los datos ocultos de la foto antes de publicarla.
            </p>
          </div>
        </form>
      )}
      <div className="mt-3"><Notice ok={state.ok} error={state.error} /></div>
    </section>
  );
}
