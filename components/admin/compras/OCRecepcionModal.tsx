"use client";

import { useState } from "react";
import {
  X, ChevronRight, ChevronLeft, Check,
  Loader2, AlertTriangle, Package,
} from "lucide-react";
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
  items: OCItem[];
  onComplete: () => void;
  onClose: () => void;
}

type ReceivedItem = {
  productId: number;
  name: string;
  orderedQty: number;
  receivedQty: number;
  unitPrice: number;
  originalPrice: number;
  unit: string;
  noLlego: boolean;
};

export default function OCRecepcionModal({ ocId, items, onComplete, onClose }: OCRecepcionModalProps) {
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
      const res = await fetch("/api/compras/recepciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocId,
          items: receivedItems
            .filter((i) => i.receivedQty > 0)
            .map((i) => ({
              productId: i.productId,
              receivedQty: i.receivedQty,
              unitPrice: i.unitPrice,
            })),
          notas: notas || undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-card-border">
          <div>
            <h2 className="text-lg font-extrabold text-gray-900 dark:text-foreground">
              Recepcion de Pedido
            </h2>
            <p className="text-xs text-gray-500 dark:text-muted">
              OC #{ocId.slice(-8).toUpperCase()} - Paso {step} de 3
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-5 py-2 gap-1 border-b border-gray-100 dark:border-card-border/50">
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
              <p className="text-sm font-bold text-gray-700 dark:text-foreground flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Verificar cantidades recibidas
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-card-border text-xs text-gray-500 dark:text-muted">
                      <th className="text-left py-2 px-2">Producto</th>
                      <th className="text-center py-2 px-1">Pedido</th>
                      <th className="text-center py-2 px-1">Recibido</th>
                      <th className="text-center py-2 px-1">Dif.</th>
                      <th className="text-center py-2 px-1">No llego</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivedItems.map((item, idx) => {
                      const diff = item.receivedQty - item.orderedQty;
                      return (
                        <tr key={item.productId} className="border-b border-gray-100 dark:border-card-border/50">
                          <td className="py-2 px-2 font-semibold text-gray-900 dark:text-foreground">
                            {item.name}
                          </td>
                          <td className="py-2 px-1 text-center text-gray-600 dark:text-muted">
                            {item.orderedQty} {item.unit}
                          </td>
                          <td className="py-2 px-1 text-center">
                            <input
                              type="number"
                              min={0}
                              value={item.receivedQty}
                              onChange={(e) => updateItem(idx, { receivedQty: Math.max(0, parseInt(e.target.value) || 0), noLlego: false })}
                              className="w-16 text-center border border-gray-200 dark:border-card-border rounded-lg px-2 py-1 text-sm font-bold bg-white dark:bg-card text-gray-900 dark:text-foreground outline-none focus:border-primary"
                              disabled={item.noLlego}
                            />
                          </td>
                          <td className="py-2 px-1 text-center">
                            {diff !== 0 && (
                              <span className={cn("text-xs font-bold", diff < 0 ? "text-red-600" : "text-emerald-600")}>
                                {diff < 0 ? `Faltaron ${Math.abs(diff)}` : `+${diff}`}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-1 text-center">
                            <input
                              type="checkbox"
                              checked={item.noLlego}
                              onChange={(e) => updateItem(idx, { noLlego: e.target.checked })}
                              className="h-4 w-4 accent-primary"
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
              <p className="text-sm font-bold text-gray-700 dark:text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Ajustar precios segun factura
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-card-border text-xs text-gray-500 dark:text-muted">
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
                          <tr key={item.productId} className="border-b border-gray-100 dark:border-card-border/50">
                            <td className="py-2 px-2 font-semibold text-gray-900 dark:text-foreground">
                              {item.name}
                            </td>
                            <td className="py-2 px-1 text-right text-gray-500 dark:text-muted">
                              S/ {item.originalPrice.toFixed(2)}
                            </td>
                            <td className="py-2 px-1 text-center">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={item.unitPrice}
                                onChange={(e) => updateItem(idx, { unitPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                                className="w-24 text-center border border-gray-200 dark:border-card-border rounded-lg px-2 py-1 text-sm font-bold bg-white dark:bg-card text-gray-900 dark:text-foreground outline-none focus:border-primary"
                              />
                            </td>
                            <td className="py-2 px-1 text-right">
                              {priceDiff !== 0 && (
                                <span
                                  className={cn(
                                    "text-xs font-semibold flex items-center justify-end gap-0.5",
                                    isSignificant ? "text-amber-600 dark:text-amber-400" : "text-gray-500",
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
                <p className="text-sm text-gray-500 dark:text-muted">Total factura:</p>
                <p className="text-xl font-extrabold text-gray-900 dark:text-foreground">
                  S/ {totalFactura.toFixed(2)}
                </p>
              </div>
            </>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <>
              <p className="text-sm font-bold text-gray-700 dark:text-foreground flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                Confirmar recepcion
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-3 text-center border border-emerald-200 dark:border-emerald-800/30">
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Recibidos</p>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{itemsRecibidos.length}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-3 text-center border border-amber-200 dark:border-amber-800/30">
                  <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Con diferencia</p>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{itemsConDiferencia.length}</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-3 text-center border border-blue-200 dark:border-blue-800/30">
                  <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">Total factura</p>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">S/ {totalFactura.toFixed(2)}</p>
                </div>
              </div>

              {/* Items summary */}
              <div className="bg-gray-50 dark:bg-accent/50 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
                {receivedItems.map((item) => (
                  <div key={item.productId} className="flex justify-between text-xs">
                    <span className={cn("text-gray-700 dark:text-foreground", item.receivedQty === 0 && "line-through text-gray-400")}>
                      {item.name}
                    </span>
                    <span className="text-gray-500 dark:text-muted font-semibold">
                      {item.receivedQty}/{item.orderedQty} - S/ {(item.receivedQty * item.unitPrice).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Notas sobre la recepcion (opcional)..."
                className="w-full border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 text-sm bg-white dark:bg-card text-gray-900 dark:text-foreground outline-none focus:border-primary resize-none"
                rows={3}
              />

              {error && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 dark:border-card-border">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1 text-sm font-bold text-gray-600 dark:text-muted hover:text-gray-900 dark:hover:text-foreground transition-colors"
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
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar Recepcion
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
