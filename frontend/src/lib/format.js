// Utilidades de formato para mostrar datos al usuario.

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function formatPrice(value) {
  if (value === null || value === undefined || value === "") return null;
  return cop.format(Number(value));
}

/** "$15.000 – $35.000", "Desde $15.000", "$$" o null si no hay información. */
export function formatPriceRange(min, max, level) {
  const a = formatPrice(min);
  const b = formatPrice(max);
  if (a && b) return a === b ? a : `${a} – ${b}`;
  if (a) return `Desde ${a}`;
  if (b) return `Hasta ${b}`;
  if (level) return "$".repeat(level);
  return null;
}

export function formatDistance(km) {
  if (km === null || km === undefined) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0).replace(".", ",")} km`;
}

export const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** "14:30:00" -> "2:30 p. m." */
export function formatTime(value) {
  const [h, m] = value.split(":").map(Number);
  const suffix = h < 12 ? "a. m." : "p. m.";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Agrupa las franjas por día: [{ day: "Lunes", ranges: ["8:00 a. m. – 6:00 p. m."] }, ...] */
export function weeklySchedule(slots) {
  return DAYS.map((day, index) => {
    const ranges = slots
      .filter((s) => s.day_of_week === index)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
      .map((s) =>
        s.opens_at === s.closes_at && s.opens_at.startsWith("00:00")
          ? "Abierto 24 horas"
          : `${formatTime(s.opens_at)} – ${formatTime(s.closes_at)}`,
      );
    return { day, index, ranges };
  });
}

/** Normaliza un teléfono colombiano para enlaces wa.me (solo dígitos, con indicativo 57). */
export function whatsappNumber(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  if (digits.length >= 11) return digits;
  return null;
}

/** "@usuario" o URL -> URL de Instagram */
export function instagramUrl(raw) {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://www.instagram.com/${raw.replace(/^@/, "").trim()}`;
}

export function safeExternalUrl(raw) {
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : null;
}
