import { useEffect, useRef, useState } from "react";
import BlackHole2D from "./BlackHole2D.jsx";

// Agujero negro realista con WebGL2, optimizado para pantallas de 120/144 Hz.
//
// Cada píxel sigue un rayo de luz que la gravedad curva (aproximación de Schwarzschild, como en "Interstellar").
// Ese cálculo es lo caro (cientos de pasos por píxel), pero como la cámara está quieta el resultado no cambia:
// se hace UNA vez ("horneado") y se guarda en texturas — dónde cruza cada rayo el disco (hasta 3 veces: el
// frente, la parte de atrás doblada por encima y el anillo de abajo), con qué efecto Doppler, y qué estrellas ve.
// En cada cuadro solo se pinta el gas que gira con una textura de ruido: decenas de veces más liviano.
// Se vuelve a hornear solo al cambiar el tamaño de la ventana. El "mecerse" de la cámara se hace con una
// transformación CSS del canvas (la hace el compositor del navegador, sin costo para el shader).
// Sin WebGL2 (o sin texturas de punto flotante) se usa el dibujo 2D de respaldo.

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const COMMON = `
#define RIN 3.0
#define ROUT 13.0
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

// --------------------------- Horneado: geodésicas de la luz (una vez) ---------------------------
const BAKE = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uZoom;
uniform float uRoll;
uniform float uDist;
uniform float uHeight;
layout(location = 0) out vec4 o0;   // cruce 1: (radio, ángulo, Doppler, resplandor)
layout(location = 1) out vec4 o1;   // cruce 2
layout(location = 2) out vec4 o2;   // cruce 3
layout(location = 3) out vec4 o3;   // cielo: color de las estrellas (rgb) y 1 si la luz cayó al agujero
${COMMON}
#define STEPS 260

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
             mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 sky(vec3 d) {
  vec3 col = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float sc = k == 0 ? 90.0 : 210.0;
    vec3 q = d * sc;
    float h = hash3(floor(q));
    if (h > 0.982) {
      float s = smoothstep(0.32, 0.0, length(fract(q) - 0.5));
      col += mix(vec3(0.62, 0.74, 1.0), vec3(1.0), h) * s * (h - 0.982) * 75.0;
    }
  }
  float band = exp(-pow(d.y * 7.0 + 0.6 * d.x, 2.0));
  float n = vnoise(d.xz * 5.0 + d.y * 3.0) * 0.6 + vnoise(d.xz * 11.0) * 0.4;
  col += vec3(0.010, 0.020, 0.045) * band * (0.4 + 1.2 * n);
  return col;
}

void main() {
  vec2 screen = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 uv = screen - uCenter;
  float cr = cos(uRoll), sr = sin(uRoll);
  uv = vec2(cr * uv.x - sr * uv.y, sr * uv.x + cr * uv.y);

  vec3 cam = vec3(0.0, uHeight, -uDist);
  vec3 fwd = normalize(-cam);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  vec3 vel = normalize(fwd * uZoom + uv.x * right + uv.y * up);
  vec3 pos = cam;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);

  vec4 hits[3];
  hits[0] = vec4(0.0); hits[1] = vec4(0.0); hits[2] = vec4(0.0);
  int count = 0;
  float glow = 0.0;
  bool captured = false;

  for (int i = 0; i < STEPS; i++) {
    float r = length(pos);
    float dt = clamp(0.06 * r, 0.025, 1.2);
    vel += -1.5 * h2 * pos / pow(r, 5.0) * dt;
    vec3 npos = pos + vel * dt;
    if (pos.y * npos.y < 0.0 && count < 3) {
      vec3 p = mix(pos, npos, pos.y / (pos.y - npos.y));
      float rc = length(p.xz);
      if (rc > RIN && rc < ROUT) {
        vec3 vdisk = normalize(vec3(-p.z, 0.0, p.x)) * sqrt(0.5 / rc);
        float D = sqrt(1.0 - dot(vdisk, vdisk)) / (1.0 - dot(vdisk, -normalize(vel)));
        hits[count] = vec4(rc, atan(p.z, p.x), D, 0.0);
        count++;
      }
    }
    float rr = length(npos.xz);
    if (rr > RIN * 0.9 && rr < ROUT * 1.2) {
      glow += exp(-abs(npos.y) * 2.2) * exp(-(rr - RIN) * 0.22) * dt * 0.012;
    }
    pos = npos;
    float nr = length(pos);
    if (nr < 1.0) { captured = true; break; }
    if (nr > 45.0 && dot(pos, vel) > 0.0) break;
  }
  o0 = vec4(hits[0].xyz, glow);
  o1 = hits[1];
  o2 = hits[2];
  o3 = captured ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(sky(normalize(vel)), 0.0);
}
`;

