"use client";

import { useEffect, useState } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import { toast } from "sonner";
import { X, Package, Check, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface ReorderCandidate {
  id: string | number;
  name: string;
  stock: number;
  suggestedQty: number;
  daysRemaining: number;
}

interface Props {
  open: boolean;
  candidates: ReorderCandidate[];
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * ReorderModal — modal para generar una orden de compra a partir de SKUs
 * críticos o con baja cobertura.
 *
 * Usado por el botón "Generar OC" en InventarioCharts (stockout section).
 */
export function ReorderModal({ open, candidates, onClose, onSuccess }: Props) {
  const [selection, setSelection] = useState<Map<string, number>>(new Map());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Preselect all with suggested quantity
    const next = new Map<string, number>();
    candidates.forEach((c) => next.set(String(c.id), c.suggestedQty));
    setSelection(next);
    setNotes("");
  }, [open, candidates]);

  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  function toggleItem(id: string) {
    const next = new Map(selection);
    if (next.has(id)) next.delete(id);
    else {
      const cand = candidates.find((c) => String(c.id) === id);
      next.set(id, cand?.suggestedQty ?? 1);
    }
    setSelection(next);
  }

  function setQty(id: string, qty: number) {
    const next = new Map(selection);
    next.set(id, Math.max(1, Math.round(qty)));
    setSelection(next);
  }

  const totalItems = Array.from(selection.values()).reduce((s, q) => s + q, 0);
  const selectedCount = selection.size;

  async function handleSubmit() {
    if (selectedCount === 0) {
      toast.error("Seleccioná al menos un producto");
      return;
    }
    setSubmitting(true);
    try {
      const items = Array.from(selection.entries()).map(([productId, quantity]) => ({
        productId,
        quantity,
      }));
      const res = await fetch("/api/admin/inventory/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          notes: notes || "Generada desde Inventario · stockout",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.message ?? json.error ?? "Error");
      }
      toast.success("Orden de compra creada", {
        description: `${selectedCount} producto${selectedCount > 1 ? "s" : ""} · ${totalItems} unidades`,
        duration: 3500,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error("No se pudo crear la OC", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="modal-backdrop"
            onClick={onClose}
          />
          <m.div
            key="modal"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className={cn(
              "fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none",
            )}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reorder-title"
              className={cn(
                "pointer-events-auto w-full max-w-2xl max-h-[85vh] flex flex-col",
                "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]",
                "shadow-2xl shadow-black/20",
                "overflow-hidden",
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-[var(--rule-soft)]">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <Package className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Inventario
                    </p>
                    <h2
                      id="reorder-title"
                      className="text-lg font-extrabold text-[var(--text-primary)] leading-tight"
                    >
                      Generar orden de compra
                    </h2>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      Ajusta las cantidades sugeridas y genera la OC borrador.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Items list */}
              <div className="flex-1 overflow-y-auto px-2 py-2">
                {candidates.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[var(--text-tertiary)]">
                    Sin productos críticos detectados.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {candidates.map((c) => {
                      const id = String(c.id);
                      const selected = selection.has(id);
                      const qty = selection.get(id) ?? c.suggestedQty;
                      return (
                        <li key={id}>
                          <label
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors",
                              selected
                                ? "bg-primary/5 border border-primary/20"
                                : "hover:bg-[var(--surface-sunken)] border border-transparent",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleItem(id)}
                              className="h-4 w-4 rounded border-[var(--rule-base)] accent-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                {c.name}
                              </p>
                              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                                Stock: {c.stock} u · Quedan ~{c.daysRemaining}d
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={1}
                                value={qty}
                                disabled={!selected}
                                onChange={(e) => setQty(id, Number(e.target.value))}
                                onClick={(e) => e.preventDefault()}
                                className={cn(
                                  "w-20 px-2 py-1 text-sm font-semibold text-right rounded-md",
                                  "bg-[var(--surface-sunken)] border border-[var(--rule-base)]",
                                  "text-[var(--text-primary)]",
                                  "disabled:opacity-40",
                                  "focus:outline-none focus:ring-2 focus:ring-primary/40",
                                )}
                              />
                              <span className="text-xs text-[var(--text-tertiary)]">u</span>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Notes */}
              <div className="px-6 py-3 border-t border-[var(--rule-soft)]">
                <label className="block text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                  Notas
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: urgente, confirmar precios, etc."
                  className={cn(
                    "w-full px-3 py-2 text-sm rounded-md",
                    "bg-[var(--surface-sunken)] border border-[var(--rule-base)]",
                    "text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
                    "focus:outline-none focus:ring-2 focus:ring-primary/40",
                  )}
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                <div className="text-sm">
                  <span className="text-[var(--text-tertiary)]">Resumen:</span>{" "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {selectedCount} SKU{selectedCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[var(--text-tertiary)]"> · </span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {totalItems.toLocaleString("es-PE")} u
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-semibold rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] border border-[var(--rule-base)] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || selectedCount === 0}
                    className={cn(
                      "inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all",
                      "bg-primary text-white shadow-sm hover:shadow-md",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Generar OC
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
