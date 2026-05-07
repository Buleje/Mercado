"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, UserPlus } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

interface Props {
  token: string;
}

interface Invite {
  name: string;
  role: string;
  tenantId: string;
}

const ROLE_LABEL: Record<string, string> = {
  cajero: "Cajero",
  almacenero: "Almacenero",
  manager: "Encargado / Manager",
  admin: "Administrador",
};

export default function AcceptInviteClient({ token }: Props) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invitations/${token}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Invitación inválida");
        } else {
          setInvite(data);
        }
      } catch {
        setError("Error de red.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener mínimo 8 caracteres");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos crear tu cuenta");
        return;
      }
      setDone(true);
    } catch {
      setError("Error de red. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)]">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (error && !invite) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] p-6">
        <div className="max-w-md w-full rounded-2xl border-2 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-6 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-[var(--data-error-600)] dark:text-red-400" />
          <h1 className="mt-3 text-xl font-extrabold text-red-800 dark:text-red-200">
            {error}
          </h1>
          <p className="mt-2 text-sm text-[var(--data-error-500)]/80 dark:text-red-300/80">
            Pedile al administrador que te envíe una nueva invitación.
          </p>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] p-6">
        <div className="max-w-md w-full rounded-2xl border-2 border-emerald-300 dark:border-[var(--data-success-700)] bg-emerald-50 dark:bg-emerald-950/30 p-6 text-center">
          <CheckCircle2 className="h-14 w-14 mx-auto text-[var(--data-success-600)] dark:text-emerald-400" strokeWidth={2.25} />
          <h1 className="mt-3 text-xl font-extrabold text-emerald-800 dark:text-emerald-200">
            ¡Cuenta creada!
          </h1>
          <p className="mt-2 text-sm text-[var(--data-success-500)]/80 dark:text-emerald-300/80">
            Ya podés ingresar al panel admin con tu usuario y contraseña.
          </p>
          <a
            href="/admin"
            className="mt-5 inline-flex items-center justify-center w-full h-12 rounded-xl bg-[var(--data-success-600)] text-white text-base font-extrabold shadow-md hover:bg-[var(--data-success-700)]"
          >
            Ir al panel
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 shadow-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center">
            <UserPlus className="h-6 w-6 text-[var(--accent)]" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-[var(--text-primary)]">
              Hola, {invite?.name}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Te invitaron como <strong>{ROLE_LABEL[invite?.role ?? ""] ?? invite?.role}</strong>
            </p>
          </div>
        </div>

        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Creá tu usuario y contraseña para acceder al panel.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="invite-username" className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Usuario
            </label>
            <input
              id="invite-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              required
              minLength={3}
              maxLength={40}
              pattern="[a-zA-Z0-9._-]+"
              placeholder="ej: pedro.cajero"
              className="w-full h-12 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-bold text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
            />
          </div>

          <div>
            <label htmlFor="invite-password" className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Contraseña
            </label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={80}
              className="w-full h-12 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-bold text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
            />
          </div>

          <div>
            <label htmlFor="invite-confirm" className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Confirmar contraseña
            </label>
            <input
              id="invite-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              className="w-full h-12 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-bold text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-semibold text-[var(--data-error-700)] dark:text-red-300">
              <AlertTriangle className="inline h-4 w-4 mr-1.5 mb-0.5" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-extrabold text-white shadow-md disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
            Crear cuenta
          </button>
        </form>
      </div>
    </main>
  );
}
