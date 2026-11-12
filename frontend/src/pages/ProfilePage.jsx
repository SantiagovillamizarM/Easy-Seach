import { CheckCircle2, KeyRound, LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { Field, FormError, PasswordField } from "./AuthPages.jsx";

const ROLE_LABELS = { user: "Usuario", owner: "Propietario de negocio", admin: "Administrador" };

function Success({ message }) {
  if (!message) return null;
  return (
    <p role="status" className="flex items-center gap-2 rounded-xl bg-open-bg px-3 py-2 text-sm text-open">
      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      {message}
    </p>
  );
}

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user.full_name);
  const [nameState, setNameState] = useState({ loading: false, error: null, ok: null });
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [pwState, setPwState] = useState({ loading: false, error: null, ok: null });

  useEffect(() => {
    document.title = "Mi perfil · Easy Search";
  }, []);

  async function saveName(e) {
    e.preventDefault();
    setNameState({ loading: true, error: null, ok: null });
    try {
      updateUser(await api.updateMe({ full_name: name }));
      setNameState({ loading: false, error: null, ok: "Nombre actualizado." });
    } catch (err) {
      setNameState({ loading: false, error: err.message, ok: null });
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    if (pw.new_password !== pw.confirm) {
      setPwState({ loading: false, error: "Las contraseñas nuevas no coinciden.", ok: null });
      return;
    }
    setPwState({ loading: true, error: null, ok: null });
    try {
      await api.changePassword({ current_password: pw.current_password, new_password: pw.new_password });
      setPw({ current_password: "", new_password: "", confirm: "" });
      setPwState({ loading: false, error: null, ok: "Contraseña actualizada." });
    } catch (err) {
      setPwState({ loading: false, error: err.message, ok: null });
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-xl font-extrabold text-white">
          {user.full_name.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{user.full_name}</h1>
          <p className="text-sm text-ink-soft">
            {user.email} · {ROLE_LABELS[user.role] ?? user.role} · Desde{" "}
            {new Date(user.created_at).toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-bold">
          <UserRound className="h-4 w-4 text-brand-600" aria-hidden="true" />
          Datos personales
        </h2>
        <form onSubmit={saveName} className="space-y-4">
          <Field id="profile-name" label="Nombre" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          <Field id="profile-email" label="Correo electrónico" value={user.email} disabled hint="El correo no se puede cambiar." />
          <FormError message={nameState.error} />
          <Success message={nameState.ok} />
          <button type="submit" className="btn-primary" disabled={nameState.loading || name.trim() === user.full_name}>
            Guardar cambios
          </button>
        </form>
      </section>

      <section className="card mt-5 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-bold">
          <KeyRound className="h-4 w-4 text-brand-600" aria-hidden="true" />
          Cambiar contraseña
        </h2>
        <form onSubmit={savePassword} className="space-y-4">
          <PasswordField
            id="current_password"
            label="Contraseña actual"
            autoComplete="current-password"
            required
            value={pw.current_password}
            onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))}
          />
          <PasswordField
            id="new_password"
            label="Nueva contraseña"
            autoComplete="new-password"
            hint="Mínimo 8 caracteres, con letras y números."
            required
            value={pw.new_password}
            onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))}
          />
          <PasswordField
            id="confirm_password"
            label="Repite la nueva contraseña"
            autoComplete="new-password"
            required
            value={pw.confirm}
            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
          />
          <FormError message={pwState.error} />
          <Success message={pwState.ok} />
          <button type="submit" className="btn-primary" disabled={pwState.loading || !pw.current_password || !pw.new_password}>
            Actualizar contraseña
          </button>
        </form>
      </section>

      <button
        type="button"
        className="btn-ghost mt-6 text-closed"
        onClick={() => {
          logout();
          navigate("/");
        }}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Cerrar sesión
      </button>
    </div>
  );
}
