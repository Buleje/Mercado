"use client";

/**
 * /admin/login/2fa — Verificación TOTP de segundo factor.
 *
 * Flujo:
 *  1. El backend /api/auth/login devolvió { requires2FA: true } y seteó
 *     la cookie `pending-totp` automáticamente.
 *  2. Esta página pide el código de 6 dígitos al usuario.
 *  3. Envía POST /api/auth/totp/verify con CSRF.
 *  4. Si ok → redirige a admin (respetando ?from=) o /admin.
 *  5. Si error → limpia el input y muestra mensaje para reintentar.
 *
 * Estados manejados: loading · error · empty · auto-submit a los 6 dígitos.
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, AlertTriangle, KeyRound } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

export default function TwoFactorPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);

  // Auto-focus al montar
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Efecto shake al mostrar error
  useEffect(() => {
    if (error) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 480);
      return () => clearTimeout(t);
    }
  }, [error]);

  // Auto-submit al completar 6 dígitos
  useEffect(() => {
    if (code.length === 6 && !loading) {
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length !== 6 || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfHeaders() as Record<string, string>),
        },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Código inválido");
      }

      const data = (await res.json().catch(() => ({}))) as { mustChangePassword?: boolean };
      // ADR-133 follow-up: si el superadmin reseteó la clave, forzar cambio
      // también tras el 2FA (no solo en el login directo).
      if (data.mustChangePassword) {
        router.push("/admin/cambiar-clave");
        return;
      }

      // Respetar ?from= para redirigir al destino original post-login
      const params = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      const from = params.get("from");
      router.push(from ? decodeURIComponent(from) : "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCode(""); // Limpiar para reintentar
      // Re-focus para que el usuario pueda escribir inmediatamente
      setTimeout(() => inputRef.current?.focus(), 0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center px-4">
      <div
        className={[
          "w-full max-w-sm bg-[var(--surface-base)] dark:bg-[var(--color-card)]",
          "rounded-2xl shadow-lg border border-[var(--rule-soft)]",
          "p-7 space-y-5",
          shaking ? "animate-[shake_0.45s_ease-out]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className="inline-flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, var(--accent) 0%, var(--data-success-600) 100%)",
              boxShadow:
                "0 12px 32px -8px color-mix(in oklab, var(--accent) 40%, transparent)",
            }}
          >
            <ShieldCheck className="h-7 w-7 text-white" strokeWidth={2.25} />
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
              Verificación en dos pasos
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
              Ingresá el código de 6 dígitos de tu app autenticadora.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="space-y-4" noValidate>
          {/* Input OTP */}
          <div className="relative">
            <KeyRound
              className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
              strokeWidth={2}
              aria-hidden
            />
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className={[
                "w-full h-14 pl-10 pr-4 rounded-xl border-2 text-center text-2xl font-bold",
                "tracking-wider bg-[var(--surface-canvas)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-tertiary)] placeholder:tracking-wider",
                "outline-none transition-all",
                error
                  ? "border-[var(--data-error-500)] focus:ring-4 focus:ring-[var(--data-error-500)]/15"
                  : "border-[var(--rule-base)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15",
              ]
                .filter(Boolean)
                .join(" ")}
              placeholder="••••••"
              aria-label="Código de 6 dígitos"
              aria-describedby={error ? "totp-error" : undefined}
              aria-invalid={!!error}
              disabled={loading}
              autoComplete="one-time-code"
            />
          </div>

          {/* Error */}
          {error && (
            <div
              id="totp-error"
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/30"
            >
              <AlertTriangle
                className="h-4 w-4 shrink-0 mt-0.5 text-[var(--data-error-500)]"
                strokeWidth={2}
              />
              <p className="text-sm font-semibold text-[var(--data-error-500)]">
                {error}
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={code.length !== 6 || loading}
            className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl text-white text-sm font-extrabold uppercase tracking-[var(--ls-wider)] transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background:
                "linear-gradient(135deg, var(--accent) 0%, var(--data-success-600) 100%)",
              boxShadow:
                "0 12px 24px -8px color-mix(in oklab, var(--accent) 40%, transparent)",
            }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
                Verificar código
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-xs text-[var(--text-tertiary)] text-center">
          ¿Perdiste acceso a tu app?{" "}
          <a
            href="https://wa.me/51929340532?text=Perd%C3%AD%20acceso%20a%20mi%20app%202FA%20de%20Buleje"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-[var(--accent)] hover:underline"
          >
            Contacta al soporte
          </a>
        </p>

        {/* Volver al login */}
        <div className="pt-2 border-t border-[var(--rule-soft)] text-center">
          <a
            href="/admin/login"
            className="text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Volver al inicio de sesion
          </a>
        </div>
      </div>
    </div>
  );
}
