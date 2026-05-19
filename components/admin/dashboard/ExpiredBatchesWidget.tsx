"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback } from "react";
import {
  AlertOctagon,
  Calendar,
  Package,
  RefreshCw,
  TrendingDown,
  ClipboardList,
  X,
  CheckSquare,
  Square,
  Loader2,
} from "@buleje/design-system/icons";
import { m, AnimatePresence } from "@/components/admin/providers";
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

type MermaReason = "vencimiento" | "deterioro" | "rotura";

interface MermaModalState {
  open: boolean;
  selected: Set<string>;
  reason: MermaReason;
  submitting: boolean;
  toast: { type: "success" | "error"; message: string } | null;
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
  const [modal, setModal] = useState<MermaModalState>({
    open: false,
    selected: new Set(),
    reason: "vencimiento",
    submitting: false,
    toast: null,
  });

  const openModal = () => {
    setModal({
      open: true,
      selected: new Set(batches.map((b) => b.id)),
      reason: "vencimiento",
      submitting: false,
      toast: null,
    });
  };

  const closeModal = () => {
    if (modal.submitting) return;
    setModal((prev) => ({ ...prev, open: false }));
  };

  const toggleBatch = (id: string) => {
    setModal((prev) => {
      const next = new Set(prev.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, selected: next };
    });
  };

