import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Campo de estrellas 3D para el hero del inicio (WebGL 1, sin librerías).
// Miles de puntos avanzan despacio hacia la cámara; el cursor mueve la cámara (paralaje real:
// las cercanas se desplazan mucho más que las lejanas) y sin puntero la cámara deriva sola.
// Las más brillantes llevan destello en cruz. Detrás, una nebulosa con ruido fractal y capas de
// estrellas diminutas. Todo se suma (mezcla aditiva) sobre un lienzo transparente encima del
// fondo nocturno del hero.
// Sin WebGL no pasa nada: el hero sigue con su fondo CSS.

const VERTEX = `
attribute vec4 aSemilla;   // x: z inicial (0-1) · y: semilla · z: magnitud · w: destello (0/1)
attribute vec4 aColor;     // rgb: color de la estrella · a: 0 = campo lejano, 1 = campo cercano
uniform float uDist, uTime, uAspect, uFocal, uK, uMaxPx, uDpr, uFade, uRoll;
uniform vec2 uCam;
uniform vec3 uTint;
varying vec3 vCol;
varying float vDest, vPx;
float h1(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  float dNear = 1.4;
  float dFar = mix(52.0, 12.0, aColor.a);
  float tramo = dFar - dNear;
  float s = aSemilla.x * tramo + uDist;
  float ciclo = floor(s / tramo);
  float z = fract(s / tramo);
  float prof = dFar - z * tramo;
  // Al pasar la cámara, la estrella renace al fondo en otra posición (hash del número de ciclo)
  vec2 xy = vec2(h1(aSemilla.y * 17.13 + ciclo * 3.71), h1(aSemilla.y * 29.71 + ciclo * 7.13)) * 2.0 - 1.0;
  xy *= vec2(dFar * max(uAspect, 1.0), dFar * max(1.0 / uAspect, 1.0)) * 1.05;
  xy -= uCam;
  float c = cos(uRoll), sn = sin(uRoll);
  xy = mat2(c, sn, -sn, c) * xy;
  // Perspectiva sin matrices: la profundidad va en w y la GPU divide
  gl_Position = vec4(xy.x * uFocal / uAspect, xy.y * uFocal, 0.0, prof);
  float mag = aSemilla.z;
  float px = uK * 0.05 * (0.5 + mag) / prof;
  px *= mix(1.0, 1.45, aColor.a) * mix(1.0, 2.8, aSemilla.w);
  float minPx = 1.6 * uDpr;
  float energia = min(1.0, px / minPx);
  vPx = clamp(px, minPx, uMaxPx);
  gl_PointSize = vPx;
  float fade = smoothstep(0.0, 0.16, z) * smoothstep(dNear, dNear + 1.6, prof);
  float tw = 0.78 + 0.22 * sin(uTime * (0.9 + fract(aSemilla.y * 7.3) * 2.4) + aSemilla.y * 6.2831);
  vCol = mix(aColor.rgb, aColor.rgb * uTint * 1.1, 0.3) * (0.5 + 0.9 * mag) * fade * tw * energia * uFade * 1.6;
  vDest = aSemilla.w;
}`;

const FRAGMENT = `
precision mediump float;
uniform vec2 uResPx;
varying vec3 vCol;
varying float vDest, vPx;
// Atenúa las estrellas en la columna central, donde está el texto (0,45 en el centro → 1 a los lados)
float zonaTexto(){ return mix(0.45, 1.0, smoothstep(0.16, 0.4, abs(gl_FragCoord.x / uResPx.x - 0.5))); }
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float k = mix(1.0, 2.8, vDest);
  float rr = r2 * k * k;
  float nucleo = exp(-rr * 16.0);
  float halo = exp(-sqrt(rr) * 4.2) * 0.42 * (1.0 - r2);
  float rayos = 0.0;
  if (vDest > 0.5){
    vec2 a = abs(c);
    float w = vPx * 0.55;
    rayos = (exp(-a.x * w) * pow(1.0 - a.y, 3.0) + exp(-a.y * w) * pow(1.0 - a.x, 3.0)) * 0.6;
    rayos *= smoothstep(10.0, 28.0, vPx);
  }
  vec3 col = vCol * (nucleo + halo + rayos) * zonaTexto();
  // Alfa premultiplicado = brillo: sobre el lienzo transparente se suma a lo que hay detrás
  gl_FragColor = vec4(col, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
}`;

