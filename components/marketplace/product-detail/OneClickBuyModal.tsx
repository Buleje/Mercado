"use client";

/**
 * OneClickBuyModal — Amazon-style 1-Click Buy modal.
 *
 * Bypasses el carrito. NO modifica CheckoutModal ni zona peligrosa.
 * Para integración real: ver `lib/db/one-click-orders.db.ts` (stub).
 *
 * ADR-068: tokens CSS only, 0 emojis, 0 gradientes.
 */

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X, MapPin, Wallet, Zap, CheckCircle2, Edit2 } from "@buleje/design-system/icons";
import { PrimaryButton, cn } from "@buleje/design-system";
import { useCurrency } from "@/contexts/currency-context";
import { useLocale } from "@/contexts/locale-context";

type PaymentMethod = "yape" | "plin" | "cash";

interface SavedAddress {
  label: string;
  line1: string;
  reference?: string;
}

interface OneClickBuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: number;
  storeId: string;
  storeProductId: string;
  productName: string;
  productImage: string | null;
  productUnit: string | null;
  productPrice: number;
  defaultAddress: SavedAddress;
  defaultPayment: PaymentMethod;
  deliveryFee?: number;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  yape: "Yape",
  plin: "Plin",
  cash: "Efectivo al recibir",
};

export default function OneClickBuyModal({
  isOpen,
  onClose,
  productId,
  storeId,
  storeProductId,
  productName,
  productImage,
  productUnit,
  productPrice,
  defaultAddress,
  defaultPayment,
  deliveryFee = 3.5,
}: OneClickBuyModalProps) {
  const router = useRouter();
  const { format } = useCurrency();
  const { t } = useLocale();
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState<SavedAddress>(defaultAddress);
  const [payment, setPayment] = useState<PaymentMethod>(defaultPayment);
  const [editingAddress, setEditingAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setSucceeded(false);
      setSubmitting(false);
      setError(null);
      setQuantity(1);
      setEditingAddress(false);
    }
  }, [isOpen]);

  const subtotal = productPrice * quantity;
  const total = subtotal + deliveryFee;

  const handleConfirm = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/one-click/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          storeId,
          storeProductId,
          quantity,
          unitPrice: productPrice,
          address,
          paymentMethod: payment,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "No pudimos procesar tu compra");
        setSubmitting(false);
        return;
      }
      setSucceeded(true);
      // Redirigir al tracking tras 1.5s
      setTimeout(() => {
        router.push(`/cuenta/pedidos/${data.order?.id ?? "demo"}/seguimiento`);
      }, 1500);
    } catch {
      setError("No pudimos procesar tu compra. Intentá de nuevo.");
      setSubmitting(false);
    }
  }, [
    productId, storeId, storeProductId, quantity, productPrice,
    address, payment, router,
  ]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="one-click-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      {/* Panel */}
      <div
        className={cn(
          "relative w-full max-w-md max-h-[85vh] overflow-y-auto",
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
              Compra confirmada
            </h2>
            <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
              Te llevamos al seguimiento del pedido...
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[var(--surface-raised)] border-b border-[var(--rule-muted)] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-[var(--accent)]" aria-hidden />
                <h2
                  id="one-click-title"
                  className="text-[length:var(--ts-base)] font-bold text-[var(--text-primary)]"
                >
                  {t("product.buyOneClick")}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <X className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">
              {/* Product summary */}
              <div className="flex gap-3 p-3 rounded-xl bg-[var(--surface-sunken)]">
                <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-raised)]">
                  {productImage ? (
                    <Image
                      src={productImage}
                      alt={productName}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] truncate">
                    {productName}
                  </p>
                  {productUnit && (
                    <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                      {productUnit}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <div className="inline-flex items-center border border-[var(--rule-base)] rounded-lg bg-[var(--surface-raised)]">
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        aria-label="Reducir"
                        className="px-2.5 py-1 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                      >
                        −
                      </button>
                      <span className="px-3 text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)]">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                        aria-label="Aumentar"
                        className="px-2.5 py-1 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)]">
                      {format(subtotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Address */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                    <h3 className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
                      {t("checkout.address")}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingAddress((e) => !e)}
                    className="text-[length:var(--ts-xs)] font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                  >
                    <Edit2 className="h-3 w-3" aria-hidden />
                    {editingAddress ? t("common.save") : t("common.edit")}
                  </button>
                </div>
                {editingAddress ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={address.line1}
                      onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
                      placeholder="Dirección"
                      className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-[length:var(--ts-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                    <input
                      type="text"
                      value={address.reference ?? ""}
                      onChange={(e) => setAddress((a) => ({ ...a, reference: e.target.value }))}
                      placeholder="Referencia (opcional)"
                      className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-[length:var(--ts-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                ) : (
                  <div className="rounded-lg bg-[var(--surface-sunken)] p-3">
                    <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-primary)]">
                      {address.label}
                    </p>
                    <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                      {address.line1}
                    </p>
                    {address.reference && (
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                        Ref: {address.reference}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* Payment */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                  <h3 className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
                    {t("checkout.payment")}
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayment(m)}
                      aria-pressed={m === payment}
                      className={cn(
                        "py-2 rounded-lg text-[length:var(--ts-xs)] font-semibold transition-colors",
                        m === payment
                          ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                          : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-base)] hover:border-[var(--rule-strong)]",
                      )}
                    >
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>
              </section>

              {/* Totals */}
              <section className="rounded-xl bg-[var(--surface-sunken)] p-4 space-y-1.5">
                <div className="flex justify-between text-[length:var(--ts-xs)]">
                  <span className="text-[var(--text-secondary)]">Subtotal</span>
                  <span className="tabular-nums text-[var(--text-primary)]">
                    {format(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-[length:var(--ts-xs)]">
                  <span className="text-[var(--text-secondary)]">
                    {t("checkout.deliveryFee")}
                  </span>
                  <span className="tabular-nums text-[var(--text-primary)]">
                    {format(deliveryFee)}
                  </span>
                </div>
                <div className="border-t border-[var(--rule-muted)] pt-1.5 flex justify-between">
                  <span className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)]">
                    {t("cart.total")}
                  </span>
                  <span className="text-[length:var(--ts-base)] font-extrabold tabular-nums text-[var(--text-primary)]">
                    {format(total)}
                  </span>
                </div>
              </section>

              {error && (
                <div className="rounded-lg border border-[var(--data-error)]/30 bg-[var(--data-error)]/5 p-3">
                  <p className="text-[length:var(--ts-xs)] text-[var(--data-error)]">
                    {error}
                  </p>
                </div>
              )}
            </div>

            {/* Footer / CTA */}
            <div className="sticky bottom-0 bg-[var(--surface-raised)] border-t border-[var(--rule-muted)] p-4">
              <PrimaryButton
                size="lg"
                className="w-full"
                onClick={handleConfirm}
                disabled={submitting}
                loading={submitting}
                leftIcon={<Zap className="h-4 w-4" aria-hidden />}
              >
                {t("checkout.confirm")}
              </PrimaryButton>
              <p className="mt-2 text-center text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                Demo: este flujo no procesa pagos. Requiere ADR-checkout para producción.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
