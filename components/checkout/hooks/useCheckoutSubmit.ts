import { useCallback } from "react";
import type { CartItem } from "@/contexts/cart-context";
import type { Customer } from "@/contexts/customer-context";
import { trackPurchase } from "@/lib/analytics";
import type { CheckoutDispatch } from "./useCheckoutState";
import type { CheckoutState } from "../types";
import {
  resolveEffectiveValues,
  sanitizeOrderItems,
  buildOrderPayload,
  buildCustomerForRegister,
  saveLastOrder,
  postWithRetry,
} from "./checkout-submit-helpers";

/**
 * useCheckoutSubmit — orquesta el envío final del pedido.
 *
 * Mantiene paridad estricta con la implementación original:
 *  - Doble guard de submitting (no se permite doble envío)
 *  - Sanitiza imágenes (data URIs y URLs > 500 chars)
 *  - Retry con backoff lineal (2s, 4s) hasta 3 intentos en errores 5xx
 *  - Track de purchase con `trackPurchase`
 *  - Auto-registro del cliente al cerrar
 *  - Notificación de orden pendiente al cart
 *  - Modal de confirmación tras 2.5s
 *
 * NO toca el cálculo de totales — el backend recompone server-side.
 */

type Args = {
  state: CheckoutState;
  items: CartItem[];
  finalTotal: number;
  effectiveCustomer: Customer | null;
  promo: { id: string; discountPercent: number } | null;
  discount: number;
  dispatch: CheckoutDispatch;
  cartActions: {
    clear: () => void;
    closeCart: () => void;
    markOrderPending: () => void;
  };
  customerActions: {
    register: (data: Customer) => void;
    openOrderStatusModal: () => void;
  };
  closeCheckout: () => void;
};

export type UseCheckoutSubmitResult = {
  submit: () => Promise<void>;
};

const SUCCESS_DELAY_MS = 2500;

export function useCheckoutSubmit({
  state,
  items,
  finalTotal,
  effectiveCustomer,
  promo,
  discount,
  dispatch,
  cartActions,
  customerActions,
  closeCheckout,
}: Args): UseCheckoutSubmitResult {
  const submit = useCallback(async () => {
    // 1. Guard de doble submit — CRÍTICO. Nunca eliminar.
    if (state.ui.submitting) return;
    dispatch({ type: "SET_UI", patch: { submitting: true, submitError: "" } });

    // 2. Resolver valores efectivos (state o cliente cargado)
    const effective = resolveEffectiveValues(state, effectiveCustomer);

    // 3. Pre-flight validation
    if (!effective.name) {
      dispatch({
        type: "SET_UI",
        patch: {
          submitting: false,
          submitError: "Por favor ingresa tu nombre completo.",
        },
      });
      return;
    }
    if (effective.dni && !/^\d{8}$/.test(effective.dni)) {
      dispatch({
        type: "SET_UI",
        patch: {
          submitting: false,
          submitError: "El DNI debe tener 8 dígitos.",
        },
      });
      return;
    }
    if (!effective.location) {
      dispatch({
        type: "SET_UI",
        patch: {
          submitting: false,
          submitError: "Por favor ingresa tu dirección de entrega.",
        },
      });
      return;
    }

    // 4. Sanitizar items y construir payload
    const orderItems = sanitizeOrderItems(items);
    const payload = buildOrderPayload({
      state,
      effective,
      orderItems,
      finalTotal,
      promo,
      discount,
    });

    // 5. Retry con backoff
    const res = await postWithRetry("/api/orders", payload);

    try {
      if (res?.ok) {
        const data = (await res.json()) as { id: string };
        dispatch({ type: "SET_UI", patch: { orderId: data.id } });

        saveLastOrder(data.id, items, finalTotal);

        cartActions.clear();
        cartActions.closeCart();
        cartActions.markOrderPending();
        window.dispatchEvent(
          new CustomEvent("bsm:orderCreated", { detail: { orderId: data.id } })
        );

        trackPurchase({
          orderId: data.id,
          total: finalTotal,
          items: items.map((i) => ({
            id: i.id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
        });

        const updatedCustomer = buildCustomerForRegister({
          effective,
          effectiveCustomer,
        });
        if (updatedCustomer) {
          customerActions.register(updatedCustomer);
        }

        dispatch({ type: "SET_STEP", step: "exito" });
        setTimeout(() => {
          customerActions.openOrderStatusModal();
          closeCheckout();
        }, SUCCESS_DELAY_MS);
      } else {
        try {
          const errBody = (await res!.json()) as {
            error?: string;
            issues?: { path: (string | number)[]; message: string }[];
          };
          if (errBody?.issues?.length) {
            console.error("[orders] Validation issues:", errBody.issues);
          } else {
            console.error("[orders] Error response:", errBody);
          }
        } catch {
          /* response wasn't JSON */
        }
        dispatch({
          type: "SET_UI",
          patch: {
            submitError:
              "No se pudo procesar tu pedido. Por favor intenta de nuevo.",
          },
        });
      }
    } catch {
      dispatch({
        type: "SET_UI",
        patch: {
          submitError:
            "Error de conexión. Verifica tu internet e intenta de nuevo.",
        },
      });
    }

    dispatch({ type: "SET_UI", patch: { submitting: false } });
  }, [
    state,
    items,
    finalTotal,
    effectiveCustomer,
    promo,
    discount,
    dispatch,
    cartActions,
    customerActions,
    closeCheckout,
  ]);

  return { submit };
}
