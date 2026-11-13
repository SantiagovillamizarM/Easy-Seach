import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

// Verificación anti-robots de Cloudflare Turnstile (gratis). La mayoría de las personas no tiene que hacer
// nada: Cloudflare decide en segundo plano; solo a veces pide marcar una casilla.
//
// onChange({ enabled, token }): enabled = false si el servidor no tiene Turnstile configurado (desarrollo).
// Cada token sirve UNA sola vez: cambia `resetKey` después de un intento fallido para pedir uno nuevo.

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let configPromise = null;
let scriptPromise = null;

function loadConfig() {
  configPromise ??= api.captchaConfig().catch(() => ({ site_key: null }));
  return configPromise;
}

function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("No se pudo cargar la verificación"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function Turnstile({ onChange, resetKey = 0 }) {
  const boxRef = useRef(null);
  const widgetRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let cancelled = false;
    loadConfig().then(async ({ site_key: siteKey }) => {
      if (cancelled) return;
      if (!siteKey) {
        onChangeRef.current({ enabled: false, token: null });
        return;
      }
      onChangeRef.current({ enabled: true, token: null });
      try {
        const turnstile = await loadScript();
        if (cancelled || !boxRef.current) return;
        widgetRef.current = turnstile.render(boxRef.current, {
          sitekey: siteKey,
          language: "es",
          callback: (token) => onChangeRef.current({ enabled: true, token }),
          "expired-callback": () => onChangeRef.current({ enabled: true, token: null }),
          "error-callback": () => onChangeRef.current({ enabled: true, token: null }),
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, []);

  // Después de un intento fallido el token ya se usó: se pide uno nuevo
  useEffect(() => {
    if (resetKey && widgetRef.current && window.turnstile) {
      window.turnstile.reset(widgetRef.current);
      onChangeRef.current({ enabled: true, token: null });
    }
  }, [resetKey]);

  return (
    <div>
      <div ref={boxRef} className="flex min-h-0 justify-center" />
      {failed && (
        <p role="alert" className="mt-2 text-center text-xs text-closed">
          No se pudo cargar la verificación anti-robots. Revisa tu conexión o desactiva bloqueadores y recarga.
        </p>
      )}
    </div>
  );
}