  const handleSubmit = async () => {
    const targets = batches.filter((b) => modal.selected.has(b.id));
    if (targets.length === 0) return;

    setModal((prev) => ({ ...prev, submitting: true, toast: null }));

    try {
      const results = await Promise.allSettled(
        targets.map((b) => {
          const productId = b.product?.id ?? b.productId;
          if (!productId) return Promise.reject(new Error(`Sin productId: ${b.lote}`));
          return fetch("/api/mermas", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              productId,
              quantity: b.quantity,
              cause: modal.reason,
              notes: `Lote ${b.lote} — registro desde dashboard`,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.error ?? `Error ${res.status}`);
            }
            return res.json();
          });
        })
      );

      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        const msg = (failures[0] as PromiseRejectedResult).reason?.message ?? "Error desconocido";
        setModal((prev) => ({
          ...prev,
          submitting: false,
          toast: { type: "error", message: `${failures.length} error(es): ${msg}` },
        }));
        return;
      }

      setModal((prev) => ({
        ...prev,
        submitting: false,
        open: false,
        toast: { type: "success", message: `${targets.length} merma(s) registradas correctamente` },
      }));
      await fetchExpired();
    } catch (e) {
      setModal((prev) => ({
        ...prev,
        submitting: false,
        toast: { type: "error", message: e instanceof Error ? e.message : "Error al registrar" },
      }));
    }
  };

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
          <div className="w-6 h-6 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/30 flex items-center justify-center">
            <AlertOctagon className="h-3.5 w-3.5 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" />
          </div>
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            Lotes Vencidos con Stock
          </CardTitle>
        </div>

        {/* Sin vencidos */}
        <div className="flex items-center gap-2 rounded-xl border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] px-4 py-3">
          <Package className="h-4 w-4 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] shrink-0" />
          <span className="text-xs font-medium text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
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
          <div className="w-6 h-6 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/30 flex items-center justify-center">
            <AlertOctagon className="h-3.5 w-3.5 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" />
          </div>
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            Lotes Vencidos con Stock
          </CardTitle>
        </div>
        <button
          onClick={fetchExpired}
          disabled={loading}
          title="Actualizar"
          className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Banner rojo de alerta */}
      <AnimatePresence>
        {!loading && batches.length > 0 && (
          <m.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex items-center gap-3 rounded-xl border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] dark:bg-red-950/20 px-4 py-3"
          >
            <m.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2 }}
            >
              <AlertOctagon className="h-4 w-4 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] shrink-0" />
            </m.div>
            <span className="text-xs font-semibold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] flex-1">
              {batches.length} lote{batches.length > 1 ? "s" : ""} vencido
              {batches.length > 1 ? "s" : ""} con stock disponible
            </span>
            {hasCostData && (
              <span className="text-xs font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] shrink-0">
                Pérdida potencial: {fmtCurrency(totalLoss)}
              </span>
            )}
          </m.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] dark:bg-red-950/20 px-4 py-3 text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
          {error} —{" "}
          <button onClick={fetchExpired} className="underline font-medium">
            Reintentar
          </button>
        </div>
      )}

      {/* Tabla compacta */}
      {(loading || batches.length > 0) && (
        <div className="rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
          {/* Cabecera de tabla */}
          {!loading && batches.length > 0 && (
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 bg-gray-50 dark:bg-surface/40 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] dark:text-muted">
                Producto
              </span>
              <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] dark:text-muted text-right">
                Vencimiento
              </span>
              <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] dark:text-muted text-right">
                Cantidad
              </span>
              <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] dark:text-muted text-right">
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
                    <m.div
                      key={batch.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--data-error-50)]/40 dark:hover:bg-red-950/10 transition-colors"
                    >
                      {/* Icono */}
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          isVeryOld
                            ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/40"
                            : isOld
                            ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/30"
                            : "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20"
                        )}
                      >
                        <TrendingDown
                          className={cn(
                            "h-4 w-4",
                            isVeryOld
                              ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                              : isOld
                              ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                              : "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                          )}
                        />
                      </div>

                      {/* Producto y lote */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                          {batch.product?.name ?? batch.productName}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted">
                            Lote {batch.lote}
                          </span>
                          <span className="text-gray-200 dark:text-card-border">·</span>
                          <span className="flex items-center gap-0.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted">
                            <Calendar className="h-3 w-3" />
                            {fmtDate(batch.expiryDate)}
                          </span>
                          {lossAmount !== null && (
                            <>
                              <span className="text-gray-200 dark:text-card-border">·</span>
                              <span className="text-[length:var(--ts-xs)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-medium">
                                Pérdida: {fmtCurrency(lossAmount)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Cantidad + badge días vencido */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                          {batch.quantity.toLocaleString("es-PE")}{" "}
                          <span className="font-normal text-[var(--text-tertiary)] dark:text-muted">
                            {batch.unit}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
                            isVeryOld
                              ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/40 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                              : isOld
                              ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                              : "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                          )}
                        >
                          {expired}d vencido
                        </span>
                      </div>
                    </m.div>
                  );
                })}
          </div>

          {/* Pie: botón Registrar merma */}
          {!loading && batches.length > 0 && (
            <div className="px-4 py-2.5 border-t border-[var(--rule-base)] bg-gray-50/50 dark:bg-surface/30 flex items-center justify-between gap-2">
              <a
                href="/admin?tab=inventario-almacenes"
                className="text-xs font-semibold text-primary dark:text-[var(--data-success-500)] hover:underline"
              >
                Ver todos los lotes
              </a>
              <button
                type="button"
                onClick={openModal}
                className="min-h-[44px] min-w-[44px] flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold
                  bg-[var(--data-error-50)] dark:bg-red-950/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]
                  border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/50
                  hover:bg-[var(--data-error-100)] dark:hover:bg-[var(--data-error-500)]/40 transition-colors"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Registrar merma
              </button>
            </div>
          )}
        </div>
      )}

      {/* Toast fuera del modal */}
      <AnimatePresence>
        {!modal.open && modal.toast && (
          <m.div
            key="toast"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            onAnimationComplete={() => {
              setTimeout(() => setModal((prev) => ({ ...prev, toast: null })), 3500);
            }}
            className={cn(
              "mt-2 rounded-xl border px-4 py-2.5 text-xs font-medium",
              modal.toast.type === "success"
                ? "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
                : "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
            )}
          >
            {modal.toast.message}
          </m.div>
        )}
      </AnimatePresence>

      {/* Modal de registro de merma */}
      <AnimatePresence>
        {modal.open && (
          <m.div
            key="merma-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 px-4"
            onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          >
            <m.div
              key="merma-modal"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full max-w-md rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] overflow-hidden"
            >
              {/* Cabecera */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" />
                  <SectionTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                    Registrar merma
                  </SectionTitle>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={modal.submitting}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Lista de lotes */}
              <div className="px-5 pt-4 pb-2 space-y-1.5 max-h-56 overflow-y-auto">
                <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] dark:text-muted mb-2">
                  Selecciona los lotes a registrar
                </p>
                {batches.map((b) => {
                  const checked = modal.selected.has(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggleBatch(b.id)}
                      disabled={modal.submitting}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-colors",
                        checked
                          ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] dark:bg-red-950/20"
                          : "border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-gray-50 dark:hover:bg-surface/40"
                      )}
                    >
                      {checked
                        ? <CheckSquare className="h-4 w-4 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] shrink-0" />
                        : <Square className="h-4 w-4 text-[var(--text-tertiary)] dark:text-muted shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                          {b.product?.name ?? b.productName}
                        </p>
                        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted">
                          Lote {b.lote} · {b.quantity} {b.unit}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Motivo */}
              <div className="px-5 py-3">
                <label className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] dark:text-muted block mb-1.5">
                  Motivo
                </label>
                <select
                  value={modal.reason}
                  onChange={(e) => setModal((prev) => ({ ...prev, reason: e.target.value as MermaReason }))}
                  disabled={modal.submitting}
                  className="w-full rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                >
                  <option value="vencimiento">Vencimiento</option>
                  <option value="deterioro">Deterioro / Daño</option>
                  <option value="rotura">Rotura</option>
                </select>
              </div>

              {/* Toast inline (errores mientras el modal está abierto) */}
              <AnimatePresence>
                {modal.toast && modal.open && (
                  <m.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-5 pb-2"
                  >
                    <div className="rounded-xl border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] dark:bg-red-950/20 px-3 py-2 text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
                      {modal.toast.message}
                    </div>
                  </m.div>
                )}
              </AnimatePresence>

              {/* Acciones */}
              <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={modal.submitting}
                  className="min-h-[44px] px-4 rounded-lg text-xs font-semibold text-[var(--text-secondary)] dark:text-muted border border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:bg-gray-50 dark:hover:bg-surface/40 transition-colors disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={modal.submitting || modal.selected.size === 0}
                  className="min-h-[44px] px-4 rounded-lg text-xs font-semibold text-white bg-[var(--data-error-500)] dark:bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {modal.submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Confirmar registro ({modal.selected.size})
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
