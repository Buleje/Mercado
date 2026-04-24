"use client";

/**
 * CartCouponSection — Wrapper del CouponInput para el carrito/checkout.
 *
 * Maneja el state del cupón aplicado en localStorage (session-scoped)
 * y valida contra un endpoint mock. En produccion real se conecta a
 * /api/checkout/apply-coupon que valida contra DB.
 *
 * El componente expone el couponDiscount via prop onDiscountChange para
 * que el caller pueda pasarlo al CheckoutSummary.
 *
 * Uso:
 *   <CartCouponSection onDiscountChange={setDiscount} subtotal={grandTotal} />
 */

import { useEffect, useState, useCallback } from "react";
import CouponInput, { type AppliedCoupon } from "@/components/ui-system/CouponInput";

const STORAGE_KEY = "buleje-applied-coupon-v1";

// Cupones mock — en produccion vienen de la API del tenant/marketplace.
const MOCK_COUPONS: Record<string, AppliedCoupon> = {
  BIENVENIDO10: {
    code: "BIENVENIDO10",
    description: "Descuento de bienvenida en tu primera compra",
    amount: 10,
  },
  YAPELOVER: {
    code: "YAPELOVER",
    description: "5% extra pagando con Yape",
    amount: 5,
  },
  ENVIOGRATIS: {
    code: "ENVIOGRATIS",
    description: "Envío gratis en pedidos mayores a S/30",
    amount: 5,
    isFixed: true,
  },
};

interface Props {
  /** Subtotal del carrito — para mostrar cupones aplicables */
  subtotal: number;
  /** Callback cuando cambia el descuento (aplicar o quitar) */
  onDiscountChange: (discountAmount: number) => void;
  className?: string;
}

function readApplied(): AppliedCoupon | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppliedCoupon;
  } catch {
    return null;
  }
}

function writeApplied(c: AppliedCoupon | null) {
  if (typeof window === "undefined") return;
  try {
    if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}

function calcDiscount(coupon: AppliedCoupon | null, subtotal: number): number {
  if (!coupon) return 0;
  if (coupon.isFixed) return Math.min(coupon.amount, subtotal);
  return Math.round(subtotal * (coupon.amount / 100) * 100) / 100;
}

export default function CartCouponSection({ subtotal, onDiscountChange, className }: Props) {
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);

  // Hidratar
  useEffect(() => {
    const c = readApplied();
    if (c) {
      setApplied(c);
      onDiscountChange(calcDiscount(c, subtotal));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalcular cuando cambia subtotal
  useEffect(() => {
    if (applied) {
      onDiscountChange(calcDiscount(applied, subtotal));
    }
  }, [subtotal, applied, onDiscountChange]);

  const handleApply = useCallback(
    async (code: string) => {
      // Simula latencia de API
      await new Promise((r) => setTimeout(r, 400));
      const coupon = MOCK_COUPONS[code];
      if (!coupon) {
        return { valid: false, error: "Código inválido o expirado" };
      }
      // Validar que ENVIOGRATIS requiere subtotal > 30
      if (code === "ENVIOGRATIS" && subtotal < 30) {
        return { valid: false, error: "Aplica desde S/30 de compra" };
      }
      setApplied(coupon);
      writeApplied(coupon);
      onDiscountChange(calcDiscount(coupon, subtotal));
      return { valid: true, coupon };
    },
    [subtotal, onDiscountChange],
  );

  const handleRemove = useCallback(() => {
    setApplied(null);
    writeApplied(null);
    onDiscountChange(0);
  }, [onDiscountChange]);

  // Cupones disponibles segun subtotal
  const available = Object.values(MOCK_COUPONS).filter((c) =>
    c.code === "ENVIOGRATIS" ? subtotal >= 30 : true,
  );

  return (
    <CouponInput
      applied={applied}
      onApply={handleApply}
      onRemove={handleRemove}
      availableCoupons={available}
      className={className}
    />
  );
}
