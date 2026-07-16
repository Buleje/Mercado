"use client";

/**
 * CacaoAlertsBell — campana de alertas en vivo del módulo Cacao (ADR-128 v4).
 * Combina las alertas derivadas de datos (backend: view=alerts) con la alerta
 * de precio de mercado (client: necesita el fetch ICE) y navega a la sub-vista
 * relevante al hacer click. El engranaje abre la config de umbrales.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Settings,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Check,
} from "@buleje/design-system/icons";
import type { CacaoView } from "@/lib/cacao/cacao-views";
import CacaoConfigModal from "./CacaoConfigModal";

interface Alert {
  id: string;
  tipo: string;
  severity: "urgente" | "atencion" | "info";
  title: string;
  detail: string;
  view: string;
}
interface Config {
  precioAlertaPenKg: number | null;
  stockMinimoKg: number | null;
  fermDiasAlerta: number;
  humedadMaxPct: number;
}

const SEV_DOT: Record<string, string> = {
  urgente: "bg-[var(--data-error-500)]",
  atencion: "bg-[var(--data-warning-500)]",
  info: "bg-[var(--data-info-500)]",
};

export default function CacaoAlertsBell({ onNavigate }: { onNavigate: (view: CacaoView) => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [precioMercado, setPrecioMercado] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ra, rm] = await Promise.all([
        fetch("/api/admin/cacao?view=alerts", { credentials: "include" }),
        fetch("/api/admin/cacao/market", { credentials: "include" }).catch((err) => {
          console.warn("[cacao] campana: precio de mercado no disponible", err);
          return null;
        }),
      ]);
      if (ra.ok) {
        const d = await ra.json();
        setAlerts(d.alerts ?? []);
        setConfig(d.config ?? null);
      }
      if (rm && rm.ok) setPrecioMercado((await rm.json())?.pricePenPerKg ?? null);
    } catch {
      /* la campana es best-effort, no rompe el módulo */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Alerta de precio (client): la ref. de mercado supera el objetivo configurado.
  const precioAlerta = useMemo<Alert | null>(() => {
    if (!config?.precioAlertaPenKg || precioMercado == null) return null;
    if (precioMercado < config.precioAlertaPenKg) return null;
    return {
      id: "precio",
      tipo: "precio",
      severity: "info",
      title: `Precio de venta favorable`,
      detail: `La referencia de mercado (S/ ${precioMercado.toFixed(2)}/kg) superó tu objetivo de S/ ${config.precioAlertaPenKg.toFixed(2)}/kg. Buen momento para vender.`,
      view: "mercado",
    };
  }, [config, precioMercado]);

  const all = useMemo(
    () => (precioAlerta ? [precioAlerta, ...alerts] : alerts),
    [precioAlerta, alerts],
  );
  const urgentes = all.filter((a) => a.severity === "urgente").length;
  const count = all.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Alertas${count ? ` (${count})` : ""}`}
        className={`relative inline-flex h-12 items-center gap-2 rounded-2xl border-2 px-3.5 text-sm font-bold transition ${count ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"}`}
      >
        <Bell className="h-4 w-4" />
        <span className="hidden sm:inline">Alertas</span>
        {count > 0 && (
          <span
            className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[length:var(--ts-2xs)] font-bold text-white ${urgentes > 0 ? "bg-[var(--data-error-600)]" : "bg-[var(--data-warning-600)]"}`}
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Bell className="h-4 w-4 text-[var(--accent)]" />
                Alertas{" "}
                {count > 0 && <span className="text-[var(--text-tertiary)]">({count})</span>}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={load}
                  aria-label="Actualizar"
                  className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)]"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TrendingUp className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfig(true);
                    setOpen(false);
                  }}
                  aria-label="Configurar alertas"
                  className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)]"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {count === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[var(--text-tertiary)]">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--data-success-50)] text-[var(--data-success-600)]">
                    <Check className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-medium text-[var(--text-secondary)]">
                    Todo en orden. Sin alertas activas.
                  </p>
                </div>
              ) : (
                all.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      onNavigate(a.view as CacaoView);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-3 border-b border-[var(--rule-soft)] px-4 py-3 text-left transition last:border-0 hover:bg-[var(--surface-sunken)]"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[a.severity]}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                        {a.severity === "urgente" && (
                          <AlertTriangle className="h-3.5 w-3.5 text-[var(--data-error-600)]" />
                        )}
                        {a.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                        {a.detail}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {showConfig && <CacaoConfigModal onClose={() => setShowConfig(false)} onSaved={load} />}
    </div>
  );
}
