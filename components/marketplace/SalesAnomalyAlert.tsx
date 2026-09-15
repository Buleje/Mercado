"use client";

/**
 * SalesAnomalyAlert
 * Banner de anomalías de ventas para el dashboard del admin.
 * Auto-poll cada 5 min. Botón "Entendido" llama a acknowledge.
 */

import { useState, useCallback } from "react";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { m, AnimatePresence } from "framer-motion";
import { TrendingDown, TrendingUp, X, AlertCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";
type Direction = "up" | "down";

interface AnomalyItem {
  id: string;
  date: string;
  metric: string;
  expected: number;
  actual: number;
  deltaPct: number;
  severity: Severity;
  direction: Direction;
  acknowledgedAt: string | null;
}

interface Props {
  storeSlug: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMetric(metric: string): string {
  const map: Record<string, string> = {
    daily_revenue: "ventas diarias",
    order_count: "número de pedidos",
    avg_ticket: "ticket promedio",
    product_sales: "ventas de producto",
  };
  return map[metric] ?? metric;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalesAnomalyAlert({ storeSlug }: Props) {
  const [items, setItems] = useState<AnomalyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const fetchAnomalies = useCallback(async () => {
    if (!storeSlug) {
      setLoading(false);
      return;
    }
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(
        `/api/marketplace/anomalies?storeSlug=${encodeURIComponent(storeSlug)}&since=${encodeURIComponent(since)}&severity=critical,high`
      );
      if (!res.ok) {
        setItems([]);
        return;
      }
      const json = (await res.json()) as { data: AnomalyItem[] };
      setItems((json.data ?? []).filter((a) => !a.acknowledgedAt));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [storeSlug]);

  // perf audit: carga inicial + poll con guard de visibilidad (pausa en background).
  useVisiblePolling(fetchAnomalies, POLL_INTERVAL_MS);

  const handleAcknowledge = async (id: string) => {
    setAcknowledging(id);
    try {
      await fetch(`/api/marketplace/anomalies/${encodeURIComponent(id)}/acknowledge`, {
        method: "POST",
        headers: csrfHeaders(),
      });
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch {
      /* silent */
    } finally {
      setAcknowledging(null);
    }
  };

  // Si no hay nada que mostrar, no renderizar el banner
  if (!loading && items.length === 0) return null;

  // Loading skeleton
  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="h-8 w-8 rounded-full bg-[var(--surface-sunken)] shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-[var(--surface-sunken)] rounded w-3/4" />
              <div className="h-3 bg-[var(--surface-sunken)] rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-orange-100 dark:border-orange-900/30">
        <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" />
        <span className="text-sm font-bold text-orange-700 dark:text-orange-400">
          Anomalias de ventas detectadas
        </span>
        <span className="ml-auto text-xs text-orange-600 dark:text-orange-500 font-semibold">
          {items.length} alerta{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Items */}
      <div className="divide-y divide-orange-100 dark:divide-orange-900/20">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const isDown = item.direction === "down";
            const pct = Math.abs(item.deltaPct).toFixed(0);

            return (
              <m.div
                key={item.id}
                initial={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                transition={{ duration: 0.25 }}
                className="flex items-start gap-3 px-4 py-3"
              >
                {/* Icono tendencia */}
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full shrink-0 mt-0.5",
                    isDown
                      ? "bg-red-100 dark:bg-red-950/40"
                      : "bg-green-100 dark:bg-green-950/40"
                  )}
                >
                  {isDown ? (
                    <TrendingDown className="h-4 w-4 text-[var(--data-error-500)]" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  )}
                </div>

                {/* Texto */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] leading-tight">
                    {isDown ? "Bajaste" : "Subiste"} un{" "}
                    <span
                      className={cn(
                        "font-bold",
                        isDown ? "text-[var(--data-error-600)] dark:text-red-400" : "text-green-600 dark:text-green-400"
                      )}
                    >
                      {pct}%
                    </span>{" "}
                    en {formatMetric(item.metric)}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    {formatDate(item.date)} ·{" "}
                    Esperado: {Number(item.expected).toFixed(0)} · Real: {Number(item.actual).toFixed(0)}
                  </p>
                </div>

                {/* Boton entendido */}
                <button
                  onClick={() => handleAcknowledge(item.id)}
                  disabled={acknowledging === item.id}
                  aria-label="Marcar como entendido"
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0",
                    "bg-[var(--surface-raised)] border border-[var(--rule-soft)]",
                    "text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  <X className="h-3 w-3" />
                  Entendido
                </button>
              </m.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
