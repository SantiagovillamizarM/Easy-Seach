import { useId, useMemo, useRef, useState } from "react";

// Gráficas del dashboard "Horizonte de eventos", dibujadas a mano en SVG (sin librerías).
// Los colores salen de las variables --bh-* de black-hole.css.

export const fmt = (n) => Number(n ?? 0).toLocaleString("es-CO");
export const fmtUsd = (n) => `US$ ${Number(n ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 })}`;

const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

// Cambio frente al periodo anterior: "+12%", "−5%", "nuevo"
export function Delta({ value, previous }) {
  if (!previous) {
    if (!value) return <span className="bh-delta is-flat">sin cambio</span>;
    return <span className="bh-delta is-up">nuevo</span>;
  }
  const pct = Math.round(((value - previous) / previous) * 100);
  const cls = pct > 0 ? "is-up" : pct < 0 ? "is-down" : "is-flat";
  return <span className={`bh-delta ${cls}`}>{pct > 0 ? "+" : pct < 0 ? "−" : ""}{Math.abs(pct)}%</span>;
}

export function Sparkline({ values, color = "var(--bh-accretion)" }) {
  const id = useId();
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? 100 / (values.length - 1) : 100;
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(30 - (v / max) * 26 - 2).toFixed(2)}`);
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="bh-spark" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,30 ${points.join(" ")} 100,30`} fill={`url(#${id})`} />
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Gráfica de área con punto y cuadro de detalle al pasar el mouse (o tocar)
export function AreaChart({ dates, values, label, color = "var(--bh-pink)" }) {
  const id = useId();
  const box = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 800, H = 240, PAD_T = 16, PAD_B = 26;
  const max = Math.max(4, ...values);
  const nice = Math.ceil(max / 4) * 4;
  const x = (i) => (values.length > 1 ? (i / (values.length - 1)) * W : W / 2);
  const y = (v) => PAD_T + (1 - v / nice) * (H - PAD_T - PAD_B);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1)},${H - PAD_B} L${x(0)},${H - PAD_B} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(nice * f));
  const every = Math.max(1, Math.ceil(dates.length / 7));

  function onMove(e) {
    const rect = box.current.getBoundingClientRect();
    const rel = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(rel * (values.length - 1)));
  }

  const hx = hover !== null ? (x(hover) / W) * 100 : 0;
  return (
    <div className="bh-area">
      <div className="bh-area-plot" ref={box} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label} por día`}>
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.38" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <line key={t} x1="0" x2={W} y1={y(t)} y2={y(t)} className="bh-grid" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H - PAD_B} className="bh-cursor" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover !== null && (
        <>
          <span className="bh-dot" style={{ left: `${hx}%`, top: `${(y(values[hover]) / H) * 100}%` }} />
          <div className={`bh-tip ${hx > 70 ? "is-left" : ""}`} style={{ left: `${hx}%` }}>
            <span>{new Date(`${dates[hover]}T12:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "long" })}</span>
            <strong>{fmt(values[hover])}</strong>
            <span>{label.toLowerCase()}</span>
          </div>
        </>
      )}
      </div>
      <div className="bh-area-y" aria-hidden="true">
        {ticks.slice().reverse().map((t) => <span key={t}>{fmt(t)}</span>)}
      </div>
      <div className="bh-area-x" aria-hidden="true">
        {dates.map((d, i) => (i % every === 0 || i === dates.length - 1 ? (
          <span key={d} style={{ left: `${(x(i) / W) * 100}%` }}>{shortDate(d)}</span>
        ) : null))}
      </div>
    </div>
  );
}

// Calendario de puntos: día de la semana × hora; el punto crece con la actividad (estilo pantalla de control)
const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export function DotHeatmap({ grid }) {
  const max = Math.max(1, ...grid.flat());
  const order = [1, 2, 3, 4, 5, 6, 0]; // lunes primero
  let peak = { w: 1, h: 0, v: -1 };
  grid.forEach((row, w) => row.forEach((v, h) => { if (v > peak.v) peak = { w, h, v }; }));
  return (
    <div className="bh-heat">
      <div className="bh-heat-grid" role="img" aria-label={`Hora pico: ${WEEKDAYS[peak.w]} a las ${peak.h}:00`}>
        {order.map((w) => (
          <div key={w} className="bh-heat-row">
            <span className="bh-heat-day">{WEEKDAYS[w]}</span>
            {grid[w].map((v, h) => {
              const f = v / max;
              return (
                <span key={h} className="bh-heat-cell" title={`${WEEKDAYS[w]} ${h}:00 · ${v}`}>
                  <i style={{ transform: `scale(${0.18 + f * 0.82})`, opacity: v ? 0.35 + f * 0.65 : 0.12 }}
                     className={f > 0.66 ? "is-hot" : ""} />
                </span>
              );
            })}
          </div>
        ))}
        <div className="bh-heat-row bh-heat-hours" aria-hidden="true">
          <span className="bh-heat-day" />
          {Array.from({ length: 24 }, (_, h) => <span key={h} className="bh-heat-cell">{h % 3 === 0 ? h : ""}</span>)}
        </div>
      </div>
      <p className="bh-note">
        Hora pico: <strong>{peak.v > 0 ? `${WEEKDAYS[peak.w]} ${peak.h}:00–${peak.h + 1}:00` : "todavía sin datos"}</strong>
      </p>
    </div>
  );
}

