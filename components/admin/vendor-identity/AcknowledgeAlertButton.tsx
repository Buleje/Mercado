"use client";

/**
 * AcknowledgeAlertButton — Botón "Voy a regularizar" para alertas de
 * identidad vendor. Al click despliega selector de plazo (3/7/14 días)
 * + textarea para razón opcional → POST /api/me/vendor-identity-acknowledge.
 *
 * Mientras el grace está activo, el cron diario NO crea nuevas notifications
 * ni envía WA/email para ESE vendor+kind. El admin trabaja en regularizar
 * con SUNAT/RENIEC sin recibir spam.
 *
 * Audit ref: TD-058 capa 8 — self-service para reducir noise.
 */
import { useState, useCallback } from "react";
import { ShieldCheck, Loader2, Calendar, Check, X } from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

const VALID_DAYS = [3, 7, 14] as const;
type ValidDays = (typeof VALID_DAYS)[number];

type State =
  | { kind: "idle" }
  | { kind: "open"; days: ValidDays; reason: string }
  | { kind: "submitting" }
  | { kind: "success"; until: string }
  | { kind: "error"; message: string };

interface Props {
  vendorId: string;
  alertKind: "ruc-changed" | "ruc-not-found" | "dni-not-found";
  /** Callback al acknowledgar — útil para refetch del listado */
  onAcknowledged?: (until: string) => void;
}

export function AcknowledgeAlertButton({
  vendorId,
  alertKind,
  onAcknowledged,
}: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = useCallback(async () => {
    if (state.kind !== "open") return;
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/me/vendor-identity-acknowledge", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          vendorId,
          kind: alertKind,
          graceDays: state.days,
          ...(state.reason.trim() ? { reason: state.reason.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        setState({
          kind: "error",
          message: errJson.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const data = (await res.json()) as { grace: { until: string } };
      setState({ kind: "success", until: data.grace.until });
      onAcknowledged?.(data.grace.until);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Error de red",
      });
    }
  }, [state, vendorId, alertKind, onAcknowledged]);

  if (state.kind === "idle") {
    return (
      <button
        type="button"
        onClick={() => setState({ kind: "open", days: 7, reason: "" })}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-sm font-semibold text-[var(--text-primary)] transition-colors"
      >
        <ShieldCheck className="h-4 w-4" aria-hidden />
        Voy a regularizar
      </button>
    );
  }

  if (state.kind === "submitting") {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] text-sm font-semibold text-[var(--text-secondary)]"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Guardando…
      </div>
    );
  }

  if (state.kind === "success") {
    const untilFmt = new Date(state.until).toLocaleDateString("es-PE", {
      day: "numeric",
      month: "short",
    });
    return (
      <div
        className="flex items-center gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-100)]/30 p-3"
        role="status"
        data-testid="grace-success"
      >
        <Check className="h-5 w-5 text-[var(--data-success-500)] shrink-0" aria-hidden />
        <p className="text-sm font-bold text-[var(--text-primary)]">
          Listo. No te notificaremos sobre esta alerta hasta el {untilFmt}.
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-100)]/30 p-3"
        role="alert"
        data-testid="grace-error"
      >
        <X className="h-5 w-5 text-[var(--data-error-500)] shrink-0" aria-hidden />
        <p className="text-sm font-bold text-[var(--text-primary)]">{state.message}</p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="ml-auto text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          Cerrar
        </button>
      </div>
    );
  }

  // state.kind === "open" — formulario
  return (
    <div
      className="space-y-3 rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-canvas)] p-4"
      data-testid="grace-form"
    >
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-[var(--accent)]" aria-hidden />
        <p className="text-sm font-bold text-[var(--text-primary)]">
          ¿En cuántos días vas a regularizar?
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {VALID_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setState({ ...state, days: d })}
            className={cn(
              "py-2 rounded-lg border-2 text-sm font-bold transition-colors",
              state.days === d
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]",
            )}
          >
            {d} días
          </button>
        ))}
      </div>
      <div>
        <label
          htmlFor="grace-reason"
          className="block text-xs font-semibold text-[var(--text-tertiary)] mb-1"
        >
          Razón (opcional)
        </label>
        <textarea
          id="grace-reason"
          rows={2}
          value={state.reason}
          onChange={(e) => setState({ ...state, reason: e.target.value })}
          maxLength={280}
          placeholder='Ej: "Cita en SUNAT el lunes" o "Documento en trámite"'
          className="w-full px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none resize-none"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="px-3 py-2 rounded-lg text-sm font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)] hover:opacity-90 text-sm font-bold text-white transition-opacity"
        >
          <Check className="h-4 w-4" aria-hidden />
          Confirmar
        </button>
      </div>
    </div>
  );
}
