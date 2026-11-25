import { useEffect, useRef } from "react";

// Agujero negro animado (canvas 2D): disco de acreción inclinado que gira, anillo de fotones y la parte del
// disco que la gravedad "dobla" por encima de la sombra. `intensity` (0 a 1) sube el brillo y la velocidad:
// el dashboard lo conecta con la actividad de hoy. Se pausa fuera de pantalla y con "reducir movimiento".

const TILT = 0.22; // qué tan de canto se ve el disco

function makeParticles(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const t = Math.random();
    list.push({
      r: 1.25 + Math.pow(t, 1.6) * 2.35,          // radio en unidades de la sombra (más densos cerca)
      a: Math.random() * Math.PI * 2,
      len: 0.04 + Math.random() * 0.22,           // largo de la estela
      w: 0.4 + Math.random() * 1.3,
      tw: Math.random() * Math.PI * 2,
    });
  }
  return list;
}

function colorFor(r, alpha) {
  // cerca del horizonte: blanco azulado muy caliente; lejos: azul y luego azul profundo
  const f = Math.min(1, (r - 1.25) / 2.35);
  const red = Math.round(236 - f * 160);
  const green = Math.round(244 - f * 110);
  const blue = 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}

export default function BlackHole({ intensity = 0.5, className = "" }) {
  const canvasRef = useRef(null);
  const intensityRef = useRef(intensity);

  useEffect(() => {
    intensityRef.current = Math.max(0.15, Math.min(1, intensity));
  }, [intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const particles = makeParticles(window.innerWidth < 640 ? 520 : 1100);
    const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random(), p: Math.random() * 6 }));
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true, last = performance.now(), time = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawParticle(p, cx, cy, R, energy, front) {
      const sin = Math.sin(p.a);
      if (front !== sin > 0) return;
      const rr = p.r * R;
      const x = cx + Math.cos(p.a) * rr;
      const y = cy + sin * rr * TILT;
      const x2 = cx + Math.cos(p.a - p.len) * rr;
      const y2 = cy + Math.sin(p.a - p.len) * rr * TILT;
      // el lado que viene hacia nosotros se ve más brillante (efecto Doppler)
      const doppler = 0.55 + 0.45 * Math.cos(p.a + 0.6);
      const alpha = Math.min(1, (0.3 + 0.6 * doppler) * energy * (0.75 + 0.25 * Math.sin(time * 2 + p.tw)));
      ctx.strokeStyle = colorFor(p.r, alpha);
      ctx.lineWidth = p.w;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      // Nunca del todo apagado: con poca actividad el disco brilla menos, pero se sigue viendo
      const energy = 0.55 + intensityRef.current * 0.45;
      // En pantallas anchas va a la derecha (el título queda a la izquierda); en celular, abajo al centro
      const wide = w > 760;
      const cx = wide ? w * 0.7 : w / 2;
      const cy = wide ? h * 0.52 : h * 0.6;
      const R = wide ? Math.min(w * 0.075, h * 0.17) : Math.min(w * 0.13, h * 0.14);

      ctx.clearRect(0, 0, w, h);
      // estrellas lejanas
      for (const s of stars) {
        const a = 0.15 + 0.35 * Math.abs(Math.sin(time * 0.6 + s.p));
        ctx.fillStyle = `rgba(214,228,255,${a * s.s})`;
        ctx.fillRect(s.x * w, s.y * h, 1.2, 1.2);
      }
      // resplandor general
      const glow = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 4.2);
      glow.addColorStop(0, `rgba(96,150,255,${0.16 * energy})`);
      glow.addColorStop(0.45, `rgba(30,64,175,${0.08 * energy})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      for (const p of particles) {
        if (!reduce) p.a += dt * (0.55 + energy * 0.9) / Math.pow(p.r, 1.5);
        drawParticle(p, cx, cy, R, energy, false);
      }
      // disco "doblado" por la gravedad: arcos por encima y por debajo de la sombra
      for (let i = 0; i < 26; i++) {
        const f = i / 26;
        const rx = R * (1.08 + f * 0.95);
        const alpha = (0.42 - f * 0.36) * energy;
        ctx.strokeStyle = colorFor(1.25 + f * 2, alpha);
        ctx.lineWidth = 1.1;
        ctx.setLineDash([2 + (i % 5) * 3, 3 + (i % 3) * 2]);
        ctx.lineDashOffset = -time * (14 + i) * (0.6 + energy);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, rx * (0.92 - f * 0.18), 0, Math.PI, Math.PI * 2);
        ctx.stroke();
        if (i % 2 === 0) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx * 0.86, rx * 0.5, 0, 0.12, Math.PI - 0.12);
          ctx.globalAlpha = 0.45;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = "source-over";

      // sombra (horizonte de eventos) y anillo de fotones
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(226,238,255,${0.55 + 0.35 * energy})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.015, 0, Math.PI * 2);
      ctx.stroke();
      for (const p of particles) drawParticle(p, cx, cy, R, energy, true);
      ctx.globalCompositeOperation = "source-over";

      // Primer cuadro dibujado: el canvas se enciende con un fundido (bh-canvas en black-hole.css)
      if (!canvas.dataset.ready) canvas.dataset.ready = "1";
      if (!reduce && visible) raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    resize();
    start();
    const ro = new ResizeObserver(() => { resize(); if (reduce || !visible) frame(performance.now()); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && document.visibilityState === "visible";
      if (visible && !reduce) start();
    });
    io.observe(canvas);
    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (visible && !reduce) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className={`bh-canvas ${className}`} aria-hidden="true" />;
}
