"use client";

/**
 * StockoutPredictionWidget
 * Dashboard widget para vendor: productos críticos/altos en riesgo de quiebre de stock.
 */

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronDown, Package, RefreshCw, CheckCircle2 } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";

interface PredictionItem {
  id: string;
  productId: string;
  productName: string;
  productImage?: string | null;
  currentStock: number;
  predictedDaysToStockout: number;
  severity: Severity;
  confidence: number;
  computedAt: string;
}

interface Props {
  storeSlug: string;
  /** Clave para plegar el bloque y recordarlo (arranca plegado); sin ella va siempre abierto. */
  plegable?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<"critical" | "high", {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  critical: {
    label: "Critico",
    bgClass: "bg-red-100 dark:bg-red-950/40",
    textClass: "text-[var(--data-error-700)] dark:text-red-400",
    borderClass: "border-red-200 dark:border-red-800",
  },
  high: {
    label: "Alto",
    bgClass: "bg-orange-100 dark:bg-orange-950/40",
    textClass: "text-orange-700 dark:text-orange-400",
    borderClass: "border-orange-200 dark:border-orange-800",
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function StockoutPredictionWidget({ storeSlug, plegable }: Props) {
  const [guardado, setGuardado] = useLocalStorage<boolean>(plegable ?? "inicio:sin-plegar", false);
  const abierto = !plegable || guardado;
  const [items, setItems] = useState<PredictionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchPredictions = useCallback(async () => {
    if (!storeSlug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/marketplace/predictions?storeSlug=${encodeURIComponent(storeSlug)}&severity=critical,high`
      );
      if (!res.ok) {
        // 400/401/403/500 — widget secundario, tratar como sin predicciones
        setItems([]);
        return;
      }
      const json = (await res.json()) as { data: PredictionItem[] };
      setItems(json.data ?? []);
      setLastUpdated(new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [storeSlug]);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await fetch("/api/marketplace/predictions/compute", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ storeSlug }),
      });
      await fetchPredictions();
    } catch {
      setError("No se pudo recalcular. Intenta de nuevo.");
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      {/* Header */}
      <div className={cn("flex min-h-12 items-center justify-between gap-2 px-4 py-2", abierto && "border-b border-[var(--rule-soft)]")}>
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
          {plegable ? (
            <button
              type="button"
              onClick={() => setGuardado(!abierto)}
              aria-expanded={abierto}
              className="flex min-h-12 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Riesgo de quiebre de stock</h2>
              {!loading && !error && (
                <span className="text-sm text-[var(--text-secondary)]">
                  · {items.length === 0 ? "sin riesgo" : `${items.length} en riesgo`}
                </span>
              )}
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform", abierto && "rotate-180")} aria-hidden />
            </button>
          ) : (
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Riesgo de quiebre de stock</h2>
          )}
          {abierto && lastUpdated && (
            <span className="hidden text-sm text-[var(--text-tertiary)] sm:inline">
              · actualizado {lastUpdated}
            </span>
          )}
        </div>
        {abierto && (
          <button
            onClick={handleRecalculate}
            disabled={recalculating || loading}
            aria-label="Recalcular predicciones"
            className={cn(
              "flex h-12 items-center gap-1.5 rounded-lg px-4 text-sm font-bold transition-all",
              "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <RefreshCw className={cn("h-4 w-4", recalculating && "animate-spin")} />
            {recalculating ? "Calculando..." : "Recalcular"}
          </button>
        )}
      </div>

      {/* Body */}
      {abierto && <div className="p-4">
        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-10 w-10 rounded-xl bg-[var(--surface-sunken)] dark:bg-gray-800 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-[var(--surface-sunken)] dark:bg-gray-800 rounded w-2/3" />
                  <div className="h-3 bg-[var(--surface-sunken)] dark:bg-gray-800 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex items-center gap-2 text-sm text-[var(--data-error-600)] dark:text-red-400 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button onClick={fetchPredictions} className="underline font-semibold ml-1">
              Reintentar
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && items.length === 0 && (
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-6 text-center"
          >
            <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-950/30 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Todo bien, no hay productos en riesgo
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Tus stocks estan en niveles seguros
            </p>
          </m.div>
        )}

        {/* Items */}
        {!loading && !error && items.length > 0 && (
          <AnimatePresence>
            <ul className="space-y-2.5" role="list">
              {items.map((item, index) => {
                const sev = item.severity === "critical" || item.severity === "high"
                  ? item.severity
                  : "high";
                const config = SEVERITY_CONFIG[sev];
                return (
                  <m.li
                    key={item.id}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.05 }}
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-xl border",
                      config.bgClass,
                      config.borderClass
                    )}
                  >
                    {/* Imagen del producto */}
                    <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-[var(--surface-sunken)] shrink-0">
                      {item.productImage ? (
                        <Image
                          src={item.productImage}
                          alt={item.productName}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-5 w-5 text-[var(--text-tertiary)]" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-bold truncate", config.textClass)}>
                        {item.productName}
                      </p>
                      <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                        Se acaba en{" "}
                        <strong>{item.predictedDaysToStockout}</strong>{" "}
                        {item.predictedDaysToStockout === 1 ? "dia" : "dias"}
                        {" "}· Stock:{" "}
                        <strong>{item.currentStock}</strong> unid.
                      </p>
                    </div>

                    {/* Badge severidad */}
                    <span
                      className={cn(
                        "shrink-0 px-2 py-0.5 rounded-full text-sm font-bold uppercase",
                        config.bgClass,
                        config.textClass
                      )}
                    >
                      {config.label}
                    </span>
                  </m.li>
                );
              })}
            </ul>
          </AnimatePresence>
        )}
      </div>}
    </div>
  );
}
