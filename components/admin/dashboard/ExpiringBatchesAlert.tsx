"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, ChevronRight, Calendar, Package, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
        <Package className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
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
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex-1">
              {batches.length} lote{batches.length > 1 ? "s" : ""} por vencer en los próximos 7 días
            </span>
            <button
              onClick={fetchExpiring}
              disabled={loading}
              title="Actualizar"
              className="h-6 w-6 flex items-center justify-center rounded-lg text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-xs text-red-600 dark:text-red-400">
          {error} —{" "}
          <button onClick={fetchExpiring} className="underline font-medium">
            Reintentar
          </button>
        </div>
      )}

      {/* Lista */}
      {(loading || batches.length > 0) && (
        <div className="rounded-xl border border-gray-100 dark:border-card-border bg-white dark:bg-card overflow-hidden">
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
                    <motion.div
                      key={batch.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-accent/30 transition-colors"
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          isUrgent
                            ? "bg-red-50 dark:bg-red-900/30"
                            : isSoon
                            ? "bg-amber-50 dark:bg-amber-900/30"
                            : "bg-yellow-50 dark:bg-yellow-900/20"
                        )}
                      >
                        <Calendar
                          className={cn(
                            "h-4 w-4",
                            isUrgent
                              ? "text-red-500 dark:text-red-400"
                              : isSoon
                              ? "text-amber-500 dark:text-amber-400"
                              : "text-yellow-600 dark:text-yellow-400"
                          )}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 dark:text-foreground truncate">
                          {batch.product?.name ?? batch.productName}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-muted">
                          Lote {batch.lote} · Vence {fmtDate(batch.expiryDate)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-medium text-gray-600 dark:text-muted">
                          {batch.quantity} {batch.unit}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full",
                            isUrgent
                              ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                              : isSoon
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
                              : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                          )}
                        >
                          {days}d
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
          </div>

          {/* Pie con botón "Ver todos" */}
          {!loading && batches.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-50 dark:border-card-border bg-gray-50/50 dark:bg-surface/30">
              <a
                href="/admin?tab=inventario-almacenes"
                className="flex items-center gap-1 text-xs font-semibold text-[#00B4A6] dark:text-emerald-400 hover:underline"
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
