import { useEffect, useRef } from "react";

// Fondo líquido para el dashboard de resultados (WebGL 1, sin librerías). Tiene paleta clara y oscura.
// Ruido fractal con "domain warping" (el ruido se deforma con más ruido) da una superficie que fluye
// como líquido; se ilumina como un metal satinado blanco y gris para que se vean pliegues y brillos.
// - Se pinta a media resolución y solo del tamaño de la ventana (se queda fijo mientras bajas).
// - Se pausa fuera de pantalla o con la pestaña oculta; con movimiento reducido queda un cuadro fijo.
// - Sin WebGL no pasa nada: queda el degradado blanco del CSS.

const VERTEX = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uShadow, uLight, uTint; // paleta del tema (claro: perla; oscuro: azul noche)
uniform float uTintAmt, uSpec;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++){ v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
// Superficie líquida: dos niveles de deformación que se mueven en direcciones distintas
float field(vec2 p){
  float t = uTime;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.8));
  vec2 r = vec2(fbm(p + 3.2 * q + vec2(1.7, 9.2) + t * 1.2), fbm(p + 3.2 * q + vec2(8.3, 2.8) - t));
  return fbm(p + 3.2 * r);
}
void main(){
  vec2 p = gl_FragCoord.xy / uRes.y * 1.05; // escala baja: pliegues amplios y fluidos
  float e = 0.012;
  float f = field(p);
  float fx = field(p + vec2(e, 0.0)) - f;
  float fy = field(p + vec2(0.0, e)) - f;
  // Normal de la superficie a partir de la pendiente: así los pliegues tienen luz y sombra
  // Relieve suave (pendiente baja) y colores muy cercanos entre sí: el líquido se intuye, no domina
  vec3 n = normalize(vec3(-fx / e * 0.2, -fy / e * 0.2, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.6, 0.66));
  float diff = dot(n, L) * 0.5 + 0.5;
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 30.0);
  vec3 col = mix(uShadow, uLight, smoothstep(0.1, 0.9, diff));
  col = mix(col, uTint, (1.0 - diff) * uTintAmt); // un toque lila en las sombras
  col += spec * uSpec;
  gl_FragColor = vec4(min(col, 1.0), 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

// Paletas por tema (RGB 0-1). Claro: blanco y gris perla. Oscuro: casi negro con pliegues
// violeta grisáceo y sombras moradas muy tenues (combina con el pie y el cielo de la página).
const PALETTES = {
  light: { shadow: [0.905, 0.91, 0.932], light: [0.988, 0.989, 0.994], tint: [0.93, 0.92, 0.975], tintAmt: 0.12, spec: 0.08 },
  dark: { shadow: [0.027, 0.027, 0.045], light: [0.085, 0.075, 0.145], tint: [0.2, 0.1, 0.34], tintAmt: 0.3, spec: 0.06 },
};

export default function LiquidBackdrop({ className = "", theme = "light" }) {
  const canvasRef = useRef(null);
  const paletteRef = useRef(PALETTES[theme] ?? PALETTES.light);
  const redrawRef = useRef(null);

  // Al cambiar de tema se repinta con la nueva paleta (aunque la animación esté en pausa)
  useEffect(() => {
    paletteRef.current = PALETTES[theme] ?? PALETTES.light;
    redrawRef.current?.();
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return undefined;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return undefined;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return undefined;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uShadow = gl.getUniformLocation(program, "uShadow");
    const uLight = gl.getUniformLocation(program, "uLight");
    const uTint = gl.getUniformLocation(program, "uTint");
    const uTintAmt = gl.getUniformLocation(program, "uTintAmt");
    const uSpec = gl.getUniformLocation(program, "uSpec");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const SCALE = 0.5; // media resolución: el líquido es suave, no se nota y cuesta 4 veces menos
    const SPEED = 0.045; // velocidad del flujo (lenta: un movimiento casi imperceptible)
    let frame = 0;
    let visible = true;
    let elapsed = 0;
    let last;

    function resize() {
      const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    }

    function draw() {
      const pal = paletteRef.current;
      gl.uniform3fv(uShadow, pal.shadow);
      gl.uniform3fv(uLight, pal.light);
      gl.uniform3fv(uTint, pal.tint);
      gl.uniform1f(uTintAmt, pal.tintAmt);
      gl.uniform1f(uSpec, pal.spec);
      gl.uniform1f(uTime, 7.0 + elapsed * SPEED);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.dataset.ready = "";
    }

    function tick(now) {
      frame = 0;
      if (last !== undefined) elapsed += Math.min(0.1, (now - last) / 1000);
      last = now;
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
        draw(); // cuadro fijo (movimiento reducido o al volver a pintar tras un cambio de tamaño)
      }
    }

    const ro = new ResizeObserver(() => { resize(); if (!frame) draw(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    io.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    resize();
    sync();
    redrawRef.current = () => { if (!frame) draw(); };

    return () => {
      redrawRef.current = null;
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
