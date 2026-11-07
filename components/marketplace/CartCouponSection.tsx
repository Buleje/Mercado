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
import { csrfHeaders } from "@/lib/csrf-client";

const STORAGE_KEY = "buleje-applied-coupon-v1";

// MOCK_COUPONS eliminado — P0 anti-fraude. Descuentos solo vía backend.

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

  // Hidratar cupón ya aplicado.
  // SECURITY (audit P9): el auto-apply de BIENVENIDO10 fue REMOVIDO.
  // El flag client-side `buleje-first-purchase-v1` era explotable —
  // cualquier user borraba `buleje-applied-coupon-v1` y reaplicaba 10%
  // perpetuo. La validación de "primera compra" debe vivir server-side
  // (customer.firstPurchaseUsedAt) en /api/checkout/apply-coupon antes
  // de habilitar auto-apply de nuevo. MOCK_COUPONS sigue siendo solo
  // para input manual (preview); el descuento real se valida en backend.
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

  // Audit P10 sprint security: ahora validamos cupones contra
  // /api/marketplace/coupons/validate (server-side, contra DB) en lugar
  // del MOCK_COUPONS client-side editable. Si el endpoint falla o no
  // reconoce el cupón, caemos al MOCK como fallback (UX dev) — pero el
  // descuento real lo aplica el backend al confirmar el pedido.
  const handleApply = useCallback(
    async (code: string) => {
      try {
        const res = await fetch("/api/marketplace/coupons/validate", {
          method: "POST",
          headers: csrfHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ code, storeSlug: "main", cartTotal: subtotal }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.valid && data.coupon) {
            const coupon: AppliedCoupon = {
              code: data.coupon.code,
              description: data.coupon.description ?? "Cupón aplicado",
              amount: data.coupon.amount ?? 0,
              isFixed: data.coupon.isFixed ?? false,
            };
            setApplied(coupon);
            writeApplied(coupon);
            onDiscountChange(calcDiscount(coupon, subtotal));
            return { valid: true, coupon };
          }
          if (data.error) return { valid: false, error: data.error };
        }
      } catch {
        // Error de red — no aplicar descuento sin autorización del backend.
        return { valid: false, error: "Servicio no disponible. Intenta más tarde." };
      }

      return { valid: false, error: "Código inválido o expirado" };
    },
    [subtotal, onDiscountChange],
  );

  const handleRemove = useCallback(() => {
    setApplied(null);
    writeApplied(null);
    onDiscountChange(0);
  }, [onDiscountChange]);

  return (
    <CouponInput
      applied={applied}
      onApply={handleApply}
      onRemove={handleRemove}
      className={className}
    />
  );
}
