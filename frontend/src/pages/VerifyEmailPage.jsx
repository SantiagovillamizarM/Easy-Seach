import { LoaderCircle, MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { safeNext } from "../components/RequireAuth.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { FormError } from "./AuthPages.jsx";

const RESEND_WAIT = 60; // segundos: el servidor permite 1 código por minuto

export default function VerifyEmailPage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const location = useLocation();
  // Si viene de registrarse, el código se acaba de enviar: hay que esperar 1 minuto para pedir otro
  const [wait, setWait] = useState(location.state?.codeJustSent ? RESEND_WAIT : 0);

  useEffect(() => {
    document.title = "Confirma tu correo · Easy Search";
  }, []);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (user.email_verified) return <Navigate to={next} replace />;

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Escribe los 6 números del código.");
      return;
    }
    setLoading(true);
    try {
      updateUser(await api.verifyEmail(code)); // email_verified = true → redirige a "next"
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      const res = await api.resendCode();
      setInfo(res.detail);
      setCode("");
      setWait(RESEND_WAIT);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="hero-mesh flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-6 text-center sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50">
          <MailCheck className="h-7 w-7 text-brand-600" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Confirma tu correo</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {wait > 0 ? "Enviamos" : "Te enviamos"} un código de 6 números a <strong className="text-ink">{user.email}</strong>.
          Escríbelo aquí para empezar a buscar. Si no lo ves, revisa la carpeta de spam o pide uno nuevo.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <label htmlFor="code" className="sr-only">Código de confirmación</label>
          <input
            id="code"
            className="input py-3 text-center text-2xl font-bold tracking-[0.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
          <FormError message={error} />
          {info && <p role="status" className="rounded-xl bg-open-bg px-3 py-2 text-sm text-open">{info}</p>}
          <button type="submit" className="btn-primary w-full py-3" disabled={loading || code.length !== 6}>
            {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar
          </button>
        </form>

        <div className="mt-5 space-y-2 text-sm">
          <button type="button" className="font-semibold text-brand-700 hover:underline disabled:text-ink-soft disabled:no-underline" disabled={wait > 0} onClick={resend}>
            {wait > 0 ? `Reenviar código en ${wait} s` : "Reenviar código"}
          </button>
          <p className="text-ink-soft">
            ¿Correo equivocado?{" "}
            <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => { logout(); navigate("/registro"); }}>
              Crea la cuenta de nuevo
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
