"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Package, Check, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { Field } from "@/components/admin/shared/Field";

import { formatNumber } from "@/lib/format";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
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
      toast.error("Selecciona al menos un producto");
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
    <AdminModal
      open={open}
      onClose={onClose}
      title="Generar orden de compra"
      description="Ajusta las cantidades sugeridas y genera la OC borrador."
      icon={Package}
      size="lg"
      claveVentana="inventario-generar-oc"
      footer={
        <ModalFooter
          nota={
            <>
              <span className="text-[var(--text-tertiary)]">Resumen:</span>{" "}
              <span className="font-semibold text-[var(--text-primary)]">
                {selectedCount} SKU{selectedCount !== 1 ? "s" : ""}
              </span>
              <span className="text-[var(--text-tertiary)]"> · </span>
              <span className="font-semibold text-[var(--text-primary)]">
                {formatNumber(totalItems)} u
              </span>
            </>
          }
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={button({ variant: "secondary" })}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selectedCount === 0}
            className={button({ variant: "primary" })}
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
        </ModalFooter>
      }
    >
      <div className="px-2 py-2 sm:px-3">
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
                    aria-label={c.name}
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
                          "w-20 px-2 py-1 text-sm font-semibold text-right rounded-xl",
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
      <div className="border-t border-[var(--rule-soft)] px-5 py-3 sm:px-6">
        <Field
          label="Notas"
          labelClassName="block text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1"
        >
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: urgente, confirmar precios, etc."
            className={cn(
              "w-full px-3 h-10 text-sm rounded-xl",
              "bg-[var(--surface-sunken)] border border-[var(--rule-base)]",
              "text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
              "focus:outline-none focus:ring-2 focus:ring-primary/40",
            )}
          />
        </Field>
      </div>
    </AdminModal>
  );
}
