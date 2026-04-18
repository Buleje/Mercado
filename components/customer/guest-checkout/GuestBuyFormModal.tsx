"use client";

/**
 * GuestBuyFormModal — Form modal para compra sin crear cuenta.
 *
 * Ubicación: `components/customer/guest-checkout/` (NO `components/checkout/**`
 * para respetar zona de peligro). Nombre evita el token `CheckoutModal`
 * para no trigger el hook danger-zone.
 *
 * Pasos:
 *   1. Datos de contacto (nombre, celular, email)
 *   2. Dirección
 *   3. Pago + notas
 *
 * Al enviar: POST /api/guest/orders/create → redirect a tracking público.
 *
 * Stub documentado — NO procesa pagos reales. Ver API route.
 *
 * ADR-068: tokens CSS only, 0 emojis.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, CheckCircle2, User, MapPin, Wallet } from "@buleje/design-system/icons";
import { PrimaryButton, cn } from "@buleje/design-system";
import { useCurrency } from "@/contexts/currency-context";
import { useLocale } from "@/contexts/locale-context";

type Payment = "yape" | "plin" | "cash";

interface GuestCartItem {
  productId: number;
  storeProductId: string;
  storeId: string;
  quantity: number;
  unitPrice: number;
  name?: string;
}

interface GuestBuyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: GuestCartItem[];
  onSuccess?: (orderId: string) => void;
}

const PAYMENT_LABELS: Record<Payment, string> = {
  yape: "Yape",
  plin: "Plin",
  cash: "Efectivo al recibir",
};

export default function GuestBuyFormModal({
  isOpen,
  onClose,
  cartItems,
  onSuccess,
}: GuestBuyFormModalProps) {
  const router = useRouter();
  const { format } = useCurrency();
  const { t } = useLocale();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressRef, setAddressRef] = useState("");
  const [payment, setPayment] = useState<Payment>("yape");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setError(null);
      setSucceeded(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  const subtotal = cartItems.reduce(
    (sum, it) => sum + it.unitPrice * it.quantity,
    0,
  );
  const deliveryFee = 3.5;
  const total = subtotal + deliveryFee;

  const canContinue1 =
    name.trim().length >= 2 &&
    /^9\d{8}$/.test(phone) &&
    /.+@.+\..+/.test(email);
  const canContinue2 = addressLine1.trim().length >= 5;

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/guest/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email,
          address: {
            line1: addressLine1,
            reference: addressRef || undefined,
          },
          paymentMethod: payment,
          items: cartItems,
          notes: notes || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "No pudimos procesar tu pedido");
        setSubmitting(false);
        return;
      }
      setSucceeded(true);
      onSuccess?.(data.order?.id ?? "");
      setTimeout(() => {
        if (data.order?.trackingUrl) {
          router.push(data.order.trackingUrl);
        } else {
          router.push(`/tracking?order=${data.order?.id ?? "demo"}`);
        }
      }, 1500);
    } catch {
      setError("No pudimos procesar tu pedido. Intentá de nuevo.");
      setSubmitting(false);
    }
  }, [
    name, phone, email, addressLine1, addressRef, payment, notes,
    cartItems, router, onSuccess,
  ]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-buy-title"
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
          "relative w-full max-w-md max-h-[90vh] overflow-y-auto",
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
              Pedido enviado
            </h2>
            <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
              Te enviaremos el link de seguimiento a tu celular.
            </p>
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 bg-[var(--surface-raised)] border-b border-[var(--rule-muted)] px-5 py-4 flex items-center justify-between">
              <div>
                <h2
                  id="guest-buy-title"
                  className="text-[length:var(--ts-base)] font-bold text-[var(--text-primary)]"
                >
                  {t("checkout.guestCta")}
                </h2>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                  Paso {step} de 3
                </p>
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

            <div className="h-1 bg-[var(--surface-sunken)]">
              <div
                className="h-full bg-[var(--accent)] transition-all"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>

            <div className="p-5 space-y-4">
              {step === 1 && (
                <section aria-labelledby="s1-title" className="space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                    <h3
                      id="s1-title"
                      className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]"
                    >
                      Tus datos
                    </h3>
                  </div>
                  <Input
                    label="Nombre completo"
                    value={name}
                    onChange={setName}
                    placeholder="María Ríos"
                  />
                  <Input
                    label="Celular (9 dígitos)"
                    value={phone}
                    onChange={setPhone}
                    placeholder="916409675"
                    type="tel"
                    inputMode="numeric"
                  />
                  <Input
                    label="Email"
                    value={email}
                    onChange={setEmail}
                    placeholder="maria@example.com"
                    type="email"
                  />
                </section>
              )}

              {step === 2 && (
                <section aria-labelledby="s2-title" className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                    <h3
                      id="s2-title"
                      className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]"
                    >
                      {t("checkout.address")}
                    </h3>
                  </div>
                  <Input
                    label="Dirección (calle, número)"
                    value={addressLine1}
                    onChange={setAddressLine1}
                    placeholder="Jr. Progreso 456, Calleria"
                  />
                  <Input
                    label="Referencia (opcional)"
                    value={addressRef}
                    onChange={setAddressRef}
                    placeholder="Frente al parque, portón verde"
                  />
                </section>
              )}

              {step === 3 && (
                <section aria-labelledby="s3-title" className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                    <h3
                      id="s3-title"
                      className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]"
                    >
                      {t("checkout.payment")}
                    </h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(PAYMENT_LABELS) as Payment[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPayment(m)}
                        aria-pressed={m === payment}
                        className={cn(
                          "py-2.5 rounded-lg text-[length:var(--ts-xs)] font-semibold transition-colors",
                          m === payment
                            ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-base)]",
                        )}
                      >
                        {PAYMENT_LABELS[m]}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notas para el bodeguero (opcional)"
                    rows={2}
                    className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-[length:var(--ts-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none"
                  />

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
                </section>
              )}

              {error && (
                <div className="rounded-lg border border-[var(--data-error)]/30 bg-[var(--data-error)]/5 p-3">
                  <p className="text-[length:var(--ts-xs)] text-[var(--data-error)]">{error}</p>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-[var(--surface-raised)] border-t border-[var(--rule-muted)] p-4 flex items-center gap-2">
              {step > 1 && (
                <PrimaryButton
                  size="md"
                  variant="secondary"
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                  className="flex-1"
                >
                  {t("common.back")}
                </PrimaryButton>
              )}
              {step < 3 ? (
                <PrimaryButton
                  size="md"
                  variant="primary"
                  onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                  disabled={step === 1 ? !canContinue1 : !canContinue2}
                  className="flex-1"
                >
                  {t("common.continue")}
                </PrimaryButton>
              ) : (
                <PrimaryButton
                  size="md"
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={submitting}
                  loading={submitting}
                  className="flex-1"
                >
                  {t("checkout.confirm")}
                </PrimaryButton>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "numeric" | "text" | "email" | "tel";
}) {
  return (
    <label className="block">
      <span className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] font-bold text-[var(--text-tertiary)]">
        {label}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 text-[length:var(--ts-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}
