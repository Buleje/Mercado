"use client";

/**
 * VendorHealthDashboard — Stats agregados de salud vendor identity (RENIEC/SUNAT).
 *
 * Lee GET /api/superadmin/vendor-health (summary persistido por el cron
 * vendor-identity-recheck) y muestra:
 *   - Health score (% vendors sin alertas)
 *   - KPIs: total · checked · changed · errors
 *   - Tabla de alerts (vendorId, tenantSlug, kind, detail)
 *   - Stale warning si último run >36h
 *
 * Audit ref: TD-058 — UI consume del cron diario.
 */
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  ExternalLink,
  Loader2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryAlert {
  vendorId: string;
  tenantSlug: string | null;
  kind: "ruc-changed" | "ruc-not-found" | "dni-not-found";
  detail: string;
}

interface VendorHealthResponse {
  stale: boolean;
  neverRun: boolean;
  message?: string;
  ageMinutes?: number;
  healthScore?: number;
  alertsByKind?: Record<string, number>;
  summary: {
    lastRunAt: string;
    total: number;
    checked: number;
    changed: number;
    errors: number;
    alerts: SummaryAlert[];
  } | null;
}

const KIND_LABEL: Record<SummaryAlert["kind"], string> = {
  "ruc-changed": "RUC degradado",
  "ruc-not-found": "RUC no encontrado",
  "dni-not-found": "DNI desaparecido",
};

export function VendorHealthDashboard() {
  const [data, setData] = useState<VendorHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/vendor-health", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as VendorHealthResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSummary();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] p-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Cargando salud vendor…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-100)]/30 p-4">
        <p className="text-sm font-bold text-[var(--data-error-500)]">{error}</p>
        <button
          type="button"
          onClick={fetchSummary}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Reintentar
        </button>
      </div>
    );
  }

  if (!data || data.neverRun) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] p-6 text-center">
        <Clock className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" aria-hidden />
        <p className="text-sm font-bold text-[var(--text-primary)]">
          Esperando primer run del cron
        </p>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          {data?.message ?? "Próxima corrida: 07:00 UTC diario."}
        </p>
      </div>
    );
  }

  const { summary, healthScore = 0, alertsByKind = {}, stale, ageMinutes } = data;
  if (!summary) return null;

  const scoreColor =
    healthScore >= 95
      ? "text-[var(--data-success-500)]"
      : healthScore >= 80
      ? "text-[var(--data-warning-500)]"
      : "text-[var(--data-error-500)]";

  return (
    <div className="space-y-6">
      {/* Stale banner */}
      {stale && (
        <div
          className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-100)]/30 p-3 flex items-center gap-2"
          role="alert"
        >
          <ShieldAlert className="h-4 w-4 text-[var(--data-warning-500)]" aria-hidden />
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Último run hace {ageMinutes ? Math.round(ageMinutes / 60) : "?"}h — el
            cron debería correr cada 24h.
          </p>
        </div>
      )}

      {/* Header con score + refresh */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
            Health score
          </p>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-5xl font-black", scoreColor)}>{healthScore}%</span>
            <span className="text-sm text-[var(--text-secondary)]">
              vendors sin alertas
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchSummary}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-sm font-semibold text-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
          Refrescar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total" value={summary.total} />
        <Kpi label="Verificados" value={summary.checked} color="success" />
        <Kpi label="Con cambios" value={summary.changed} color={summary.changed > 0 ? "warning" : "neutral"} />
        <Kpi label="Errores" value={summary.errors} color={summary.errors > 0 ? "error" : "neutral"} />
      </div>

      {/* Alerts breakdown */}
      {summary.alerts.length > 0 && (
        <div>
          <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Tipos de alerta
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_LABEL) as SummaryAlert["kind"][]).map((kind) => {
              const count = alertsByKind[kind] ?? 0;
              if (count === 0) return null;
              return (
                <span
                  key={kind}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--data-warning-100)]/30 border border-[var(--data-warning-500)] text-xs font-bold text-[var(--text-primary)]"
                >
                  <ShieldAlert className="h-3 w-3 text-[var(--data-warning-500)]" aria-hidden />
                  {KIND_LABEL[kind]}: {count}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista de alerts */}
      {summary.alerts.length === 0 ? (
        <div className="rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-100)]/30 p-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[var(--data-success-500)]" aria-hidden />
          <p className="text-sm font-bold text-[var(--text-primary)]">
            Todos los vendors aprobados están al día con RENIEC + SUNAT.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Vendors con alertas ({summary.alerts.length})
          </p>
          <div className="rounded-xl border-2 border-[var(--rule-base)] divide-y divide-[var(--rule-soft)]">
            {summary.alerts.map((a) => (
              <div
                key={a.vendorId}
                className="flex items-start gap-3 p-3 hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <ShieldAlert
                  className={cn(
                    "h-4 w-4 shrink-0 mt-0.5",
                    a.kind === "ruc-not-found"
                      ? "text-[var(--data-error-500)]"
                      : "text-[var(--data-warning-500)]",
                  )}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {KIND_LABEL[a.kind]}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] truncate">{a.detail}</p>
                  {a.tenantSlug && (
                    <a
                      href={`/superadmin/tenants?slug=${a.tenantSlug}`}
                      className="inline-flex items-center gap-1 mt-1 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
                      {a.tenantSlug}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer con timestamp */}
      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-right">
        Último run: {new Date(summary.lastRunAt).toLocaleString("es-PE")}
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  color = "neutral",
}: {
  label: string;
  value: number;
  color?: "neutral" | "success" | "warning" | "error";
}) {
  const colorClass = {
    neutral: "text-[var(--text-primary)]",
    success: "text-[var(--data-success-500)]",
    warning: "text-[var(--data-warning-500)]",
    error: "text-[var(--data-error-500)]",
  }[color];

  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
        {label}
      </p>
      <p className={cn("text-3xl font-black mt-1", colorClass)}>{value}</p>
    </div>
  );
}
