"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertOctagon,
  Calendar,
  Package,
  RefreshCw,
  TrendingDown,
  ClipboardList,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExpiredBatch {
  id: string;
  lote: string;
  productName: string;
  productId?: number;
  quantity: number;
  unit: string;
  expiryDate: string;
  costUnit: number;
  product?: { id: number; name: string } | null;
}

interface ApiResponse {
  data: ExpiredBatch[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysExpired(expiryDate: string): number {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diff = now.getTime() - expiry.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
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

function fmtCurrency(amount: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(amount);
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
      <div className="flex flex-col items-end gap-1">
        <div className="h-4 w-14 bg-gray-200 dark:bg-surface rounded-full" />
        <div className="h-3 w-10 bg-gray-200 dark:bg-surface rounded" />
      </div>
    </div>
  );
}

// ── Widget principal ──────────────────────────────────────────────────────────

export default function ExpiredBatchesWidget() {
  const [batches, setBatches] = useState<ExpiredBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExpired = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/batches/expired");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json: ApiResponse = await res.json();
      setBatches(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar lotes vencidos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpired();
  }, [fetchExpired]);

  // Pérdida potencial total (solo si hay costUnit)
  const totalLoss = batches.reduce(
    (acc, b) => acc + (b.costUnit > 0 ? b.costUnit * b.quantity : 0),
    0
  );
  const hasCostData = batches.some((b) => b.costUnit > 0);

  // ── Estado vacío ─────────────────────────────────────────────────────────
  if (!loading && !error && batches.length === 0) {
    return (
      <div className="space-y-3">
        {/* Encabezado */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
            <AlertOctagon className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
          </div>
          <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">
            Lotes Vencidos con Stock
          </h3>
        </div>

        {/* Sin vencidos */}
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
          <Package className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            No hay lotes vencidos con stock
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
            <AlertOctagon className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
          </div>
          <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">
            Lotes Vencidos con Stock
          </h3>
        </div>
        <button
          onClick={fetchExpired}
          disabled={loading}
          title="Actualizar"
          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Banner rojo de alerta */}
      <AnimatePresence>
        {!loading && batches.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 px-4 py-3"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2 }}
            >
              <AlertOctagon className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            </motion.div>
            <span className="text-xs font-semibold text-red-700 dark:text-red-400 flex-1">
              {batches.length} lote{batches.length > 1 ? "s" : ""} vencido
              {batches.length > 1 ? "s" : ""} con stock disponible
            </span>
            {hasCostData && (
              <span className="text-xs font-bold text-red-700 dark:text-red-400 shrink-0">
                Pérdida potencial: {fmtCurrency(totalLoss)}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-xs text-red-600 dark:text-red-400">
          {error} —{" "}
          <button onClick={fetchExpired} className="underline font-medium">
            Reintentar
          </button>
        </div>
      )}

      {/* Tabla compacta */}
      {(loading || batches.length > 0) && (
        <div className="rounded-xl border border-gray-100 dark:border-card-border bg-white dark:bg-card overflow-hidden">
          {/* Cabecera de tabla */}
          {!loading && batches.length > 0 && (
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 bg-gray-50 dark:bg-surface/40 border-b border-gray-100 dark:border-card-border">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-muted">
                Producto
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-muted text-right">
                Vencimiento
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-muted text-right">
                Cantidad
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-muted text-right">
                Estado
              </span>
            </div>
          )}

          <div className="divide-y divide-gray-50 dark:divide-card-border">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-4">
                    <SkeletonRow />
                  </div>
                ))
              : batches.map((batch) => {
                  const expired = daysExpired(batch.expiryDate);
                  const isVeryOld = expired > 30;
                  const isOld = expired > 7;
                  const lossAmount =
                    batch.costUnit > 0 ? batch.costUnit * batch.quantity : null;

                  return (
                    <motion.div
                      key={batch.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50/40 dark:hover:bg-red-950/10 transition-colors"
                    >
                      {/* Icono */}
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          isVeryOld
                            ? "bg-red-100 dark:bg-red-900/40"
                            : isOld
                            ? "bg-red-50 dark:bg-red-900/30"
                            : "bg-orange-50 dark:bg-orange-900/20"
                        )}
                      >
                        <TrendingDown
                          className={cn(
                            "h-4 w-4",
                            isVeryOld
                              ? "text-red-600 dark:text-red-400"
                              : isOld
                              ? "text-red-500 dark:text-red-400"
                              : "text-orange-500 dark:text-orange-400"
                          )}
                        />
                      </div>

                      {/* Producto y lote */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 dark:text-foreground truncate">
                          {batch.product?.name ?? batch.productName}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-gray-400 dark:text-muted">
                            Lote {batch.lote}
                          </span>
                          <span className="text-gray-200 dark:text-card-border">·</span>
                          <span className="flex items-center gap-0.5 text-[11px] text-gray-400 dark:text-muted">
                            <Calendar className="h-3 w-3" />
                            {fmtDate(batch.expiryDate)}
                          </span>
                          {lossAmount !== null && (
                            <>
                              <span className="text-gray-200 dark:text-card-border">·</span>
                              <span className="text-[11px] text-red-500 dark:text-red-400 font-medium">
                                Pérdida: {fmtCurrency(lossAmount)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Cantidad + badge días vencido */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs font-semibold text-gray-700 dark:text-foreground">
                          {batch.quantity.toLocaleString("es-PE")}{" "}
                          <span className="font-normal text-gray-400 dark:text-muted">
                            {batch.unit}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
                            isVeryOld
                              ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                              : isOld
                              ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                              : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                          )}
                        >
                          {expired}d vencido
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
          </div>

          {/* Pie: botón Registrar merma */}
          {!loading && batches.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-50 dark:border-card-border bg-gray-50/50 dark:bg-surface/30 flex items-center justify-between gap-2">
              <a
                href="/admin?tab=inventario-almacenes"
                className="text-xs font-semibold text-[#2d6a4f] dark:text-emerald-400 hover:underline"
              >
                Ver todos los lotes
              </a>
              <button
                type="button"
                disabled
                title="Próximamente"
                className="min-h-[44px] min-w-[44px] flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold
                  bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400
                  border border-red-200 dark:border-red-800/50
                  opacity-60 cursor-not-allowed select-none"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Registrar merma
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
