import { useEffect, useRef, useState } from "react";
import BlackHole2D from "./BlackHole2D.jsx";

// Agujero negro realista con WebGL: cada píxel sigue un rayo de luz que la gravedad curva (aproximación de
// Schwarzschild, como en el render de "Interstellar"). De esa física salen solos:
// - la sombra (la luz que cae al horizonte),
// - el anillo de fotones,
// - la parte de atrás del disco "doblada" por encima y por debajo de la sombra,
// - el lado del disco que viene hacia la cámara más brillante (efecto Doppler) y el corrimiento al rojo cerca
//   del horizonte,
// - las estrellas del fondo deformadas por la lente gravitacional.
// `intensity` (0 a 1) sube el brillo y la velocidad del disco. Sin WebGL se usa el dibujo 2D de respaldo.

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const fragment = (steps) => `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform vec2 uCenter;   // dónde va el agujero en la pantalla (en unidades de la altura)
uniform float uZoom;

#define STEPS ${steps}
#define RIN 3.0      /* órbita estable más interna (3 radios de Schwarzschild) */
#define ROUT 13.0

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
             mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}

// Cielo: estrellas en dos capas y una banda tenue de la Vía Láctea, en azules
vec3 sky(vec3 d) {
  vec3 col = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float sc = k == 0 ? 90.0 : 210.0;
    vec3 q = d * sc;
    vec3 id = floor(q);
    vec3 f = fract(q) - 0.5;
    float h = hash3(id);
    if (h > 0.982) {
      float s = smoothstep(0.32, 0.0, length(f));
      float tw = 0.75 + 0.25 * sin(uTime * (1.0 + h * 3.0) + h * 50.0);
      col += mix(vec3(0.62, 0.74, 1.0), vec3(1.0), h) * s * (h - 0.982) * 75.0 * tw;
    }
  }
  float band = exp(-pow(d.y * 7.0 + 0.6 * d.x, 2.0));
  col += vec3(0.010, 0.020, 0.045) * band * (0.4 + 1.2 * fbm(d.xz * 5.0 + d.y * 3.0));
  return col;
}

// Color del disco por temperatura: de azul profundo (frío, afuera) a blanco azulado (caliente, adentro)
vec3 heat(float t) {
  vec3 deep = vec3(0.05, 0.12, 0.42);
  vec3 mid = vec3(0.30, 0.55, 1.00);
  vec3 hot = vec3(0.90, 0.96, 1.00);
  return t < 0.5 ? mix(deep, mid, t * 2.0) : mix(mid, hot, (t - 0.5) * 2.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y - uCenter;

  // Cámara un poco por encima del plano del disco (casi de canto)
  // Cámara que se mece despacio alrededor del agujero (gira y sube/baja un poco): se siente vivo
  float sway = 0.22 * sin(uTime * 0.06);
  vec3 cam = vec3(sin(sway) * 21.0, 2.1 + 0.55 * sin(uTime * 0.045), -cos(sway) * 21.0);
  vec3 fwd = normalize(-cam);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  vec3 vel = normalize(fwd * uZoom + uv.x * right + uv.y * up);
  vec3 pos = cam;

  // Momento angular del fotón: con él, la aceleración de la geodésica es -1.5·h²·x / r^5
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);

  vec3 col = vec3(0.0);
  float alpha = 0.0;
  bool captured = false;
  float glow = 0.0;
  float speed = 1.1 + uEnergy * 1.2;

  for (int i = 0; i < STEPS; i++) {
    float r = length(pos);
    float dt = clamp(0.07 * r, 0.03, 1.2);
    vel += -1.5 * h2 * pos / pow(r, 5.0) * dt;
    vec3 npos = pos + vel * dt;

    // ¿Cruzó el plano del disco en este paso?
    if (pos.y * npos.y < 0.0) {
      vec3 p = mix(pos, npos, pos.y / (pos.y - npos.y));
      float rc = length(p.xz);
      if (rc > RIN && rc < ROUT) {
        float x = (rc - RIN) / (ROUT - RIN);
        // Rotación diferencial: lo de adentro gira más rápido (Kepler) -> espirales y estrías
        float omega = 2.2 / pow(rc, 1.5);
        float ang = atan(p.z, p.x) - uTime * omega * speed;
        vec2 q = vec2(cos(ang), sin(ang)) * rc;
        // Gas turbulento: nubes que la rotación estira en arcos, más estrías finas a lo largo del radio
        // las nubes de gas también cambian de forma con el tiempo (no solo giran)
        float clouds = fbm(q * 0.7 + vec2(uTime * 0.04, rc * 0.4 - uTime * 0.03));
        float fine = fbm(vec2(rc * 9.0 - uTime * 0.15, 0.0) + q * 0.35);
        float rings = 0.8 + 0.2 * sin(rc * 11.0 + clouds * 9.0);
        // grumos de gas bien marcados: al girar se ve claramente que el disco se mueve
        float clumps = smoothstep(0.42, 0.78, fbm(q * 1.15 + 3.7));
        // puntos calientes que orbitan (como manchas brillantes en el gas)
        float spots = 0.0;
        for (int k = 0; k < 4; k++) {
          float fk = float(k);
          float sr = 3.8 + fk * 2.1;
          float sa = fk * 2.4 + uTime * (2.2 / pow(sr, 1.5)) * speed;
          vec2 sp = vec2(cos(sa), sin(sa)) * sr;
          spots += exp(-dot(p.xz - sp, p.xz - sp) * 0.9) * (1.2 - fk * 0.2);
        }
        float dens = smoothstep(0.0, 0.05, x) * pow(smoothstep(1.0, 0.25, x), 1.4)
                   * (0.14 + pow(clouds, 1.6) * 1.1 + clumps * 0.9 + fine * 0.3 + spots * 1.4) * rings;

        // Doppler relativista: el gas que viene hacia nosotros se ve más brillante y más caliente
        vec3 vdisk = normalize(vec3(-p.z, 0.0, p.x)) * sqrt(0.5 / rc);
        vec3 toCam = -normalize(vel);
        float beta2 = dot(vdisk, vdisk);
        float D = sqrt(1.0 - beta2) / (1.0 - dot(vdisk, toCam));
        float grav = sqrt(max(1.0 - 1.0 / rc, 0.0));   // corrimiento al rojo gravitacional
        float temp = pow(RIN / rc, 0.85) * D * grav;

        vec3 c = heat(clamp(temp * 0.95, 0.0, 1.0)) * pow(D, 3.0) * grav * temp * 2.6 * dens;
        float a = clamp(dens * 1.1, 0.0, 1.0);
        col += (1.0 - alpha) * c * (0.6 + 0.6 * uEnergy);
        alpha += (1.0 - alpha) * a;
        if (alpha > 0.97) break;
      }
    }
    // Resplandor: el gas caliente ilumina el espacio alrededor del disco (una bruma muy tenue)
    float rr = length(npos.xz);
    if (rr > RIN * 0.9 && rr < ROUT * 1.2) {
      glow += exp(-abs(npos.y) * 2.2) * exp(-(rr - RIN) * 0.22) * dt * 0.012;
    }
    pos = npos;
    float nr = length(pos);
    if (nr < 1.0) { captured = true; break; }
    if (nr > 45.0 && dot(pos, vel) > 0.0) break;
  }

  if (!captured) col += (1.0 - alpha) * sky(normalize(vel));
  col += vec3(0.35, 0.55, 1.0) * glow * (0.6 + 0.6 * uEnergy);

  // Exposición suave y un poco de grano para que no se vea plano
  col = 1.0 - exp(-col * 1.7);
  col += (hash2(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.018;
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(0.92)), 1.0);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "shader");
  }
  return shader;
}

export default function BlackHole({ intensity = 0.5, className = "" }) {
  const canvasRef = useRef(null);
  const intensityRef = useRef(intensity);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    intensityRef.current = Math.max(0.15, Math.min(1, intensity));
  }, [intensity]);

  useEffect(() => {
    if (fallback) return undefined;
    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl", { antialias: false, powerPreference: "high-performance", premultipliedAlpha: false });
    if (!gl) {
      setFallback(true);
      return undefined;
    }
    const small = window.innerWidth < 760;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let program;
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment(small ? 110 : 170)));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "link");
    } catch {
      setFallback(true);
      return undefined;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = Object.fromEntries(["uRes", "uTime", "uEnergy", "uCenter", "uZoom"].map((n) => [n, gl.getUniformLocation(program, n)]));

    // Resolución completa y 60 cuadros por segundo. Si el equipo no da abasto (cuadros lentos), la escala baja
    // sola de a poco; si sobra potencia, vuelve a subir. Así se ve nítido sin trabar equipos modestos.
    let scale = 1;
    const MIN_SCALE = small ? 0.45 : 0.55;
    let raf = 0, visible = true, time = 0, prev = performance.now(), frames = 0, slow = 0, fast = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
      canvas.width = Math.max(1, Math.round(rect.width * dpr * scale));
      canvas.height = Math.max(1, Math.round(rect.height * dpr * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      const aspect = rect.width / Math.max(rect.height, 1);
      // En pantallas anchas va a la derecha (el título queda a la izquierda); en celular, centrado y abajo
      gl.uniform2f(u.uCenter, aspect > 1.6 ? aspect * 0.2 : 0, aspect > 1.6 ? -0.02 : -0.16);
      gl.uniform1f(u.uZoom, aspect > 1.6 ? 1.55 : 1.15);
    }

    function adapt(frameMs) {
      if (frames++ < 20) return;            // los primeros cuadros siempre son más lentos
      if (frameMs > 26) { slow++; fast = 0; } else if (frameMs < 14) { fast++; slow = 0; } else { slow = 0; fast = 0; }
      if (slow > 12 && scale > MIN_SCALE) { scale = Math.max(MIN_SCALE, scale * 0.85); slow = 0; resize(); }
      if (fast > 120 && scale < 1) { scale = Math.min(1, scale * 1.1); fast = 0; resize(); }
    }

    function draw(now) {
      const frameMs = now - prev;
      const dt = Math.min(0.05, frameMs / 1000);
      prev = now;
      if (!reduce) time += dt;
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, time + 40);
      gl.uniform1f(u.uEnergy, intensityRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!canvas.dataset.ready) canvas.dataset.ready = "1";
      return frameMs;
    }

    function loop(now) {
      if (!visible) return;
      adapt(draw(now));
      raf = requestAnimationFrame(loop);
    }

    function start() {
      cancelAnimationFrame(raf);
      prev = performance.now();
      if (reduce) draw(prev);
      else raf = requestAnimationFrame(loop);
    }

    resize();
    start();
    const ro = new ResizeObserver(() => { resize(); draw(performance.now()); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && document.visibilityState === "visible";
      if (visible) start();
    });
    io.observe(canvas);
    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (visible) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const onLost = (e) => { e.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", onLost);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [fallback]);

  if (fallback) return <BlackHole2D intensity={intensity} className={className} />;
  return <canvas ref={canvasRef} className={`bh-canvas ${className}`} aria-hidden="true" />;
}