// --------------------------- Cada cuadro: el gas que gira (barato) ---------------------------
const RENDER = `#version 300 es
precision highp float;
uniform sampler2D t0;
uniform sampler2D t1;
uniform sampler2D t2;
uniform sampler2D t3;
uniform sampler2D uNoise;
uniform float uTime;
uniform float uEnergy;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec3 uPlanet;
out vec4 outColor;
${COMMON}

float tn(vec2 p) { return texture(uNoise, p * (1.0 / 256.0)).r; }   // ruido de una textura (rápido)
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * tn(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
vec3 heat(float t) {
  vec3 deep = vec3(0.10, 0.11, 0.14);
  vec3 mid = vec3(0.50, 0.54, 0.62);
  vec3 hot = vec3(1.00, 1.00, 1.00);
  return t < 0.5 ? mix(deep, mid, t * 2.0) : mix(mid, hot, (t - 0.5) * 2.0);
}

// Color y opacidad del gas donde el rayo cruzó el disco
vec4 gas(vec3 hit, float speed) {
  float rc = hit.x;
  if (rc <= 0.0) return vec4(0.0);
  float x = (rc - RIN) / (ROUT - RIN);
  float omega = 2.2 / pow(rc, 1.5);
  float ang = hit.y - uTime * omega * speed;
  vec2 q = vec2(cos(ang), sin(ang)) * rc;
  float clouds = fbm(q * 0.7 + vec2(uTime * 0.04, rc * 0.4 - uTime * 0.03));
  float fine = fbm(vec2(rc * 9.0 - uTime * 0.15, 0.0) + q * 0.35);
  float rings = 0.8 + 0.2 * sin(rc * 11.0 + clouds * 9.0);
  float clumps = smoothstep(0.42, 0.78, fbm(q * 1.15 + 3.7));
  float spots = 0.0;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float sr = 3.8 + fk * 2.1;
    float sa = fk * 2.4 + uTime * (2.2 / pow(sr, 1.5)) * speed;
    vec2 d = vec2(cos(hit.y), sin(hit.y)) * rc - vec2(cos(sa), sin(sa)) * sr;
    spots += exp(-dot(d, d) * 0.9) * (1.2 - fk * 0.2);
  }
  float dens = smoothstep(0.0, 0.05, x) * pow(smoothstep(1.0, 0.25, x), 1.4)
             * (0.14 + pow(clouds, 1.6) * 1.1 + clumps * 0.9 + fine * 0.3 + spots * 1.4) * rings;
  float D = hit.z;
  float grav = sqrt(max(1.0 - 1.0 / rc, 0.0));
  float temp = pow(RIN / rc, 0.85) * D * grav;
  vec3 c = heat(clamp(temp * 0.95, 0.0, 1.0)) * pow(D, 3.0) * grav * temp * 2.6 * dens * (0.6 + 0.6 * uEnergy);
  return vec4(c, clamp(dens * 1.1, 0.0, 1.0));
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(t0, px, 0);
  vec4 b = texelFetch(t1, px, 0);
  vec4 c = texelFetch(t2, px, 0);
  vec4 s = texelFetch(t3, px, 0);
  float speed = 1.1 + uEnergy * 1.2;

  vec3 col = vec3(0.0);
  float alpha = 0.0;
  vec4 g = gas(a.xyz, speed);
  col += (1.0 - alpha) * g.rgb; alpha += (1.0 - alpha) * g.a;
  if (alpha < 0.97) { g = gas(b.xyz, speed); col += (1.0 - alpha) * g.rgb; alpha += (1.0 - alpha) * g.a; }
  if (alpha < 0.97) { g = gas(c.xyz, speed); col += (1.0 - alpha) * g.rgb; alpha += (1.0 - alpha) * g.a; }
  if (s.w < 0.5) {
    float tw = 0.75 + 0.25 * sin(uTime * 2.0 + hash2(vec2(px)) * 40.0);   // estrellas que titilan
    col += (1.0 - alpha) * s.rgb * tw;
  }
  col += vec3(0.75, 0.8, 0.9) * a.w * (0.6 + 0.6 * uEnergy);

  vec2 screen = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  if (uPlanet.z > 0.0) {
    vec2 dp = screen - uPlanet.xy;
    float dpl = length(dp);
    float body = smoothstep(uPlanet.z, uPlanet.z * 0.9, dpl);
    vec2 lightDir = normalize(uCenter - uPlanet.xy);
    float rim = body * smoothstep(0.35, 1.0, dot(normalize(dp + 1e-5), lightDir))
              * smoothstep(uPlanet.z * 0.55, uPlanet.z, dpl);
    col = mix(col, vec3(0.025, 0.027, 0.032), body) + vec3(0.55, 0.58, 0.65) * rim;
  }

  col = 1.0 - exp(-col * 2.1);
  col += (hash2(gl_FragCoord.xy + fract(uTime * 7.0) * 100.0) - 0.5) * 0.018;
  outColor = vec4(pow(max(col, 0.0), vec3(0.92)), 1.0);
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

function program(gl, fragmentSource) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
  return p;
}

const uniforms = (gl, p, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));

// Motor WebGL2: hornea las geodésicas y dibuja cada cuadro. Lanza un error si el equipo no lo soporta.
function createEngine(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: "high-performance" });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) throw new Error("sin WebGL2 con texturas flotantes");

  const bake = program(gl, BAKE);
  const render = program(gl, RENDER);
  const ub = uniforms(gl, bake, ["uRes", "uCenter", "uZoom", "uRoll", "uDist", "uHeight"]);
  const ur = uniforms(gl, render, ["t0", "t1", "t2", "t3", "uNoise", "uTime", "uEnergy", "uRes", "uCenter", "uPlanet"]);

  // Triángulo que cubre la pantalla
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Textura de ruido (256×256): el fbm del gas lee esta textura en lugar de calcular senos
  const noise = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, noise);
  const data = new Uint8Array(256 * 256);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 256;
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  let targets = [];
  let fbo = null;
  let layout = null;

  function freeTargets() {
    targets.forEach((t) => gl.deleteTexture(t));
    if (fbo) gl.deleteFramebuffer(fbo);
    targets = [];
    fbo = null;
  }

  // Hornea las 4 texturas al tamaño actual del canvas
  function bakeAt(width, height, aspect) {
    freeTargets();
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    for (let i = 0; i < 4; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      targets.push(t);
    }
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("framebuffer");

    // Encuadre (como la referencia): agujero grande detrás del título y el disco cruzando en diagonal
    const wide = aspect > 1;
    layout = {
      center: [wide ? -0.1 * aspect : -0.12, wide ? 0.2 : 0.28],
      planet: [wide ? 0.2 * aspect : 0.28, wide ? 0.2 : 0.38, wide ? 0.016 : 0.022],
    };
    gl.useProgram(bake);
    gl.viewport(0, 0, width, height);
    gl.uniform2f(ub.uRes, width, height);
    gl.uniform2f(ub.uCenter, ...layout.center);
    gl.uniform1f(ub.uZoom, wide ? 1.2 : 1.05);
    gl.uniform1f(ub.uRoll, wide ? 0.42 : 0.3);
    gl.uniform1f(ub.uDist, 12.5);
    gl.uniform1f(ub.uHeight, 0.9);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function draw(time, energy) {
    if (!targets.length) return;
    gl.useProgram(render);
    gl.viewport(0, 0, canvas.width, canvas.height);
    targets.forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(ur[`t${i}`], i);
    });
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, noise);
    gl.uniform1i(ur.uNoise, 4);
    gl.uniform1f(ur.uTime, time);
    gl.uniform1f(ur.uEnergy, energy);
    gl.uniform2f(ur.uRes, canvas.width, canvas.height);
    gl.uniform2f(ur.uCenter, ...layout.center);
    gl.uniform3f(ur.uPlanet, ...layout.planet);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function destroy() {
    freeTargets();
    gl.deleteTexture(noise);
    gl.deleteBuffer(buffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(bake);
    gl.deleteProgram(render);
  }

  return { gl, bakeAt, draw, destroy };
}

export default function BlackHole({ intensity = 0.5, quality = 1, className = "" }) {
  const canvasRef = useRef(null);
  const intensityRef = useRef(intensity);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    intensityRef.current = Math.max(0.15, Math.min(1, intensity));
  }, [intensity]);

  useEffect(() => {
    if (fallback) return undefined;
    const canvas = canvasRef.current;
    let engine;
    try {
      engine = createEngine(canvas);
    } catch {
      setFallback(true);
      return undefined;
    }
    const small = window.innerWidth < 760;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const MIN_SCALE = 0.5;
    let scale = quality;
    let raf = 0, visible = true, time = 40, prev = performance.now(), rebake = 0;
    // Medición del ritmo real de la pantalla (60, 120, 144 Hz…) para saber si vamos atrasados
    const intervals = [];
    let target = 1000 / 60, slow = 0, fast = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
      const w = Math.max(1, Math.round(rect.width * dpr * scale));
      const h = Math.max(1, Math.round(rect.height * dpr * scale));
      if (w === canvas.width && h === canvas.height && rebake) return;
      canvas.width = w;
      canvas.height = h;
      try {
        engine.bakeAt(w, h, rect.width / Math.max(rect.height, 1));
        rebake = 1;
      } catch {
        setFallback(true);
      }
    }

    function adapt(ms) {
      if (intervals.length < 40) {
        intervals.push(ms);
        if (intervals.length === 40) target = [...intervals].sort((a, b) => a - b)[20];
        return;
      }
      if (ms > target * 1.45) { slow++; fast = 0; } else if (ms < target * 1.1) { fast++; slow = 0; }
      // Si va atrasado de forma sostenida, baja un poco la resolución (y vuelve a hornear)
      if (slow > 45 && scale > MIN_SCALE) { scale = Math.max(MIN_SCALE, scale * 0.85); slow = 0; resize(); }
      if (fast > 600 && scale < quality) { scale = Math.min(quality, scale * 1.1); fast = 0; resize(); }
    }

    function frame(now) {
      if (!visible) return;
      const ms = now - prev;
      prev = now;
      if (!reduce) time += Math.min(0.05, ms / 1000);
      engine.draw(time, intensityRef.current);
      if (!canvas.dataset.ready) canvas.dataset.ready = "1";
      adapt(ms);
      if (!reduce) raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      prev = performance.now();
      raf = requestAnimationFrame(frame);
    }

    resize();
    start();
    let resizeTimer;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { resize(); engine.draw(time, intensityRef.current); }, 150);
    });
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
      clearTimeout(resizeTimer);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      engine.destroy();
    };
  }, [fallback, quality]);

  if (fallback) return <BlackHole2D intensity={intensity} className={className} />;
  return <canvas ref={canvasRef} className={`bh-canvas ${className}`} aria-hidden="true" />;
}
