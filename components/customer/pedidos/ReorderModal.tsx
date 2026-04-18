"use client";

/**
 * ReorderModal — Modal para re-comprar un pedido pasado con ajustes.
 *
 * Muestra los items originales como lista editable:
 *   - Quitar item (trash)
 *   - Ajustar cantidad (stepper)
 * Botón grande "Confirmar pedido" envía al API stub.
 *
 * ADR-068: tokens CSS only, 0 emojis.
 */

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X, Trash2, Plus, Minus, CheckCircle2, RefreshCcw } from "@buleje/design-system/icons";
import { PrimaryButton, cn } from "@buleje/design-system";
import { useCurrency } from "@/contexts/currency-context";
import { useLocale } from "@/contexts/locale-context";

export interface ReorderItem {
  productId: number;
  storeProductId: string;
  storeId: string;
  name: string;
  image: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
}

interface ReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalOrderId: string;
  originalItems: ReorderItem[];
}

export default function ReorderModal({
  isOpen,
  onClose,
  originalOrderId,
  originalItems,
}: ReorderModalProps) {
  const router = useRouter();
  const { format } = useCurrency();
  const { t } = useLocale();

  const [items, setItems] = useState<ReorderItem[]>(originalItems);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setItems(originalItems);
      setError(null);
      setSucceeded(false);
      setSubmitting(false);
    }
  }, [isOpen, originalItems]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const subtotal = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const deliveryFee = 3.5;
  const total = subtotal + deliveryFee;

  const updateQty = useCallback((productId: number, delta: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.productId === productId
          ? { ...it, quantity: Math.max(1, Math.min(99, it.quantity + delta)) }
          : it,
      ),
    );
  }, []);

  const removeItem = useCallback((productId: number) => {
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (items.length === 0) {
      setError("Agregá al menos un producto.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalOrderId,
          items: items.map((it) => ({
            productId: it.productId,
            storeProductId: it.storeProductId,
            storeId: it.storeId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "No pudimos procesar tu pedido");
        setSubmitting(false);
        return;
      }
      setSucceeded(true);
      setTimeout(() => {
        const newId = data.order?.id;
        if (newId) {
          router.push(`/cuenta/pedidos/${newId}/seguimiento`);
        }
      }, 1500);
    } catch {
      setError("No pudimos procesar tu pedido. Intentá de nuevo.");
      setSubmitting(false);
    }
  }, [items, originalOrderId, router]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reorder-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      <div
        className={cn(
          "relative w-full max-w-lg max-h-[90vh] overflow-y-auto",
          "rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)]",
          "elev-2",
        )}
      >
        {succeeded ? (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-[var(--data-success)]/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-[var(--data-success)]" aria-hidden />
            </div>
            <h2 className="text-[length:var(--ts-lg)] font-bold text-[var(--text-primary)]">
              Pedido creado
            </h2>
            <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
              Te llevamos al seguimiento...
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[var(--surface-raised)] border-b border-[var(--rule-muted)] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCcw className="h-4 w-4 text-[var(--accent)]" aria-hidden />
                <h2
                  id="reorder-title"
                  className="text-[length:var(--ts-base)] font-bold text-[var(--text-primary)]"
                >
                  {t("reorder.title")}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)]"
              >
                <X className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
              </button>
            </div>

            {/* Items */}
            <div className="p-5 space-y-3">
              {items.length === 0 ? (
                <p className="text-center text-[length:var(--ts-sm)] text-[var(--text-tertiary)] py-8">
                  No hay productos en este pedido.
                </p>
              ) : (
                items.map((item) => (
                  <article
                    key={item.productId}
                    className="flex gap-3 p-3 rounded-xl bg-[var(--surface-sunken)]"
                  >
                    <div className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-raised)]">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] truncate">
                        {item.name}
                      </p>
                      {item.unit && (
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                          {item.unit}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center border border-[var(--rule-base)] rounded-lg bg-[var(--surface-raised)]">
                          <button
                            type="button"
                            onClick={() => updateQty(item.productId, -1)}
                            aria-label="Reducir"
                            className="px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                          >
                            <Minus className="h-3 w-3" aria-hidden />
                          </button>
                          <span className="px-2.5 text-[length:var(--ts-xs)] font-bold tabular-nums text-[var(--text-primary)] min-w-[1.75rem] text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.productId, 1)}
                            aria-label="Aumentar"
                            className="px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                          >
                            <Plus className="h-3 w-3" aria-hidden />
                          </button>
                        </div>
                        <span className="text-[length:var(--ts-xs)] font-bold tabular-nums text-[var(--text-primary)]">
                          {format(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      aria-label={t("cart.remove")}
                      className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error)]/5 transition-colors self-start"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </article>
                ))
              )}

              {/* Totals */}
              {items.length > 0 && (
                <div className="rounded-xl bg-[var(--surface-sunken)] p-4 space-y-1.5">
                  <div className="flex justify-between text-[length:var(--ts-xs)]">
                    <span className="text-[var(--text-secondary)]">Subtotal</span>
                    <span className="tabular-nums text-[var(--text-primary)]">{format(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-[length:var(--ts-xs)]">
                    <span className="text-[var(--text-secondary)]">{t("checkout.deliveryFee")}</span>
                    <span className="tabular-nums text-[var(--text-primary)]">{format(deliveryFee)}</span>
                  </div>
                  <div className="border-t border-[var(--rule-muted)] pt-1.5 flex justify-between">
                    <span className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)]">
                      {t("cart.total")}
                    </span>
                    <span className="text-[length:var(--ts-base)] font-extrabold tabular-nums text-[var(--text-primary)]">
                      {format(total)}
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-[var(--data-error)]/30 bg-[var(--data-error)]/5 p-3">
                  <p className="text-[length:var(--ts-xs)] text-[var(--data-error)]">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-[var(--surface-raised)] border-t border-[var(--rule-muted)] p-4">
              <PrimaryButton
                size="lg"
                variant="primary"
                onClick={handleSubmit}
                disabled={submitting || items.length === 0}
                loading={submitting}
                leftIcon={<RefreshCcw className="h-4 w-4" aria-hidden />}
                className="w-full"
              >
                {t("reorder.confirm")}
              </PrimaryButton>
              <p className="mt-2 text-center text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                Demo: este flujo no procesa pagos. Requiere ADR para producción.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
