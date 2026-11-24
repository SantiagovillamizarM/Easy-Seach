import { useEffect, useRef } from "react";

// Mini cielo estrellado para el modo oscuro del dashboard (canvas 2D, sin librerías).
// Inspirado en el del inicio pero más sobrio:
// - Tres capas de profundidad que derivan despacio (las cercanas se mueven más: paralaje) y siguen
//   un poco al cursor.
// - Más de la mitad de las estrellas titilan; las más brillantes llevan halo y destello en cruz.
// - Cada 6-14 s cruza un cometa fino que aparece y se apaga suave.
// - Ocupa el alto de la ventana y se queda fijo mientras se baja (el CSS lo pone sticky).
// - Se pausa fuera de pantalla o con la pestaña oculta; con movimiento reducido queda quieto y sin cometas.

const DENSITY = 1 / 3800; // estrellas por píxel CSS de área
const TWINKLE_SHARE = 0.6; // fracción de estrellas que titilan
const COMET_MIN_S = 6;
const COMET_MAX_S = 14;
const DRIFT = { x: -7, y: 3.5 }; // px/s de la capa más cercana (las lejanas van más lento)
const POINTER_PX = 14; // desplazamiento máximo por el cursor en la capa cercana

const rand = (a, b) => a + Math.random() * (b - a);
const TINTS = ["240,238,255", "214,204,255", "196,218,255", "255,236,250"];

function makeStars(w, h) {
  const count = Math.round(w * h * DENSITY);
  return Array.from({ length: count }, () => {
    const depth = Math.random() < 0.55 ? 0.25 : Math.random() < 0.7 ? 0.55 : 1; // lejana, media, cercana
    const bright = Math.random() < 0.07;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      depth,
      r: bright ? rand(1.1, 1.6) : rand(0.45, 0.95) * (0.7 + depth * 0.5),
      base: bright ? rand(0.65, 0.85) : rand(0.22, 0.55),
      bright,
      tint: TINTS[Math.floor(Math.random() * TINTS.length)],
      twinkle: bright || Math.random() < TWINKLE_SHARE,
      period: rand(2.4, 6), // segundos por ciclo
      phase: Math.random() * Math.PI * 2,
    };
  });
}

export default function NightSkyBackdrop({ className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let w = 0;
    let h = 0;
    let stars = [];
    let comet = null;
    let nextComet = rand(3, 8); // el primero llega pronto
    let frame = 0;
    let visible = true;
    let last;
    let t = 0;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }; // -1..1, suavizado hacia el objetivo

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = makeStars(w, h);
      draw();
    }

    function spawnComet() {
      // Entra por arriba y cruza en diagonal hacia abajo, a izquierda o derecha
      const fromLeft = Math.random() < 0.5;
      const angle = rand(0.35, 0.6); // radianes bajo la horizontal
      const speed = rand(520, 760); // px/s
      comet = {
        x: fromLeft ? rand(-0.1, 0.45) * w : rand(0.55, 1.1) * w,
        y: rand(-0.05, 0.3) * h,
        vx: Math.cos(angle) * speed * (fromLeft ? 1 : -1),
        vy: Math.sin(angle) * speed,
        life: 0,
        dur: rand(1.1, 1.6),
        len: rand(120, 200),
      };
    }

    function drawComet() {
      const c = comet;
      const k = c.life / c.dur;
      // Aparece y se apaga suave (sin cortes)
      const alpha = Math.sin(Math.PI * Math.min(1, k)) * 0.8;
      const norm = Math.hypot(c.vx, c.vy);
      const tx = c.x - (c.vx / norm) * c.len;
      const ty = c.y - (c.vy / norm) * c.len;
      const grad = ctx.createLinearGradient(c.x, c.y, tx, ty);
      grad.addColorStop(0, `rgba(240,236,255,${alpha})`);
      grad.addColorStop(0.3, `rgba(196,181,253,${alpha * 0.45})`);
      grad.addColorStop(1, "rgba(196,181,253,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = `rgba(250,248,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawStar(s, x, y, a) {
      ctx.fillStyle = `rgba(${s.tint},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (!s.bright) return;
      // Halo suave y destello en cruz que crece con el brillo
      const halo = ctx.createRadialGradient(x, y, 0, x, y, s.r * 6);
      halo.addColorStop(0, `rgba(${s.tint},${a * 0.35})`);
      halo.addColorStop(1, `rgba(${s.tint},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, s.r * 6, 0, Math.PI * 2);
      ctx.fill();
      const len = s.r * (4 + 5 * a);
      ctx.strokeStyle = `rgba(${s.tint},${a * 0.55})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x - len, y);
      ctx.lineTo(x + len, y);
      ctx.moveTo(x, y - len);
      ctx.lineTo(x, y + len);
      ctx.stroke();
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      const moving = !reduced.matches;
      for (const s of stars) {
        let a = s.base;
        if (s.twinkle && moving) {
          // Seno elevado al cubo: momentos tranquilos y destellos marcados
          const wave = 0.5 + 0.5 * Math.sin((t / s.period) * Math.PI * 2 + s.phase);
          a = s.base * (0.35 + 1.15 * wave ** 3);
        }
        // Deriva lenta por capas (envuelve los bordes) + paralaje del cursor
        let x = s.x;
        let y = s.y;
        if (moving) {
          x = (((s.x + DRIFT.x * s.depth * t) % w) + w) % w + pointer.x * POINTER_PX * s.depth;
          y = (((s.y + DRIFT.y * s.depth * t) % h) + h) % h + pointer.y * POINTER_PX * s.depth;
        }
        drawStar(s, x, y, Math.min(a, 0.95));
      }
      if (comet) drawComet();
      canvas.dataset.ready = "";
    }

    function tick(now) {
      frame = 0;
      const dt = last === undefined ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2.5);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2.5);
      if (comet) {
        comet.life += dt;
        comet.x += comet.vx * dt;
        comet.y += comet.vy * dt;
        if (comet.life >= comet.dur) {
          comet = null;
          nextComet = t + rand(COMET_MIN_S, COMET_MAX_S);
        }
      } else if (t >= nextComet) {
        spawnComet();
      }
      draw();
      frame = requestAnimationFrame(tick);
    }

    function sync() {
      const playing = visible && !document.hidden && !reduced.matches;
      if (playing && !frame) frame = requestAnimationFrame(tick);
      if (!playing) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = undefined;
        comet = null;
        draw();
      }
    }

    const onPointer = (event) => {
      pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    io.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    resize();
    sync();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