// Anillo de barras radiales (como el de actividad de la referencia): cada segmento es una parte del total
export function RadialRing({ items, center, sub }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const BARS = 72;
  const bars = useMemo(() => {
    const out = [];
    const bounds = [];
    for (let k = 0, acc = 0; k < items.length; k++) {
      const share = total ? items[k].value / total : 0;
      bounds.push({ ...items[k], from: acc, to: acc + share });
      acc += share;
    }
    for (let i = 0; i < BARS; i++) {
      const f = i / BARS;
      const seg = bounds.find((b) => f >= b.from && f < b.to) ?? null;
      const wobble = 0.55 + 0.45 * Math.abs(Math.sin(i * 1.7));
      out.push({ angle: f * 360, color: seg?.color ?? "var(--bh-line-strong)", len: seg ? 18 + 16 * wobble : 10 });
    }
    return out;
  }, [items, total]);
  return (
    <div className="bh-ring">
      <svg viewBox="0 0 200 200" role="img" aria-label={items.map((i) => `${i.label}: ${i.value}`).join(", ")}>
        {bars.map((b, i) => (
          <line key={i} x1="100" y1={100 - 52} x2="100" y2={100 - 52 - b.len} stroke={b.color} strokeWidth="2.6"
                strokeLinecap="round" transform={`rotate(${b.angle} 100 100)`} />
        ))}
      </svg>
      <div className="bh-ring-center">
        <strong>{center}</strong>
        <span>{sub}</span>
      </div>
    </div>
  );
}

// Dona fina para repartir un total (proveedores de IA)
export function Donut({ items }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const R = 42, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="bh-donut" role="img" aria-label={items.map((i) => `${i.label}: ${i.value}`).join(", ")}>
      <circle cx="50" cy="50" r={R} className="bh-donut-track" />
      {total > 0 && items.filter((i) => i.value > 0).map((it) => {
        const len = (it.value / total) * C;
        const el = (
          <circle key={it.label} cx="50" cy="50" r={R} fill="none" stroke={it.color} strokeWidth="7"
                  strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${C}`} strokeDashoffset={-offset}
                  transform="rotate(-90 50 50)" strokeLinecap="round" />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

// Embudo horizontal: cada etapa con su barra, su número y el % frente a la primera
export function Funnel({ steps }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="bh-funnel">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="bh-funnel-head">
            <span><em>Nº {String(i + 1).padStart(3, "0")}</em> {s.label}</span>
            <span className="bh-num">{fmt(s.value)} <small>{Math.round((s.value / top) * 100)}%</small></span>
          </div>
          <div className="bh-funnel-track"><i style={{ width: `${Math.max((s.value / top) * 100, s.value ? 1.5 : 0)}%` }} /></div>
        </li>
      ))}
    </ol>
  );
}

// Lista con barras: una etiqueta, su valor y una barra proporcional
export function BarList({ items, color = "var(--bh-violet)", empty = "Todavía sin datos" }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="bh-note">{empty}</p>;
  return (
    <ul className="bh-bars">
      {items.map((it) => (
        <li key={it.label}>
          <span className="bh-bars-label">{it.label}</span>
          <span className="bh-num">{fmt(it.value)}</span>
          <span className="bh-bars-track"><i style={{ width: `${(it.value / max) * 100}%`, background: color }} /></span>
        </li>
      ))}
    </ul>
  );
}

// Nube de palabras: lo más buscado; el tamaño sigue a la cantidad de búsquedas
export function WordCloud({ words }) {
  const max = Math.max(1, ...words.map((w) => w.count));
  if (!words.length) return <p className="bh-note">Todavía no hay búsquedas en este periodo.</p>;
  return (
    <ul className="bh-cloud">
      {words.map((w, i) => {
        const f = w.count / max;
        return (
          <li key={w.query} style={{ fontSize: `${0.7 + f * 0.75}rem`, opacity: 0.55 + f * 0.45, transform: `rotate(${((i * 37) % 7) - 3}deg)` }}
              className={f > 0.6 ? "is-hot" : ""} title={`${w.query} · ${w.count} búsquedas`}>
            {w.query.length > 26 ? `${w.query.slice(0, 25)}…` : w.query}
          </li>
        );
      })}
    </ul>
  );
}
