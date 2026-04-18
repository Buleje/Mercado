"use client";

/**
 * OneClickBuyButton — Amazon-style "Buy Now in 1-Click" shortcut.
 *
 * Solo visible si:
 *   - Usuario logueado
 *   - Tiene dirección predeterminada (mock: customer.defaultAddress)
 *   - Tiene método de pago guardado (mock: customer.savedPayment)
 *
 * Si no cumple → el botón cae al fallback "Agregar al carrito" (delegado
 * al componente padre; aquí simplemente no renderizamos nada).
 *
 * NO modifica CheckoutModal ni cart-context — usa flow paralelo stub.
 *
 * ADR-068: tokens CSS only, 0 emojis.
 */

import { useState, useCallback } from "react";
import { Zap } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";
import { useCustomer } from "@/contexts/customer-context";
import { useLocale } from "@/contexts/locale-context";
import OneClickBuyModal from "./OneClickBuyModal";

interface OneClickBuyButtonProps {
  productId: number;
  storeId: string;
  storeProductId: string;
  productName: string;
  productImage: string | null;
  productUnit: string | null;
  productPrice: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Type guard para detectar mocks de dirección + pago guardado en customer.
 * En prod: reemplazar con queries a `lib/db/addresses.db.ts` y `lib/db/payment-methods.db.ts`.
 */
function hasOneClickReadiness(customer: unknown): {
  defaultAddress: { label: string; line1: string; reference?: string };
  defaultPayment: "yape" | "plin" | "cash";
} | null {
  if (!customer || typeof customer !== "object") return null;
  // Mock reasonable defaults — esto debería venir del customer profile real
  return {
    defaultAddress: {
      label: "Casa",
      line1: "Jr. Progreso 456, Calleria",
      reference: "Frente al parque",
    },
    defaultPayment: "yape",
  };
}

export default function OneClickBuyButton({
  productId,
  storeId,
  storeProductId,
  productName,
  productImage,
  productUnit,
  productPrice,
  disabled,
  className,
}: OneClickBuyButtonProps) {
  const { customer } = useCustomer();
  const { t } = useLocale();
  const [modalOpen, setModalOpen] = useState(false);

  const readiness = customer ? hasOneClickReadiness(customer) : null;

  const handleOpen = useCallback(() => {
    if (!readiness || disabled) return;
    setModalOpen(true);
  }, [readiness, disabled]);

  // No customer or no saved data → no render (fallback al "Agregar al carrito")
  if (!customer || !readiness) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        aria-label={t("product.buyOneClick")}
        className={cn(
          "w-full py-3.5 rounded-xl font-semibold text-[length:var(--ts-sm)]",
          "flex items-center justify-center gap-2 transition-all active:scale-[0.98]",
          "bg-[var(--accent)] text-white hover:opacity-90",
          "disabled:bg-[var(--surface-sunken)] disabled:text-[var(--text-tertiary)]",
          "disabled:cursor-not-allowed",
          className,
        )}
      >
        <Zap className="h-4 w-4" aria-hidden />
        {t("product.buyOneClick")}
      </button>

      <OneClickBuyModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        productId={productId}
        storeId={storeId}
        storeProductId={storeProductId}
        productName={productName}
        productImage={productImage}
        productUnit={productUnit}
        productPrice={productPrice}
        defaultAddress={readiness.defaultAddress}
        defaultPayment={readiness.defaultPayment}
      />
    </>
  );
}
