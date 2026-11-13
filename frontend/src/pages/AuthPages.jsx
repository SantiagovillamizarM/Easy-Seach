import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { LogoMark } from "../components/Logo.jsx";
import { afterAuthPath, safeNext } from "../components/RequireAuth.jsx";
import Turnstile from "../components/Turnstile.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="hero-mesh flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <LogoMark className="h-10 w-10" />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <p className="mt-6 text-center text-sm text-ink-soft">{footer}</p>
      </div>
    </div>
  );
}

export function Field({ id, label, hint, error, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}</label>
      <input id={id} className="input" aria-invalid={Boolean(error)} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export function PasswordField({ id, label, hint, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}</label>
      <div className="relative">
        <input id={id} className="input pr-10" type={visible ? "text" : "password"} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-soft hover:text-ink"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-closed-bg px-3 py-2 text-sm text-closed">
      {message}
    </p>
  );
}

function SubmitButton({ loading, disabled, children }) {
  return (
    <button type="submit" className="btn-primary w-full py-3" disabled={loading || disabled}>
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Estado del anti-robots: listo si está desactivado o si ya hay token. */
function useCaptcha() {
  const [captcha, setCaptcha] = useState({ enabled: null, token: null });
  const [resetKey, setResetKey] = useState(0);
  return {
    captcha,
    setCaptcha,
    resetKey,
    reset: () => setResetKey((k) => k + 1), // cada token sirve una vez: tras un error se pide otro
    ready: captcha.enabled === false || Boolean(captcha.token),
  };
}

export function LoginPage() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const bot = useCaptcha();

  useEffect(() => {
    document.title = "Iniciar sesión · Easy Search";
  }, []);

  // Al iniciar sesión, esta misma línea redirige (a /verificar si falta confirmar el correo)
  if (user) return <Navigate to={afterAuthPath(user, next)} replace />;

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password, bot.captcha.token);
    } catch (err) {
      setError(err.message);
      bot.reset();
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Bienvenido de nuevo"
      subtitle="Ingresa para buscar, guardar favoritos y ver tu historial."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to={`/registro${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">
            Regístrate
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="email" label="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField id="password" label="Contraseña" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Turnstile onChange={bot.setCaptcha} resetKey={bot.resetKey} />
        <FormError message={error} />
        <SubmitButton loading={loading} disabled={!bot.ready}>Ingresar</SubmitButton>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const bot = useCaptcha();

  useEffect(() => {
    document.title = "Crear cuenta · Easy Search";
  }, []);

  // Recién registrado: va a /verificar a escribir el código que llegó al correo
  if (user) return <Navigate to={afterAuthPath(user, next)} state={{ codeJustSent: true }} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (form.password.length < 8 || !/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(form.password) || !/\d/.test(form.password)) {
      setError("La contraseña debe tener mínimo 8 caracteres, con letras y números.");
      return;
    }
    setLoading(true);
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        captcha_token: bot.captcha.token,
      });
    } catch (err) {
      setError(err.message);
      bot.reset();
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Crea tu cuenta"
      subtitle="Es gratis. Busca negocios con inteligencia artificial, guarda favoritos y vuelve a tus búsquedas."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to={`/ingresar${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="full_name" label="Nombre" autoComplete="name" required maxLength={120} value={form.full_name} onChange={set("full_name")} />
        <Field id="email" label="Correo electrónico" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
        <PasswordField
          id="password"
          label="Contraseña"
          autoComplete="new-password"
          hint="Mínimo 8 caracteres, con letras y números."
          required
          value={form.password}
          onChange={set("password")}
        />
        <PasswordField id="confirm" label="Repite la contraseña" autoComplete="new-password" required value={form.confirm} onChange={set("confirm")} />
        <Turnstile onChange={bot.setCaptcha} resetKey={bot.resetKey} />
        <FormError message={error} />
        <SubmitButton loading={loading} disabled={!bot.ready}>Crear cuenta</SubmitButton>
        <p className="text-center text-xs text-ink-soft">Te enviaremos un código a tu correo para confirmar la cuenta.</p>
      </form>
    </AuthCard>
  );
}
