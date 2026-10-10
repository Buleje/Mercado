import type { CartItem } from "@/contexts/cart-context";
import type { Customer, SavedLocation } from "@/contexts/customer-context";
import type { DbOrderItem } from "@/lib/jsondb";
import type { CheckoutState, LoyaltyState, PaymentMethod } from "../types";
import {
  maxPuntosCanjeables,
  solesPorPuntos,
  type DescuentoAutomaticoVista,
} from "@/lib/pricing/total-pedido";
import { PTS_PER_SOL } from "@/lib/loyalty-constants";

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
  payment: PaymentMethod;
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
 * Genera un idempotency key UUID v4 para un intento de checkout.
 * Debe generarse UNA vez por intento (antes del primer POST) y
 * reutilizarse en cada retry del mismo envío.
 */
export function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback para entornos sin crypto.randomUUID (tests Node <19)
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Construye el payload JSON para `POST /api/orders`.
 * NOTA: el backend recompone el total — este `total` es solo informativo
 * para tracking y antifraude.
 */
/**
 * Teléfono que viaja en el pedido (o undefined si es muy corto). La cotización
 * del descuento automático usa el MISMO valor: si difiriera, la vista previa y
 * el cobro mirarían clientes distintos.
 */
export function telefonoDelPedido(phone: string): string | undefined {
  return phone.length >= 6 ? phone : undefined;
}

/** Canje de puntos tal como lo ve (y lo manda) el checkout. */
export interface CanjeVista {
  /** Sesión verificada del mismo teléfono del pedido, con saldo leído. */
  disponible: boolean;
  /** Máximo en soles enteros que deja el deslizador (saldo y tope). */
  maxSoles: number;
  /** Puntos que viajan en `puntosACanjear` (múltiplo de 100). */
  puntos: number;
  /** Soles que restan del total (`calcularTotalPedido`). */
  soles: number;
}

/**
 * Canje de la vista previa con las MISMAS reglas que el servidor
 * (`maxPuntosCanjeables`, `solesPorPuntos`): solo si los puntos son del
 * teléfono del pedido y hay sesión verificada; el deslizador va de a S/ 1.
 */
export function canjeDeLaVista(
  loyalty: Pick<LoyaltyState, "points" | "redemptionSoles" | "sesionVerificada" | "telefono">,
  telefonoPedido: string | undefined,
  totalSinPuntos: number,
): CanjeVista {
  const tel = (telefonoPedido ?? "").replace(/\D/g, "").slice(-9);
  const disponible =
    loyalty.sesionVerificada === true &&
    loyalty.points !== null &&
    !!loyalty.telefono &&
    tel === loyalty.telefono;
  if (!disponible) return { disponible: false, maxSoles: 0, puntos: 0, soles: 0 };
  const maxSoles = Math.floor(maxPuntosCanjeables(loyalty.points ?? 0, totalSinPuntos) / PTS_PER_SOL);
  const puntos = Math.max(0, Math.min(Math.floor(loyalty.redemptionSoles), maxSoles)) * PTS_PER_SOL;
  return { disponible, maxSoles, puntos, soles: solesPorPuntos(puntos) };
}

/**
 * Firma de lo que decide el total en el servidor (productos, cantidades,
 * precios, teléfono, cupón y promo). Un total corregido por un 422 solo vale
 * mientras la firma no cambie: si el cliente toca el carrito, se descarta.
 */
export function firmaDelTotal(args: {
  items: CartItem[];
  telefono: string | undefined;
  cupon: string;
  promoId: string;
  /** Puntos canjeados: cambiar el canje cambia el total. */
  puntos?: number;
}): string {
  const items = args.items
    .map((i) => `${i.id}:${i.quantity}:${i.price}`)
    .sort()
    .join(",");
  return `${items}|${args.telefono ?? ""}|${args.cupon}|${args.promoId}|${args.puntos ?? 0}`;
}

export function buildOrderPayload(args: {
  state: CheckoutState;
  effective: EffectiveValues;
  orderItems: DbOrderItem[];
  /**
   * Total que cobra el servidor (`calcularTotalPedido`): sin propina, que el
   * pedido no guarda. Si no coincide con el del servidor, responde 422.
   */
  totalPedido: number;
  promo: { id: string } | null;
  discount: number;
  juntaCode?: string;
  /** Puntos a canjear (`canjeDeLaVista`); 0 o ausente = sin canje. */
  puntosACanjear?: number;
}): string {
  const { state, effective, orderItems, totalPedido, promo, discount, juntaCode, puntosACanjear } =
    args;
  return JSON.stringify({
    customer: {
      name: effective.name,
      phone: telefonoDelPedido(effective.phone),
      location: effective.location || undefined,
      reference: effective.reference || undefined,
    },
    items: orderItems,
    total: totalPedido,
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
    ...(juntaCode && { juntaCode }),
    ...(puntosACanjear && puntosACanjear > 0 && { puntosACanjear }),
    ...(promo && { appliedPromoId: promo.id, discountAmount: discount }),
    ...(state.coupon.applied &&
      state.coupon.code.trim() && {
        appliedCouponCode: state.coupon.code.trim(),
        couponDiscount: state.coupon.discount,
      }),
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
  /** Descuento automático que cobró el servidor (la confirmación lo muestra). */
  descuento?: DescuentoAutomaticoVista | null,
) {
  try {
    localStorage.setItem(
      "buleje-last-order",
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
        ...(descuento && descuento.monto > 0 && {
          descuento: { monto: descuento.monto, etiqueta: descuento.etiqueta },
        }),
        // HOTFIX-003: persist phone so public order lookups can prove ownership.
        ...(customerPhone && { customerPhone }),
      })
    );
  } catch {
    /* quota exceeded — no crítico */
  }
}

/** Retry con backoff lineal hasta `maxAttempts` veces en errores 5xx.
 *
 * @param idempotencyKey - UUID v4 generado por `generateRequestId()`.
 *   Se envía como `x-idempotency-key` en todos los reintentos para que
 *   el backend devuelva la order ya creada en lugar de crear una nueva.
 */
export async function postWithRetry(
  url: string,
  payload: string,
  maxAttempts = 3,
  idempotencyKey?: string,
): Promise<Response | null> {
  // Lazy require so the helper sigue siendo testable sin DOM.
  const { csrfHeaders } = await import("@/lib/csrf-client");
  let res: Response | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const extraHeaders: Record<string, string> = {};
      if (idempotencyKey) {
        extraHeaders["x-idempotency-key"] = idempotencyKey;
      }
      res = await fetch(url, {
        method: "POST",
        headers: csrfHeaders({
          "Content-Type": "application/json",
          ...extraHeaders,
        }),
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
