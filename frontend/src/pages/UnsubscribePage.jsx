import { BellOff, CheckCircle2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LogoMark } from "../components/Logo.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

// Página del enlace "Dejar de recibir estos avisos" de los correos. Funciona sin iniciar sesión (el enlace va
// firmado). Pide confirmar con un botón: algunos correos abren los enlaces solos para revisarlos, y dar de baja
// al abrir la página apagaría los avisos sin que la persona lo pidiera.

const KIND_TEXT = {
  resenas: "los correos que te avisan cuando un cliente publica una reseña de tu negocio",
  respuestas: "los correos que te avisan cuando un negocio responde una de tus reseñas",
};

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const { user, updateUser } = useAuth();
  const token = params.get("t") ?? "";
  const kind = token.split(".")[1];
  const [state, setState] = useState({ status: "idle", message: null }); // idle | sending | done | error

  useEffect(() => {
    document.title = "Dejar de recibir avisos · Easy Search";
  }, []);

  async function confirm() {
    setState({ status: "sending", message: null });
    try {
      const res = await api.unsubscribe(token);
      setState({ status: "done", message: res.detail });
      // Si la persona tiene la sesión abierta, su perfil refleja el cambio sin recargar
      if (user) api.me().then(updateUser).catch(() => {});
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  }

  const valid = Boolean(KIND_TEXT[kind]);

  return (
    <div className="hero-mesh flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-6 text-center sm:p-8">
        <LogoMark className="mx-auto h-10 w-10" />
        {state.status === "done" ? (
          <>
            <CheckCircle2 className="mx-auto mt-5 h-10 w-10 text-open" aria-hidden="true" />
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Listo</h1>
            <p role="status" className="mt-2 text-sm text-ink-soft">{state.message}</p>
            <p className="mt-2 text-sm text-ink-soft">Si cambias de opinión, puedes volver a activarlos en Mi perfil.</p>
            <Link to={user ? "/perfil" : "/"} className="btn-primary mt-6">{user ? "Ir a Mi perfil" : "Ir al inicio"}</Link>
          </>
        ) : (
          <>
            <BellOff className="mx-auto mt-5 h-10 w-10 text-brand-600" aria-hidden="true" />
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight">¿Dejar de recibir estos avisos?</h1>
            {valid ? (
              <p className="mt-2 text-sm text-ink-soft">
                Ya no te enviaremos {KIND_TEXT[kind]}. Los correos de seguridad, como los códigos para entrar a tu
                cuenta, seguirán llegando.
              </p>
            ) : (
              <p className="mt-2 text-sm text-closed">
                Este enlace está incompleto. Puedes apagar los avisos desde Mi perfil.
              </p>
            )}
            {state.status === "error" && (
              <p role="alert" className="mt-4 rounded-xl bg-closed-bg px-3 py-2 text-sm text-closed">{state.message}</p>
            )}
            <div className="mt-6 flex flex-col gap-2">
              {valid && (
                <button type="button" className="btn-primary w-full py-3" onClick={confirm} disabled={state.status === "sending"}>
                  {state.status === "sending" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Sí, dejar de recibirlos
                </button>
              )}
              <Link to={user ? "/perfil" : "/"} className="btn-ghost w-full">
                {valid ? "No, seguir recibiéndolos" : user ? "Ir a Mi perfil" : "Ir al inicio"}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
