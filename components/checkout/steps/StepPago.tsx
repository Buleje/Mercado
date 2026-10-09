"use client";

import { type FormEvent } from "react";
import { m } from "framer-motion";
import type { CartItem } from "@/contexts/cart-context";
import type { Customer } from "@/contexts/customer-context";
import type { DbPromotion } from "@/lib/jsondb";
import { CheckoutOrderReview, CheckoutPaymentSection } from "..";
import type { CheckoutState } from "../types";
import type { CheckoutDispatch } from "../hooks/useCheckoutState";
import type { YapeConfig } from "@/contexts/settings-context";
import LoyaltyTierProgressBar from "@/components/loyalty/LoyaltyTierProgressBar";
import { useFiadoOption } from "../hooks/useFiadoOption";
import { JuntaActiveBanner } from "../JuntaActiveBanner";
import type { DescuentoAutomaticoVista } from "@/lib/pricing/total-pedido";
import type { CanjePuntosProps } from "../parts/CanjePuntos";

/**
 * StepPago — selector de método de pago + resumen del pedido.
 * Reutiliza los componentes existentes `CheckoutOrderReview` y
 * `CheckoutPaymentSection`. Maneja cupón, tip, Yape/efectivo.
 */

export type StepPagoProps = {
  state: CheckoutState;
  dispatch: CheckoutDispatch;
  items: CartItem[];
  finalTotal: number;
  cartTotal: number;
  discount: number;
  promo: DbPromotion | null;
  /** Descuento automático cotizado por el servidor (primera compra, etc.). */
  descuentoAutomatico: DescuentoAutomaticoVista | null;
  effectiveCustomer: Customer | null;
  loyaltyPoints: number | null;
  /** Canje de puntos (`canjeDeLaVista`) y soles que ya restó del total. */
  canje?: CanjePuntosProps;
  descuentoPuntos?: number;
  yape: YapeConfig;
  cashEnabled: boolean;
  onValidateCoupon: () => Promise<void>;
  onSubmit: (e: FormEvent) => void;
  onBackToDatos: () => void;
};

export function StepPago({
  state,
  dispatch,
  items,
  finalTotal,
  cartTotal,
  discount,
  promo,
  descuentoAutomatico,
  effectiveCustomer,
  loyaltyPoints,
  canje,
  descuentoPuntos,
  yape,
  cashEnabled,
  onValidateCoupon,
  onSubmit,
  onBackToDatos,
}: StepPagoProps) {
  const fiado = useFiadoOption(finalTotal);

  return (
    <m.div
      key="pago"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      <form onSubmit={onSubmit} data-testid="pago-form" className="px-6 py-5">
        <JuntaActiveBanner />
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_360px] divide-y sm:divide-y-0 sm:divide-x divide-[var(--rule-soft)] gap-0">
          <CheckoutOrderReview
            items={items}
            finalTotal={finalTotal}
            discount={discount}
            location={state.address.location}
            reference={state.address.reference}
            effectiveCustomerLocation={effectiveCustomer?.location}
            effectiveCustomerReference={effectiveCustomer?.reference}
            onEditAddress={onBackToDatos}
          />

          <CheckoutPaymentSection
            tip={state.payment.tip}
            onTipChange={(tip) =>
              dispatch({ type: "SET_PAYMENT", patch: { tip } })
            }
            couponCode={state.coupon.code}
            onCouponCodeChange={(code) =>
              dispatch({ type: "SET_COUPON", patch: { code } })
            }
            couponApplied={state.coupon.applied}
            couponDiscount={state.coupon.discount}
            couponMsg={state.coupon.msg}
            validatingCoupon={state.coupon.validating}
            onValidateCoupon={onValidateCoupon}
            onRemoveCoupon={() => dispatch({ type: "RESET_COUPON" })}
            total={cartTotal}
            finalTotal={finalTotal}
            discount={discount}
            promo={promo}
            descuentoAutomatico={descuentoAutomatico}
            loyaltyPoints={loyaltyPoints}
            canje={canje}
            descuentoPuntos={descuentoPuntos}
            paymentMethod={state.payment.method}
            onPaymentMethodChange={(method) => {
              dispatch({
                type: "SET_PAYMENT",
                patch: { method, showHint: false },
              });
            }}
            yapeEnabled={yape.enabled}
            cashEnabled={cashEnabled}
            fiadoEligible={fiado.eligible}
            fiadoAvailableCredit={fiado.availableCredit}
            fiadoDueDateLabel={fiado.dueDateLabel}
            yape={yape}
            yapeOpNumber={state.payment.yapeOpNumber}
            onYapeOpNumberChange={(yapeOpNumber) =>
              dispatch({ type: "SET_PAYMENT", patch: { yapeOpNumber } })
            }
            showPaymentHint={state.payment.showHint}
            submitting={state.ui.submitting}
            submitError={state.ui.submitError}
            onBack={onBackToDatos}
          />
        </div>

        {/* Loyalty progress bar */}
        {loyaltyPoints !== null && loyaltyPoints >= 0 && (
          <div className="mt-4">
            <LoyaltyTierProgressBar points={loyaltyPoints} compact />
          </div>
        )}
      </form>
    </m.div>
  );
}
