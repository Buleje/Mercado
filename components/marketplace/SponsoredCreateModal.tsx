"use client";

/**
 * SponsoredCreateModal
 * Modal para crear un nuevo boost patrocinado.
 * Validacion Zod en frontend. Submit → POST /api/marketplace/sponsored.
 */

import { useState, useEffect, useId } from "react";
import { X, Loader2, AlertCircle } from "@buleje/design-system/icons";
import { z } from "zod";
import { m as motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Schema Zod ────────────────────────────────────────────────────────────────

const CreateBoostSchema = z.object({
  productId: z.string().min(1, "Selecciona un producto"),
  bidAmount: z
    .number({ error: "Ingresa un valor numerico" })
    .min(1, "Mínimo S/ 1")
    .max(100, "Máximo S/ 100"),
  startDate: z.string().min(1, "Fecha de inicio requerida"),
  endDate: z.string().min(1, "Fecha de fin requerida"),
  maxBudgetPen: z
    .number({ error: "Ingresa un valor numerico" })
    .min(10, "Mínimo S/ 10"),
});

type FormErrors = Partial<Record<keyof z.infer<typeof CreateBoostSchema>, string>>;

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface StoreProduct {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  storeSlug: string;
  storeId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SponsoredCreateModal({
  open,
  onClose,
  onCreated,
  storeSlug,
  storeId,
}: Props) {
  const formId = useId();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [productId, setProductId] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxBudgetPen, setMaxBudgetPen] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Cargar productos del vendor
  useEffect(() => {
    if (!open) return;
    setLoadingProducts(true);
    fetch(`/api/marketplace/stores/${encodeURIComponent(storeSlug)}/products?limit=100`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json: { data: StoreProduct[] }) => setProducts(json.data ?? []))
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [open, storeSlug]);

  // Cerrar con Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const resetForm = () => {
    setProductId("");
    setBidAmount("");
    setStartDate("");
    setEndDate("");
    setMaxBudgetPen("");
    setErrors({});
    setSubmitError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const raw = {
      productId,
      bidAmount: parseFloat(bidAmount),
      startDate,
      endDate,
      maxBudgetPen: parseFloat(maxBudgetPen),
    };

    const parsed = CreateBoostSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const res = await fetch("/api/marketplace/sponsored", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          storeId,
          productId: parsed.data.productId,
          bidAmount: parsed.data.bidAmount,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          maxBudgetPen: parsed.data.maxBudgetPen,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? "Error al crear el boost");
      }
      resetForm();
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  };

  // Fecha minima = hoy
  const today = new Date().toISOString().split("T")[0];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.95, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 24 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-title`}
            className={cn(
              "fixed inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
              "z-50 w-full sm:w-full sm:max-w-lg",
              "rounded-t-3xl sm:rounded-2xl bg-white dark:bg-gray-900",
              "border border-gray-200 dark:border-gray-700 shadow-2xl",
              "max-h-[90vh] overflow-y-auto"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 id={`${formId}-title`} className="text-base font-bold text-gray-900 dark:text-white">
                Nuevo boost patrocinado
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Cerrar modal"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Form */}
            <form id={formId} onSubmit={handleSubmit} noValidate className="px-5 py-5 space-y-4">
              {/* Producto */}
              <div>
                <label htmlFor={`${formId}-product`} className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Producto
                </label>
                <select
                  id={`${formId}-product`}
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  disabled={loadingProducts}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-sm",
                    "bg-white dark:bg-gray-800 text-gray-900 dark:text-white",
                    "outline-none transition-colors",
                    errors.productId
                      ? "border-red-400 dark:border-[var(--data-error-600)] focus:ring-2 focus:ring-red-300"
                      : "border-gray-200 dark:border-gray-700 focus:border-primary focus:ring-2 focus:ring-primary/20"
                  )}
                >
                  <option value="">-- Selecciona un producto --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {errors.productId && (
                  <p className="mt-1 text-xs text-[var(--data-error-500)]">{errors.productId}</p>
                )}
              </div>

              {/* Bid + Budget */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${formId}-bid`} className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    Puja (S/ / 1000 imp.)
                  </label>
                  <input
                    id={`${formId}-bid`}
                    type="number"
                    min={1}
                    max={100}
                    step={0.5}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder="Ej: 5"
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-sm",
                      "bg-white dark:bg-gray-800 text-gray-900 dark:text-white",
                      "outline-none transition-colors",
                      errors.bidAmount
                        ? "border-red-400 dark:border-[var(--data-error-600)]"
                        : "border-gray-200 dark:border-gray-700 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    )}
                  />
                  {errors.bidAmount && (
                    <p className="mt-1 text-xs text-[var(--data-error-500)]">{errors.bidAmount}</p>
                  )}
                </div>
                <div>
                  <label htmlFor={`${formId}-budget`} className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    Presupuesto max. (S/)
                  </label>
                  <input
                    id={`${formId}-budget`}
                    type="number"
                    min={10}
                    step={1}
                    value={maxBudgetPen}
                    onChange={(e) => setMaxBudgetPen(e.target.value)}
                    placeholder="Ej: 100"
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-sm",
                      "bg-white dark:bg-gray-800 text-gray-900 dark:text-white",
                      "outline-none transition-colors",
                      errors.maxBudgetPen
                        ? "border-red-400 dark:border-[var(--data-error-600)]"
                        : "border-gray-200 dark:border-gray-700 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    )}
                  />
                  {errors.maxBudgetPen && (
                    <p className="mt-1 text-xs text-[var(--data-error-500)]">{errors.maxBudgetPen}</p>
                  )}
                </div>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${formId}-start`} className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    Inicio
                  </label>
                  <input
                    id={`${formId}-start`}
                    type="date"
                    min={today}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-sm",
                      "bg-white dark:bg-gray-800 text-gray-900 dark:text-white",
                      "outline-none transition-colors",
                      errors.startDate
                        ? "border-red-400 dark:border-[var(--data-error-600)]"
                        : "border-gray-200 dark:border-gray-700 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    )}
                  />
                  {errors.startDate && (
                    <p className="mt-1 text-xs text-[var(--data-error-500)]">{errors.startDate}</p>
                  )}
                </div>
                <div>
                  <label htmlFor={`${formId}-end`} className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    Fin
                  </label>
                  <input
                    id={`${formId}-end`}
                    type="date"
                    min={startDate || today}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-sm",
                      "bg-white dark:bg-gray-800 text-gray-900 dark:text-white",
                      "outline-none transition-colors",
                      errors.endDate
                        ? "border-red-400 dark:border-[var(--data-error-600)]"
                        : "border-gray-200 dark:border-gray-700 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    )}
                  />
                  {errors.endDate && (
                    <p className="mt-1 text-xs text-[var(--data-error-500)]">{errors.endDate}</p>
                  )}
                </div>
              </div>

              {/* Error global */}
              {submitError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
                  <p className="text-xs text-[var(--data-error-600)] dark:text-red-400">{submitError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Creando..." : "Crear boost"}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
