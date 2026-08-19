"use client";

import { SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState } from "react";
import {
  X, ChevronRight, ChevronLeft, Check,
  Loader2, AlertTriangle, Package,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";

type OCItem = {
  productId: number;
  name: string;
  quantity: number;
  unitCost: number;
  unit: string;
};

interface OCRecepcionModalProps {
  ocId: string;
  /**
   * Nombre del proveedor. El endpoint lo exige (`supplier`, requerido): sin él
   * el POST volvía 400 «Datos inválidos» SIEMPRE, así que este botón nunca
   * llegó a registrar una recepción.
   */
  supplier: string;
  items: OCItem[];
  onComplete: () => void;
  onClose: () => void;
}

/** Los mismos estados que acepta el endpoint y que ya usa Recepción. */
type CondicionItem = "ok" | "dañado" | "vencido" | "faltante";

const CONDICIONES: Array<{ v: CondicionItem; l: string }> = [
  { v: "ok", l: "Bien" },
  { v: "dañado", l: "Dañado" },
  { v: "vencido", l: "Vencido" },
];

type ReceivedItem = {
  productId: number;
  name: string;
  orderedQty: number;
  receivedQty: number;
  unitPrice: number;
  originalPrice: number;
  unit: string;
  noLlego: boolean;
  /** Cómo llegó la mercadería. Lo dañado y lo vencido no entra a stock vendible. */
  condition: CondicionItem;
};

export default function OCRecepcionModal({ ocId, supplier, items, onComplete, onClose }: OCRecepcionModalProps) {
  useScrollLock(true);

  const [step, setStep] = useState(1);
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>(
    items.map((i) => ({
      productId: i.productId,
      name: i.name,
      orderedQty: i.quantity,
      receivedQty: i.quantity,
      unitPrice: i.unitCost,
      originalPrice: i.unitCost,
      unit: i.unit,
      noLlego: false,
      condition: "ok",
    })),
  );
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateItem = (idx: number, patch: Partial<ReceivedItem>) => {
    setReceivedItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, ...patch };
        if (patch.noLlego !== undefined) {
          updated.receivedQty = patch.noLlego ? 0 : item.orderedQty;
        }
        return updated;
      }),
    );
  };

  const totalFactura = receivedItems.reduce(
    (sum, i) => sum + i.receivedQty * i.unitPrice,
    0,
  );

  const itemsConDiferencia = receivedItems.filter(
    (i) => i.receivedQty !== i.orderedQty,
  );

  const itemsRecibidos = receivedItems.filter((i) => i.receivedQty > 0);

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);

    try {
      // El shape es el que valida `RecepcionSchema` en el endpoint, no el que
      // parecía razonable desde acá: `orderRef` (no `ocId`), `supplier`
      // requerido, y cada ítem con `product` (el nombre) además del id. Mandar
      // otra cosa devolvía 400 en cada intento.
      const res = await fetch("/api/compras/recepciones", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          orderRef: ocId,
          supplier,
          items: receivedItems
            .filter((i) => i.receivedQty > 0 || i.noLlego)
            .map((i) => ({
              product: i.name,
              productId: i.productId,
              expectedQty: i.orderedQty,
              receivedQty: i.receivedQty,
              // Lo que no llegó se declara como faltante: es la diferencia que
              // el proveedor tiene que responder, no una recepción normal de 0.
              condition: i.noLlego ? "faltante" : i.condition,
              notes: "",
            })),
          status: receivedItems.some((i) => i.noLlego || i.condition !== "ok" || i.receivedQty !== i.orderedQty)
            ? "parcial"
            : "aceptada",
          nonConformities: receivedItems.filter((i) => i.noLlego || i.condition !== "ok").length,
          // `notes`, no `notas`: con el nombre en castellano Zod lo descartaba
          // y la anotación de la recepción se perdía sin decir nada.
          notes: notas || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al procesar recepcion");
        setSaving(false);
        return;
      }

      onComplete();
    } catch {
      setError("Error de conexion");
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop p-4">
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
          <div>
            <SectionTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              Recepcion de Pedido
            </SectionTitle>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
              OC #{ocId.slice(-8).toUpperCase()} - Paso {step} de 3
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
            <X className="h-5 w-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-5 py-2 gap-1 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-colors",
                s <= step ? "bg-primary" : "bg-gray-200 dark:bg-gray-700",
              )}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Step 1: Verify Items */}
          {step === 1 && (
            <>
              <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Verificar cantidades recibidas
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs text-[var(--text-secondary)] dark:text-muted">
                      <th className="text-left py-2 px-2">Producto</th>
                      <th className="text-center py-2 px-1">Pedido</th>
                      <th className="text-center py-2 px-1">Recibido</th>
                      <th className="text-center py-2 px-1">Dif.</th>
                      <th className="text-center py-2 px-1">Cómo llegó</th>
                      <th className="text-center py-2 px-1">No llego</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivedItems.map((item, idx) => {
                      const diff = item.receivedQty - item.orderedQty;
                      return (
                        <tr key={item.productId} className="border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50">
                          <td className="py-2 px-2 font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                            {item.name}
                          </td>
                          <td className="py-2 px-1 text-center text-[var(--text-secondary)] dark:text-muted">
                            {item.orderedQty} {item.unit}
                          </td>
                          <td className="py-2 px-1 text-center">
                            <input
                              type="number"
                              min={0}
                              max={item.orderedQty}
                              value={item.receivedQty}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                if (val > item.orderedQty) {
                                  setError(`"${item.name}": recibida (${val}) no puede exceder ordenada (${item.orderedQty})`);
                                  return;
                                }
                                setError(null);
                                updateItem(idx, { receivedQty: val, noLlego: false });
                              }}
                              className="w-16 text-center border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-2 py-1 text-sm font-bold bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                              disabled={item.noLlego}
                            />
                          </td>
                          <td className="py-2 px-1 text-center">
                            {diff !== 0 && (
                              <span className={cn("text-xs font-bold", diff < 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]")}>
                                {diff < 0 ? `Faltaron ${Math.abs(diff)}` : `+${diff}`}
                              </span>
                            )}
                          </td>
                          {/* Lo dañado o vencido llegó, pero no se puede
                              vender: el backend lo registra como merma en vez
                              de sumarlo al stock. */}
                          <td className="py-2 px-1 text-center">
                            <label className="sr-only" htmlFor={`cond-${item.productId}`}>
                              Cómo llegó {item.name}
                            </label>
                            <select
                              id={`cond-${item.productId}`}
                              value={item.condition}
                              disabled={item.noLlego}
                              onChange={(e) => updateItem(idx, { condition: e.target.value as CondicionItem })}
                              className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-primary disabled:opacity-50"
                            >
                              {CONDICIONES.map((c) => (
                                <option key={c.v} value={c.v}>{c.l}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-1 text-center">
                            <input
                              type="checkbox"
                              checked={item.noLlego}
                              onChange={(e) => updateItem(idx, { noLlego: e.target.checked })}
                              className="h-4 w-4 accent-primary"
                              aria-label={`${item.name} no llegó`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Step 2: Adjust Prices */}
          {step === 2 && (
            <>
              <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)]" />
                Ajustar precios segun factura
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs text-[var(--text-secondary)] dark:text-muted">
                      <th className="text-left py-2 px-2">Producto</th>
                      <th className="text-right py-2 px-1">Precio anterior</th>
                      <th className="text-center py-2 px-1">Precio factura</th>
                      <th className="text-right py-2 px-1">Dif. %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivedItems
                      .filter((i) => i.receivedQty > 0)
                      .map((item) => {
                        const idx = receivedItems.findIndex((r) => r.productId === item.productId);
                        const priceDiff =
                          item.originalPrice > 0
                            ? ((item.unitPrice - item.originalPrice) / item.originalPrice) * 100
                            : 0;
                        const isSignificant = Math.abs(priceDiff) > 5;

                        return (
                          <tr key={item.productId} className="border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50">
                            <td className="py-2 px-2 font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                              {item.name}
                            </td>
                            <td className="py-2 px-1 text-right text-[var(--text-secondary)] dark:text-muted">
                              S/ {Number(item.originalPrice).toFixed(2)}
                            </td>
                            <td className="py-2 px-1 text-center">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={item.unitPrice}
                                onChange={(e) => updateItem(idx, { unitPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                                className="w-24 text-center border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-2 py-1 text-sm font-bold bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                              />
                            </td>
                            <td className="py-2 px-1 text-right">
                              {priceDiff !== 0 && (
                                <span
                                  className={cn(
                                    "text-xs font-semibold flex items-center justify-end gap-0.5",
                                    isSignificant ? "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]",
                                  )}
                                >
                                  {isSignificant && <AlertTriangle className="h-3 w-3" />}
                                  {priceDiff > 0 ? "+" : ""}{priceDiff.toFixed(1)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <div className="text-right">
                <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Total factura:</p>
                <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                  S/ {totalFactura.toFixed(2)}
                </p>
              </div>
            </>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <>
              <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                <Check className="h-4 w-4 text-[var(--data-success-500)]" />
                Confirmar recepcion
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-primary/10 dark:bg-primary/15 rounded-xl p-3 text-center border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                  <p className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] uppercase">Recibidos</p>
                  <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{itemsRecibidos.length}</p>
                </div>
                <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 rounded-xl p-3 text-center border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30">
                  <p className="text-xs font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] uppercase">Con diferencia</p>
                  <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{itemsConDiferencia.length}</p>
                </div>
                <div className="bg-primary/10 dark:bg-primary/15 rounded-xl p-3 text-center border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                  <p className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] uppercase">Total factura</p>
                  <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/ {totalFactura.toFixed(2)}</p>
                </div>
              </div>

              {/* Items summary */}
              <div className="bg-gray-50 dark:bg-accent/50 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
                {receivedItems.map((item) => (
                  <div key={item.productId} className="flex justify-between text-xs">
                    <span className={cn("text-[var(--text-primary)] dark:text-[var(--text-primary)]", item.receivedQty === 0 && "line-through text-[var(--text-tertiary)]")}>
                      {item.name}
                    </span>
                    <span className="text-[var(--text-secondary)] dark:text-muted font-semibold">
                      {item.receivedQty}/{item.orderedQty} - S/ {(item.receivedQty * item.unitPrice).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Notas sobre la recepcion (opcional)..."
                className="w-full border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 py-2 text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary resize-none"
                rows={3}
              />

              {error && (
                <div className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--rule-base)] dark:border-[var(--rule-base)]">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1 text-sm font-bold text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] transition-colors"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex items-center gap-1 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold text-sm rounded-lg transition-colors"
            >
              Siguiente <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={saving || itemsRecibidos.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/10 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar recepción
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
