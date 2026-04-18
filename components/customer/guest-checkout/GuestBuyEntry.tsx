"use client";

/**
 * GuestBuyEntry — Card con CTA "Comprar sin crear cuenta".
 *
 * Ubicación: `components/customer/guest-checkout/` (fuera de
 * `components/checkout/**` para respetar zona de peligro).
 *
 * Se monta en página standalone `/checkout/invitado` o como sección
 * opcional que wrappea al carrito real (sin modificarlo).
 *
 * IMPORTANTE: NO modifica CheckoutModal ni cart-context — flow paralelo stub.
 *
 * Si se quiere integrar en CartSidebar real, requiere ADR-checkout.
 *
 * ADR-068: tokens CSS only, 0 emojis.
 */

import { useState } from "react";
import { UserPlus, Zap } from "@buleje/design-system/icons";
import { PrimaryButton } from "@buleje/design-system";
import { useLocale } from "@/contexts/locale-context";
import GuestBuyFormModal from "./GuestBuyFormModal";

interface GuestBuyEntryProps {
  /**
   * Items del carrito actual — snapshot para enviar al API.
   * Si está vacío, el botón queda disabled.
   */
  cartItems?: Array<{
    productId: number;
    storeProductId: string;
    storeId: string;
    quantity: number;
    unitPrice: number;
    name?: string;
  }>;
  onSuccess?: (orderId: string) => void;
}

export default function GuestBuyEntry({
  cartItems = [],
  onSuccess,
}: GuestBuyEntryProps) {
  const { t } = useLocale();
  const [modalOpen, setModalOpen] = useState(false);
  const isEmpty = cartItems.length === 0;

  return (
    <>
      <section
        className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 md:p-5"
        aria-label="Comprar como invitado"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div
            className="shrink-0 rounded-lg bg-[var(--surface-sunken)] p-2.5"
            aria-hidden
          >
            <Zap className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)]">
              {t("checkout.guestCta")}
            </h3>
            <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
              Completa tus datos una vez. Te enviaremos el link para seguir tu
              pedido al celular.
            </p>
          </div>
          <PrimaryButton
            size="md"
            variant="primary"
            leftIcon={<UserPlus className="h-4 w-4" aria-hidden />}
            disabled={isEmpty}
            onClick={() => setModalOpen(true)}
            className="w-full sm:w-auto"
          >
            {t("checkout.confirm")}
          </PrimaryButton>
        </div>
      </section>

      <GuestBuyFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        cartItems={cartItems}
        onSuccess={onSuccess}
      />
    </>
  );
}
