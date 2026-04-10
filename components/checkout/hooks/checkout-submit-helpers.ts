import type { CartItem } from "@/contexts/cart-context";
import type { Customer, SavedLocation } from "@/contexts/customer-context";
import type { DbOrderItem } from "@/lib/jsondb";
import type { CheckoutState } from "../types";

/**
 * Helpers puros para el flow de submit del checkout.
 *
 * Vivir aquí — separados del hook — facilita testearlos aislados y
 * reduce el tamaño del hook orquestador `useCheckoutSubmit`.
 */

export type EffectiveValues = {
  name: string;
  dni: string;
  phone: string;
  location: string;
  reference: string;
  payment: "yape" | "efectivo";
};

/** Resuelve los valores efectivos del cliente combinando state + cliente cargado. */
export function resolveEffectiveValues(
  state: CheckoutState,
  effectiveCustomer: Customer | null
): EffectiveValues {
  return {
    name: (state.customer.name || effectiveCustomer?.name || "").trim(),
    dni: state.customer.dni.replace(/\D/g, "").slice(0, 8),
    phone: (state.customer.phone || effectiveCustomer?.phone || "")
      .replace(/\D/g, "")
      .slice(-9),
    location: (state.address.location || effectiveCustomer?.location || "").trim(),
    reference: (state.address.reference || effectiveCustomer?.reference || "").trim(),
    payment: state.payment.method ?? "efectivo",
  };
}

/** Sanitiza imágenes de items: rechaza data-uris y trunca > 500 chars. */
export function sanitizeOrderItems(items: CartItem[]): DbOrderItem[] {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    price: i.price,
    quantity: i.quantity,
    unit: i.unit,
    image:
      i.image && !i.image.startsWith("data:") ? i.image.slice(0, 499) : "",
    ...(i.note ? { note: i.note } : {}),
  }));
}

/**
 * Construye el payload JSON para `POST /api/orders`.
 * NOTA: el backend recompone el total — este `total` es solo informativo
 * para tracking y antifraude.
 */
export function buildOrderPayload(args: {
  state: CheckoutState;
  effective: EffectiveValues;
  orderItems: DbOrderItem[];
  finalTotal: number;
  promo: { id: string } | null;
  discount: number;
}): string {
  const { state, effective, orderItems, finalTotal, promo, discount } = args;
  return JSON.stringify({
    customer: {
      name: effective.name,
      phone: effective.phone.length >= 6 ? effective.phone : undefined,
      location: effective.location || undefined,
      reference: effective.reference || undefined,
    },
    items: orderItems,
    total: finalTotal,
    notes: (state.address.notes ?? "").trim() || undefined,
    deliverySlot:
      state.delivery.slot !== "lo-antes-posible"
        ? state.delivery.slot
        : undefined,
    deliveryDate:
      state.delivery.custom && state.delivery.date
        ? state.delivery.date
        : undefined,
    deliveryTime:
      state.delivery.custom && state.delivery.time
        ? state.delivery.time
        : undefined,
    paymentMethod: effective.payment,
    yapeOperationNumber:
      effective.payment === "yape"
        ? state.payment.yapeOpNumber.trim()
        : undefined,
    deuda: effective.payment === "efectivo" ? true : undefined,
    ...(promo && { appliedPromoId: promo.id, discountAmount: discount }),
    ...(state.coupon.applied &&
      state.coupon.code.trim() && {
        appliedCouponCode: state.coupon.code.trim(),
        couponDiscount: state.coupon.discount,
      }),
    ...(state.payment.tip > 0 && { tip: state.payment.tip }),
  });
}

/**
 * Construye el `Customer` actualizado (con nueva ubicación si aplica)
 * para auto-registrar tras un pedido exitoso.
 */
export function buildCustomerForRegister(args: {
  effective: EffectiveValues;
  effectiveCustomer: Customer | null;
}): Customer | null {
  const { effective, effectiveCustomer } = args;
  const finalPhone =
    effective.phone.length >= 6
      ? effective.phone
      : (effectiveCustomer?.phone ?? "");
  if (!effective.name || !finalPhone) return null;

  const existingLocs: SavedLocation[] =
    effectiveCustomer?.locations ??
    (effectiveCustomer?.location
      ? [
          {
            id: "default",
            location: effectiveCustomer.location,
            reference: effectiveCustomer.reference ?? "",
          },
        ]
      : []);

  let updatedLocs = existingLocs;
  let activeId =
    effectiveCustomer?.activeLocationId ?? existingLocs[0]?.id ?? null;
  if (
    effective.location &&
    !existingLocs.some((l) => l.location.trim() === effective.location)
  ) {
    const newLocId = Date.now().toString();
    updatedLocs = [
      ...existingLocs,
      {
        id: newLocId,
        location: effective.location,
        reference: effective.reference,
      },
    ];
    activeId = newLocId;
  }

  return {
    name: effective.name,
    ...(effective.dni && { dni: effective.dni }),
    phone: finalPhone,
    location: effective.location || effectiveCustomer?.location || "",
    reference: effective.reference || effectiveCustomer?.reference || "",
    locations: updatedLocs,
    activeLocationId: activeId !== null ? activeId : undefined,
  };
}

/** Persiste el último pedido en localStorage para el OrderConfirmModal. */
export function saveLastOrder(
  orderId: string,
  items: CartItem[],
  finalTotal: number,
  customerPhone?: string,
) {
  try {
    localStorage.setItem(
      "bsm-last-order",
      JSON.stringify({
        id: orderId,
        items: items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          unit: i.unit ?? "",
          image: i.image ?? "",
        })),
        total: finalTotal,
        // HOTFIX-003: persist phone so public order lookups can prove ownership.
        ...(customerPhone && { customerPhone }),
      })
    );
  } catch {
    /* quota exceeded — no crítico */
  }
}

/** Retry con backoff lineal hasta `maxAttempts` veces en errores 5xx. */
export async function postWithRetry(
  url: string,
  payload: string,
  maxAttempts = 3
): Promise<Response | null> {
  let res: Response | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (res.ok || res.status < 500) break;
    } catch {
      /* network error, retry */
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return res;
}
