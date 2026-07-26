"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, ChevronRight, Calendar, Package, RefreshCw } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "@/components/admin/providers";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExpiringBatch {
  id: string;
  lote: string;
  productName: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  product?: { id: number; name: string } | null;
}

interface ApiResponse {
  data: ExpiringBatch[];
  days: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntilExpiry(expiryDate: string): number {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diff = expiry.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2.5 animate-pulse">
      <div className="h-8 w-8 rounded-lg bg-gray-200 dark:bg-surface shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-36 bg-gray-200 dark:bg-surface rounded" />
        <div className="h-2.5 w-24 bg-gray-200 dark:bg-surface rounded" />
      </div>
      <div className="h-5 w-16 bg-gray-200 dark:bg-surface rounded-full" />
    </div>
  );
}

// ── Widget principal ──────────────────────────────────────────────────────────

export default function ExpiringBatchesAlert() {
  const [batches, setBatches] = useState<ExpiringBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExpiring = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/batches/expiring?days=7");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json: ApiResponse = await res.json();
      setBatches(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar lotes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpiring();
  }, [fetchExpiring]);

  // Sin alertas y sin carga: no renderizar nada
  if (!loading && !error && batches.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15 px-4 py-3">
        <Package className="h-4 w-4 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] shrink-0" />
        <span className="text-xs font-medium text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
          Sin lotes por vencer en los próximos 7 días
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Banner de alerta */}
      <AnimatePresence>
        {!loading && batches.length > 0 && (
          <m.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3 rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] dark:bg-amber-950/20 px-4 py-3"
          >
            <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] flex-1">
              {batches.length} lote{batches.length > 1 ? "s" : ""} por vencer en los próximos 7 días
            </span>
            <button
              onClick={fetchExpiring}
              disabled={loading}
              title="Actualizar"
              className="h-6 w-6 flex items-center justify-center rounded-lg text-[var(--data-warning-500)] hover:bg-[var(--data-warning-100)] dark:hover:bg-[var(--data-warning-500)]/40 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </m.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] dark:bg-red-950/20 px-4 py-3 text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
          {error} —{" "}
          <button onClick={fetchExpiring} className="underline font-medium">
            Reintentar
          </button>
        </div>
      )}

      {/* Lista */}
      {(loading || batches.length > 0) && (
        <div className="rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
          <div className="divide-y divide-gray-50 dark:divide-card-border">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-4">
                    <SkeletonRow />
                  </div>
                ))
              : batches.map((batch) => {
                  const days = daysUntilExpiry(batch.expiryDate);
                  const isUrgent = days <= 2;
                  const isSoon = days <= 5;

                  return (
                    <m.div
                      key={batch.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-accent/30 transition-colors"
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          isUrgent
                            ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/30"
                            : isSoon
                            ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/30"
                            : "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20"
                        )}
                      >
                        <Calendar
                          className={cn(
                            "h-4 w-4",
                            isUrgent
                              ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                              : isSoon
                              ? "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                              : "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                          )}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                          {batch.product?.name ?? batch.productName}
                        </p>
                        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted">
                          Lote {batch.lote} · Vence {fmtDate(batch.expiryDate)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-medium text-[var(--text-secondary)] dark:text-muted">
                          {batch.quantity} {batch.unit}
                        </span>
                        <span
                          className={cn(
                            "text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full",
                            isUrgent
                              ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/40 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                              : isSoon
                              ? "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/40 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                              : "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                          )}
                        >
                          {days}d
                        </span>
                      </div>
                    </m.div>
                  );
                })}
          </div>

          {/* Pie con botón "Ver todos" */}
          {!loading && batches.length > 0 && (
            <div className="px-4 py-2.5 border-t border-[var(--rule-base)] bg-gray-50/50 dark:bg-surface/30">
              <a
                href="/admin?tab=inventario-almacenes"
                className="flex items-center gap-1 text-xs font-semibold text-primary dark:text-[var(--data-success-500)] hover:underline"
              >
                Ver todos los lotes
                <ChevronRight className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
