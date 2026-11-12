import { Clock } from "lucide-react";

const STYLES = {
  open: "bg-open-bg text-open",
  closed: "bg-closed-bg text-closed",
  unknown: "bg-slate-100 text-ink-soft",
};

export default function HoursBadge({ status, className = "" }) {
  if (!status) return null;
  const unverified = status.state !== "unknown" && !status.verified;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status.state]} ${className}`}
      title={unverified ? "Horario tomado de OpenStreetMap, no confirmado por el establecimiento" : undefined}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {status.label}
      {unverified && <span className="font-normal opacity-75">· sin verificar</span>}
    </span>
  );
}
