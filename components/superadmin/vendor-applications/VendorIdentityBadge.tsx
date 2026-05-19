"use client";

/**
 * VendorIdentityBadge — Botón + badge para re-verificar identidad de un
 * vendor (DNI/RUC) contra RENIEC/SUNAT online desde el panel superadmin.
 *
 * Llama POST /api/superadmin/vendor-identity y muestra el resultado visual:
 *   - idle       → botón "Verificar identidad"
 *   - loading    → spinner inline
 *   - verified   → badge verde con razonSocial / fullName
 *   - warning    → badge amarillo (NO HABIDO, name mismatch, soft-pass)
 *   - error      → badge rojo (not_found, formato inválido)
 *
 * El click NO bloquea otras acciones del drawer — todo es opt-in para
 * que el operador decida si la aprobación procede.
 *
 * Audit ref: TD-058 (RENIEC/SUNAT scaffold + endpoint superadmin).
 */
import { useCallback, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Loader2,
  RefreshCw,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "verified"; payload: VerifiedPayload }
  | { kind: "warning"; payload: WarningPayload; raw: unknown }
  | { kind: "error"; message: string };

interface VerifiedPayload {
  type: "DNI" | "RUC";
  /** RUC: razonSocial · DNI: fullName */
  primary: string;
  /** Línea contextual: "ACTIVO + HABIDO" o "Match con propietario" */
  detail: string;
  /** Provider que respondió */
  source: string;
}

interface WarningPayload {
  type: "DNI" | "RUC";
  /** Qué se devolvió pero con caveat (ej "NO HABIDO" o "name mismatch") */
  primary: string;
  detail: string;
  source: string;
}

interface Props {
  dni?: string | null;
  ruc?: string | null;
  /** Nombre del propietario según application — para comparar contra RENIEC */
  ownerName?: string | null;
  /** Optional: callback cuando termina la verificación (telemetría caller) */
  onResult?: (verified: boolean) => void;
}

interface ApiResponseDni {
  type: "DNI";
  ok: boolean;
  fullName?: string | null;
  ownerNameMatches?: boolean | null;
  source: string;
  reason?: string | null;
}

interface ApiResponseRuc {
  type: "RUC";
  ok: boolean;
  invoiceable: boolean;
  razonSocial?: string | null;
  estado?: string | null;
  condicion?: string | null;
  direccion?: string | null;
  source: string;
  reason?: string | null;
}

type ApiResponse = ApiResponseDni | ApiResponseRuc | { error: string };