// Nebulosa: nubes de gas con ruido fractal (fbm de 5 octavas + domain warping) en una banda diagonal,
// con un brillo cálido donde se cruzan y filamentos de polvo. Se pinta a media resolución en una
// textura (es suave y así cuesta 4 veces menos). Guarda en alfa la cantidad de polvo.
const VERTEX_TRI = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT_NEBULOSA = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uCam;
uniform vec3 uA, uB, uC;
varying vec2 vUv;
float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ s += a * n(p); p = m * p; a *= 0.5; }
  return s;
}
void main(){
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  p += uCam * 0.035;
  float t = uTime * 0.012;
  vec2 q = vec2(fbm(p * 1.4 + vec2(0.0, t)), fbm(p * 1.4 + vec2(5.2, 1.3) - t));
  float d  = fbm(p * 1.2 + q * 1.8 + vec2(t * 0.6, 0.0));
  float d2 = fbm(p * 2.4 - q * 1.3 + 3.1);
  float band = exp(-pow((p.y + p.x * 0.38 - 0.04) * 2.1, 2.0));
  float cloud = smoothstep(0.26, 0.7, d) * (0.22 + 0.78 * band);
  float glow  = smoothstep(0.36, 0.7, d2) * band;
  float dust  = smoothstep(0.53, 0.68, fbm(p * 3.4 + q * 2.4 + 7.0)) * band;
  // Solo la luz que se suma al fondo nocturno del hero (el fondo lo pone el CSS)
  vec3 col = uA * band * 0.1;
  col += uA * cloud * 1.15;
  col += uB * glow * cloud * 1.25;
  col += uC * pow(cloud * glow, 1.8) * 0.9;
  col *= 1.0 - dust * 0.62;
  gl_FragColor = vec4(col, dust);
}`;

// Compuesto: la nebulosa escalada + tres rejillas de estrellas diminutas que titilan, se desplazan
// solo unos píxeles con el cursor, son más densas donde la nebulosa brilla y se apagan tras el polvo.
const FRAGMENT_COMPUESTO = `
precision highp float;
uniform sampler2D uNeb;
uniform float uTime, uDpr, uFade, uNebGain;
uniform vec2 uResPx;
uniform vec2 uCam;
uniform vec3 uTint;
varying vec2 vUv;
float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// Atenúa las estrellas en la columna central, donde está el texto (0,45 en el centro → 1 a los lados)
float zonaTexto(){ return mix(0.45, 1.0, smoothstep(0.16, 0.4, abs(gl_FragCoord.x / uResPx.x - 0.5))); }
float capa(vec2 px, float celda, float umbral, float semilla){
  vec2 g = px / celda, i = floor(g), f = fract(g);
  float r = h(i + semilla);
  if (r < umbral) return 0.0;
  vec2 c = vec2(h(i + 7.1 + semilla), h(i + 3.3 + semilla)) * 0.8 + 0.1;
  float d = length(f - c) * celda;
  float b = (r - umbral) / (1.0 - umbral);
  float tw = 0.65 + 0.35 * sin(uTime * (1.2 + r * 3.0) + r * 91.0);
  return smoothstep(1.15, 0.0, d) * (0.25 + 0.75 * b) * tw;
}
void main(){
  vec4 neb = texture2D(uNeb, vUv);
  vec3 col = neb.rgb * uNebGain;
  vec2 px = gl_FragCoord.xy / uDpr;
  float lum = dot(neb.rgb, vec3(0.3, 0.5, 0.2));
  float s = capa(px + uCam * 4.0, 5.0, 0.955 - lum * 0.5, 0.0) * 0.6
          + capa(px + uCam * 9.0, 11.0, 0.92 - lum * 0.2, 17.0) * 0.85
          + capa(px + uCam * 2.0, 3.0, 0.975 - lum * 0.6, 31.0) * 0.45;
  col += mix(vec3(1.0), uTint, 0.35) * s * (1.0 - neb.a * 0.85) * 1.9 * zonaTexto();
  col *= uFade;
  gl_FragColor = vec4(col, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
}`;

// Temperatura de color de las estrellas (azul, blanco azulado, blanco cálido, amarillo, naranja)
const COLORES = [
  [0.66, 0.78, 1.0],
  [0.86, 0.9, 1.0],
  [1.0, 0.96, 0.9],
  [1.0, 0.86, 0.66],
  [1.0, 0.72, 0.5],
];
// Nebulosa en tonos de la marca: índigo, violeta y un brillo cálido muy claro donde se cruzan
const NEB_A = [0.231, 0.247, 0.659]; // #3b3fa8
const NEB_B = [0.541, 0.42, 1.0]; // #8a6bff
const NEB_C = [1.0, 0.851, 0.761]; // #ffd9c2
const TINTE = [0.81, 0.85, 1.0]; // #cfd8ff: vira las estrellas un 30 % hacia el índigo de la marca
const FOCAL = 1.25;
const NEB_GAIN = 0.85; // intensidad de la nebulosa (1 = como la referencia)
const VELOCIDAD = 0.6; // unidades de mundo por segundo

function crearPrograma(gl, vertex, fragment) {
  const p = gl.createProgram();
  for (const [tipo, fuente] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ]) {
    const sh = gl.createShader(tipo);
    gl.shaderSource(sh, fuente);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const nombre = gl.getActiveUniform(p, i).name;
    u[nombre] = gl.getUniformLocation(p, nombre);
  }
  return { p, u };
}

function crearEstrellas(nLejos, nCerca) {
  const n = nLejos + nCerca;
  const datos = new Float32Array(n * 8);
  let semilla = 7;
  const rnd = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const o = i * 8;
    const t = rnd();
    const col = COLORES[t < 0.12 ? 0 : t < 0.55 ? 1 : t < 0.82 ? 2 : t < 0.95 ? 3 : 4];
    const lejana = i < nLejos;
    const u = rnd();
    const mag = lejana ? 0.15 + 2.6 * Math.pow(u, 4.5) : 0.35 + 2.45 * Math.pow(u, 2.2);
    datos[o] = rnd();
    datos[o + 1] = rnd() * 100;
    datos[o + 2] = mag;
    datos[o + 3] = mag > (lejana ? 2.15 : 1.7) ? 1 : 0;
    datos[o + 4] = col[0];
    datos[o + 5] = col[1];
    datos[o + 6] = col[2];
    datos[o + 7] = lejana ? 0 : 1;
  }
  return { datos, n };
}

export default function StarField() {
  const canvasRef = useRef(null);
  const botonRef = useRef(null);
  const motorRef = useRef(null); // { fijarPausa(bool) }
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    const cvs = canvasRef.current;
    const host = cvs?.parentElement;
    if (!cvs || !host) return undefined;

    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const tactil = window.matchMedia?.("(hover: none)").matches ?? false;
    const movil = Math.min(window.innerWidth, window.innerHeight) < 700 || tactil;

    const ocultar = () => {
      cvs.style.display = "none";
      if (botonRef.current) botonRef.current.hidden = true;
    };

    const gl = cvs.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      ocultar();
      return undefined;
    }

    let prog;
    let progFondo;
    let progNeb;
    try {
      prog = crearPrograma(gl, VERTEX, FRAGMENT);
      progNeb = crearPrograma(gl, VERTEX_TRI, FRAGMENT_NEBULOSA);
      progFondo = crearPrograma(gl, VERTEX_TRI, FRAGMENT_COMPUESTO);
    } catch {
      ocultar();
      return undefined;
    }

    // Campo lejano (muchas, pequeñas) + campo cercano (pocas, grandes: el paralaje)
    const { datos, n } = crearEstrellas(movil ? 5200 : 10000, movil ? 420 : 760);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, datos, gl.STATIC_DRAW);
    const locSem = gl.getAttribLocation(prog.p, "aSemilla");
    const locCol = gl.getAttribLocation(prog.p, "aColor");
    const maxPunto = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];

    // Triángulo que cubre toda la pantalla para la capa de fondo
    const tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const locPos = gl.getAttribLocation(progFondo.p, "aPos");
    const locPosNeb = gl.getAttribLocation(progNeb.p, "aPos");

    // Textura de la nebulosa a media resolución (0,4 en móvil), escalada con filtrado lineal
    const texNeb = gl.createTexture();
    const fbo = gl.createFramebuffer();
    let NW = 2;
    let NH = 2;

    let W = 1;
    let H = 1;
    let dpr = 1;
    const redimensionar = () => {
      dpr = Math.min(window.devicePixelRatio || 1, movil ? 1.5 : 2);
      const r = host.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width * dpr));
      H = Math.max(1, Math.round(r.height * dpr));
      cvs.width = W;
      cvs.height = H;
      const escala = movil ? 0.4 : 0.5;
      NW = Math.max(2, Math.round(r.width * escala));
      NH = Math.max(2, Math.round(r.height * escala));
      gl.bindTexture(gl.TEXTURE_2D, texNeb);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NW, NH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texNeb, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    // Estado de la escena
    let tiempo = reducido ? 14 : 0;
    let dist = reducido ? 9 : 0;
    let fundido = reducido ? 1 : 0;
    const cam = { x: 0, y: 0, tx: 0, ty: 0 };
    let ultimoPuntero = -1e9;
    let pausa = false;
    let enPantalla = true;

    const pintar = () => {
      const aspect = W / H;

      // 1 · nebulosa a media resolución en su textura
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, NW, NH);
      gl.disable(gl.BLEND);
      gl.useProgram(progNeb.p);
      gl.uniform2f(progNeb.u.uRes, NW, NH);
      gl.uniform1f(progNeb.u.uTime, tiempo);
      gl.uniform2f(progNeb.u.uCam, cam.x, cam.y);
      gl.uniform3fv(progNeb.u.uA, NEB_A);
      gl.uniform3fv(progNeb.u.uB, NEB_B);
      gl.uniform3fv(progNeb.u.uC, NEB_C);
      gl.bindBuffer(gl.ARRAY_BUFFER, tri);
      gl.enableVertexAttribArray(locPosNeb);
      gl.vertexAttribPointer(locPosNeb, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(locPosNeb);

      // 2 · compuesto en pantalla: nebulosa + estrellas de fondo (casi quietas)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(progFondo.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texNeb);
      gl.uniform1i(progFondo.u.uNeb, 0);
      gl.uniform1f(progFondo.u.uNebGain, NEB_GAIN);
      gl.uniform1f(progFondo.u.uTime, tiempo);
      gl.uniform1f(progFondo.u.uDpr, dpr);
      gl.uniform2f(progFondo.u.uResPx, W, H);
      gl.uniform1f(progFondo.u.uFade, fundido);
      gl.uniform2f(progFondo.u.uCam, cam.x, cam.y);
      gl.uniform3fv(progFondo.u.uTint, TINTE);
      gl.bindBuffer(gl.ARRAY_BUFFER, tri);
      gl.enableVertexAttribArray(locPos);
      gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(locPos);

      // 3 · estrellas 3D que avanzan hacia la cámara
      gl.useProgram(prog.p);
      gl.uniform1f(prog.u.uDist, dist);
      gl.uniform1f(prog.u.uTime, tiempo);
      gl.uniform1f(prog.u.uAspect, aspect);
      gl.uniform1f(prog.u.uFocal, FOCAL);
      gl.uniform1f(prog.u.uK, FOCAL * H * 0.5);
      // Tamaño máximo contenido para que las estrellas cercanas no tapen el contenido del hero
      gl.uniform1f(prog.u.uMaxPx, Math.min(maxPunto, 130 * dpr));
      gl.uniform1f(prog.u.uDpr, dpr);
      gl.uniform2f(prog.u.uResPx, W, H);
      gl.uniform1f(prog.u.uFade, fundido);
      gl.uniform1f(prog.u.uRoll, cam.x * 0.035);
      gl.uniform2f(prog.u.uCam, cam.x * 0.9, cam.y * 0.6);
      gl.uniform3fv(prog.u.uTint, TINTE);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(locSem);
      gl.vertexAttribPointer(locSem, 4, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(locCol);
      gl.vertexAttribPointer(locCol, 4, gl.FLOAT, false, 32, 16);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.disableVertexAttribArray(locSem);
      gl.disableVertexAttribArray(locCol);
      gl.disable(gl.BLEND);
    };

    const paso = (dt) => {
      tiempo += dt;
      fundido = Math.min(1, fundido + dt / 1.8);
      // Sin puntero durante 3,5 s, la cámara deriva sola en una curva de Lissajous
      const quieto = performance.now() - ultimoPuntero > 3500;
      if (quieto) {
        cam.tx = Math.sin(tiempo * 0.13) * 0.55;
        cam.ty = Math.sin(tiempo * 0.21 + 1.3) * 0.4;
      }
      const k = 1 - Math.exp(-dt * (quieto ? 1.2 : 3.2));
      cam.x += (cam.tx - cam.x) * k;
      cam.y += (cam.ty - cam.y) * k;
      dist += dt * VELOCIDAD;
    };

    let raf = 0;
    let ultimo = 0;
    const bucle = (ahora) => {
      raf = 0;
      const dt = ultimo ? Math.min(0.05, (ahora - ultimo) / 1000) : 1 / 60;
      ultimo = ahora;
      paso(dt);
      pintar();
      raf = requestAnimationFrame(bucle);
    };
    // El bucle solo corre si se ve: fuera de pantalla, pestaña oculta, pausa o movimiento reducido → quieto
    const arrancar = () => {
      const toca = !reducido && !pausa && enPantalla && !document.hidden;
      if (toca && !raf) {
        ultimo = 0;
        raf = requestAnimationFrame(bucle);
      }
      if (!toca && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    // El contenido del hero tapa el lienzo, así que el puntero se escucha en la ventana
    const alMover = (e) => {
      if (!enPantalla) return;
      const r = host.getBoundingClientRect();
      cam.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      cam.ty = Math.max(-1, Math.min(1, -(((e.clientY - r.top) / r.height) * 2 - 1)));
      ultimoPuntero = performance.now();
    };
    if (!reducido) window.addEventListener("pointermove", alMover, { passive: true });

    const io = new IntersectionObserver(([entry]) => {
      enPantalla = entry.isIntersecting;
      arrancar();
    });
    io.observe(host);
    document.addEventListener("visibilitychange", arrancar);

    const ro = new ResizeObserver(() => {
      redimensionar();
      if (!raf) pintar();
    });
    ro.observe(host);

    const alPerderContexto = (e) => {
      e.preventDefault();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ocultar();
    };
    cvs.addEventListener("webglcontextlost", alPerderContexto);

    motorRef.current = {
      fijarPausa(valor) {
        pausa = valor;
        if (pausa) {
          fundido = 1;
          pintar();
        }
        arrancar();
      },
    };

    redimensionar();
    if (reducido) {
      if (botonRef.current) botonRef.current.hidden = true;
      pintar(); // un único fotograma fijo, ya con las estrellas colocadas
    } else {
      arrancar();
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", alMover);
      document.removeEventListener("visibilitychange", arrancar);
      cvs.removeEventListener("webglcontextlost", alPerderContexto);
      io.disconnect();
      ro.disconnect();
      motorRef.current = null;
      gl.deleteBuffer(buf);
      gl.deleteBuffer(tri);
      gl.deleteProgram(prog.p);
      gl.deleteProgram(progFondo.p);
      gl.deleteProgram(progNeb.p);
      gl.deleteTexture(texNeb);
      gl.deleteFramebuffer(fbo);
    };
  }, []);

  function alternarPausa() {
    const siguiente = !pausado;
    setPausado(siguiente);
    motorRef.current?.fijarPausa(siguiente);
  }

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-1 h-full w-full" />
      <button
        ref={botonRef}
        type="button"
        onClick={alternarPausa}
        aria-pressed={pausado}
        aria-label={pausado ? "Reanudar el fondo de estrellas" : "Pausar el fondo de estrellas"}
        title={pausado ? "Reanudar el fondo de estrellas" : "Pausar el fondo de estrellas"}
        className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-night/40 text-white/70 backdrop-blur transition-colors hover:border-white/40 hover:text-white"
      >
        {pausado ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </>
  );
}
