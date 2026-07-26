"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, Eye, EyeOff } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

/**
 * Cambio de contraseña FORZADO (ADR-133). Se llega acá cuando el login devuelve
 * mustChangePassword=true (el superadmin reseteó la clave con una temporal de un
 * solo uso). El usuario debe setear su propia clave antes de usar el panel.
 */
export default function CambiarClavePage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Misma policy que el server (newPasswordSchema): ≥10 + letra + número/símbolo.
  const strong = next.length >= 10 && /[A-Za-zÁ-ÿ]/.test(next) && /[\d\W_]/.test(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!strong) { setErr("La nueva clave debe tener 10+ caracteres, con letra y número o símbolo."); return; }
    if (next !== confirm) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.ok) { router.push("/admin"); return; }
      const d = await res.json().catch(() => ({}));
      setErr(d.error === "incorrect current password" ? "La contraseña temporal no es correcta." : (d.issues?.[0]?.message ?? "No se pudo cambiar la contraseña."));
    } catch {
      setErr("Error de red. Intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--surface-canvas)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-xl)]">
        <div className="flex items-center gap-3 mb-1">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h1 className="text-lg font-extrabold text-[var(--text-primary)]">Creá tu contraseña</h1>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          Tu acceso se reseteó con una clave temporal. Por seguridad, elegí tu propia contraseña para continuar.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-[var(--text-tertiary)]">Contraseña temporal</span>
            <input
              type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password" required
              className="w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-[var(--text-tertiary)]">Nueva contraseña</span>
            <div className="relative">
              <input
                type={show ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password" required
                className="w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 pr-10 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--accent)]">
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <span className={`mt-1 block text-xs ${next.length === 0 ? "text-[var(--text-tertiary)]" : strong ? "text-[var(--data-success-600,#059669)]" : "text-[var(--data-warning-600,#f0503f)]"}`}>
              {next.length === 0 ? "Mínimo 10 caracteres, con letra y número o símbolo." : strong ? "Contraseña segura ✓" : "Aún débil — sumá largo o un símbolo."}
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-[var(--text-tertiary)]">Repetir nueva contraseña</span>
            <input
              type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password" required
              className="w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          {err && <p className="text-sm font-semibold text-[var(--data-error-600,#dc2626)]">{err}</p>}
          <button type="submit" disabled={busy} className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-bold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
            Guardar y entrar
          </button>
        </form>
      </div>
    </div>
  );
}