export function VendorIdentityBadge({ dni, ruc, ownerName, onResult }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const handleVerify = useCallback(async () => {
    if (!dni && !ruc) {
      setState({ kind: "error", message: "Falta DNI/RUC en el application" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/superadmin/vendor-identity", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          dni: dni || undefined,
          ruc: ruc || undefined,
          ownerName: ownerName || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        setState({
          kind: "error",
          message: errJson.error ?? `HTTP ${res.status}`,
        });
        onResult?.(false);
        return;
      }

      const data = (await res.json()) as ApiResponse;
      if ("error" in data) {
        setState({ kind: "error", message: data.error });
        onResult?.(false);
        return;
      }

      if (data.type === "RUC") {
        if (!data.ok) {
          setState({
            kind: "error",
            message:
              data.reason === "not_found"
                ? "RUC no encontrado en SUNAT"
                : data.reason ?? "verificación rechazada",
          });
          onResult?.(false);
          return;
        }
        if (!data.invoiceable) {
          setState({
            kind: "warning",
            payload: {
              type: "RUC",
              primary: data.razonSocial ?? "(sin razón social)",
              detail: `${data.estado ?? "?"} · ${data.condicion ?? "?"} (no apto para facturar)`,
              source: data.source,
            },
            raw: data,
          });
          onResult?.(false);
          return;
        }
        setState({
          kind: "verified",
          payload: {
            type: "RUC",
            primary: data.razonSocial ?? "(sin razón social)",
            detail: `${data.estado ?? "ACTIVO"} · ${data.condicion ?? "HABIDO"}`,
            source: data.source,
          },
        });
        onResult?.(true);
        return;
      }

      // DNI
      if (!data.ok) {
        setState({
          kind: "error",
          message:
            data.reason === "not_found"
              ? "DNI no encontrado en RENIEC"
              : data.reason ?? "verificación rechazada",
        });
        onResult?.(false);
        return;
      }
      // ownerNameMatches puede ser true/false/null.
      // null → no se envió ownerName (consideramos verified).
      // false → mismatch → warning.
      const nameMatchKnown = typeof data.ownerNameMatches === "boolean";
      if (nameMatchKnown && data.ownerNameMatches === false) {
        setState({
          kind: "warning",
          payload: {
            type: "DNI",
            primary: data.fullName ?? "(sin nombre RENIEC)",
            detail: `No coincide con "${ownerName}" — revisar suplantación`,
            source: data.source,
          },
          raw: data,
        });
        onResult?.(false);
        return;
      }
      setState({
        kind: "verified",
        payload: {
          type: "DNI",
          primary: data.fullName ?? "(verificado, sin nombre)",
          detail: nameMatchKnown
            ? "Match con propietario declarado"
            : "Verificado · sin ownerName para comparar",
          source: data.source,
        },
      });
      onResult?.(true);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Error de red",
      });
      onResult?.(false);
    }
  }, [dni, ruc, ownerName, onResult]);

  // ── Render según state ──────────────────────────────────────────────────

  if (state.kind === "idle") {
    return (
      <button
        type="button"
        onClick={handleVerify}
        disabled={!dni && !ruc}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors",
          "text-sm font-semibold",
          dni || ruc
            ? "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-primary)]"
            : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
        )}
        aria-label="Verificar identidad contra RENIEC/SUNAT"
      >
        <ShieldCheck className="h-4 w-4" aria-hidden />
        <span>Verificar identidad</span>
      </button>
    );
  }

  if (state.kind === "loading") {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] text-sm font-semibold text-[var(--text-secondary)]"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>Consultando…</span>
      </div>
    );
  }

  if (state.kind === "verified") {
    return (
      <div
        className="flex flex-col gap-1.5 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-100)]/30 p-3"
        role="status"
        data-testid="identity-verified"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[var(--data-success-500)] shrink-0" aria-hidden />
          <span className="text-sm font-bold text-[var(--data-success-500)]">
            {state.payload.type} verificado en {sourceLabel(state.payload.source)}
          </span>
          <button
            type="button"
            onClick={handleVerify}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            aria-label="Re-verificar"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Re-check
          </button>
        </div>
        <p className="text-sm font-extrabold text-[var(--text-primary)]">
          {state.payload.primary}
        </p>
        <p className="text-xs text-[var(--text-secondary)]">{state.payload.detail}</p>
      </div>
    );
  }

  if (state.kind === "warning") {
    return (
      <div
        className="flex flex-col gap-1.5 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-100)]/30 p-3"
        role="alert"
        data-testid="identity-warning"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-[var(--data-warning-500)] shrink-0" aria-hidden />
          <span className="text-sm font-bold text-[var(--data-warning-500)]">
            {state.payload.type} con advertencia
          </span>
          <button
            type="button"
            onClick={handleVerify}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            aria-label="Re-verificar"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Re-check
          </button>
        </div>
        <p className="text-sm font-extrabold text-[var(--text-primary)]">
          {state.payload.primary}
        </p>
        <p className="text-xs text-[var(--text-secondary)]">{state.payload.detail}</p>
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase tracking-wider">
          Fuente: {sourceLabel(state.payload.source)}
        </p>
      </div>
    );
  }

  // error
  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-100)]/30 p-3"
      role="alert"
      data-testid="identity-error"
    >
      <div className="flex items-center gap-2">
        <ShieldX className="h-5 w-5 text-[var(--data-error-500)] shrink-0" aria-hidden />
        <span className="text-sm font-bold text-[var(--data-error-500)]">
          Verificación rechazada
        </span>
        <button
          type="button"
          onClick={handleVerify}
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          aria-label="Re-intentar"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Reintentar
        </button>
      </div>
      <p className="text-sm font-bold text-[var(--text-primary)]">{state.message}</p>
    </div>
  );
}

function sourceLabel(source: string): string {
  switch (source) {
    case "apisperu":
      return "APIs.net.pe";
    case "decolecta":
      return "Decolecta";
    case "cache":
      return "caché (24h)";
    case "mock":
      return "mock dev";
    default:
      return source;
  }
}
