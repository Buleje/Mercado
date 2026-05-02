import "server-only";
import { logger } from "@/lib/logger";
import {
  formatOrderConfirmation,
  formatAskAddress,
  formatEmptyCartWarning,
  formatCart,
} from "../../message-templates";
import type { ConversationContext, ActionResult, Classification, CartItem } from "../types";
import { extractCartItems } from "../conversation-store";
import { checkoutMultiVendor } from "../multi-vendor-checkout";

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Handles "confirmar" intent — creates an Order from the current cart.
 *
 * ADR-046 constraint: orders.db.ts is a danger zone. We call the internal
 * REST endpoint POST /api/orders instead of using the DB class directly,
 * to avoid bypassing idempotency and state-machine checks.
 *
 * Flow:
 *  1. If cart is empty → warn user.
 *  2. If no delivery address in conversation → ask for it.
 *  3. Otherwise → POST /api/orders → return confirmation.
 */
export async function orderCreateHandler(
  ctx: ConversationContext,
  _classification: Classification,
): Promise<ActionResult> {
  const items: CartItem[] = extractCartItems(ctx.conversation);

  if (items.length === 0) {
    return {
      reply: formatEmptyCartWarning(),
      newState: "cart",
    };
  }

  const total = items.reduce((acc, i) => acc + i.price * i.quantity, 0);

  // If we don't have a delivery address yet, ask for it first
  const deliveryAddress =
    ctx.conversation?.deliveryAddress?.trim() ?? "";

  if (!deliveryAddress) {
    return {
      reply: formatAskAddress("Buleje", total),
      newState: "checkout",
    };
  }

  // ── Detect multi-vendor cart ─────────────────────────────────────────────
  // A cart is multi-vendor when items carry storeId AND there are 2+ distinct
  // storeIds.  Single-vendor carts (all same storeId or storeId missing) fall
  // through to the legacy /api/orders path.
  const distinctStores = new Set(
    items.map((i) => i.storeId).filter((s): s is string => Boolean(s)),
  );

  if (distinctStores.size >= 2 && ctx.conversation?.id) {
    return await handleMultiVendorCheckout(ctx, items, deliveryAddress);
  }

  // ── Legacy single-store path ─────────────────────────────────────────────
  // Call internal API to create the order (avoids danger-zone direct DB access)
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

    const orderPayload = {
      tenantId: ctx.tenantId,
      customerPhone: ctx.phone,
      deliveryAddress,
      items: items.map((i) => ({
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        unit: i.unit,
      })),
      source: "whatsapp",
    };

    const res = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.error("[order-create-handler] /api/orders failed", {
        status: res.status,
        body: text.slice(0, 200),
      });
      return {
        reply: "Hubo un problema al crear tu pedido. Intenta de nuevo o escribe *hablar con humano*.",
        newState: "cart",
      };
    }

    const data = (await res.json()) as { id?: string; orderId?: string };
    const orderId = data.id ?? data.orderId ?? "desconocido";

    return {
      reply: formatOrderConfirmation(orderId, items, total, deliveryAddress),
      newState: "awaiting_payment",
      updatedCartItems: [], // clear cart after order creation
    };
  } catch (err) {
    logger.error("[order-create-handler] fetch error", {
      tenantId: ctx.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      reply: "No pude procesar tu pedido en este momento. Intenta en un momento o escribe *hablar con humano*.",
      newState: "cart",
    };
  }
}

// ─── Multi-vendor checkout handler ────────────────────────────────────────────

async function handleMultiVendorCheckout(
  ctx: ConversationContext,
  items: CartItem[],
  deliveryAddress: string,
): Promise<ActionResult> {
  // ctx.conversation!.id guaranteed non-null — caller checks it
  const conversationId = ctx.conversation!.id;

  try {
    const result = await checkoutMultiVendor(
      conversationId,
      items,
      deliveryAddress,
      ctx.phone,
      ctx.tenantId,
    );

    const storeNames = result.orders.map((o) => o.storeName);
    const uniqueStoreNames = [...new Set(storeNames)];
    const yapeNumber =
      process.env.YAPE_NUMBER ?? process.env.NEXT_PUBLIC_YAPE_NUMBER ?? "";

    // Build grouped cart summary per store
    const storeLines = result.orders
      .map(
        (o) =>
          `• *${o.storeName}*: S/ ${o.subtotal.toFixed(2)}`,
      )
      .join("\n");

    const reply =
      `✅ *¡Pedido confirmado en ${result.orders.length} tienda${result.orders.length > 1 ? "s" : ""}!*\n\n` +
      `${storeLines}\n\n` +
      `*Total a pagar: S/ ${result.totalAmount.toFixed(2)}*\n\n` +
      `📲 Por favor, envía la captura de tu pago Yape al número *${yapeNumber || "[número Yape no configurado]"}*.\n` +
      `Referencia de pago: \`${result.paymentApprovalId.slice(0, 8).toUpperCase()}\`\n\n` +
      `🏪 Tu pedido se preparará en: ${uniqueStoreNames.join(", ")}.\n` +
      `Dirección de entrega: ${deliveryAddress}`;

    return {
      reply,
      newState: "awaiting_payment_capture",
      updatedCartItems: [], // clear cart after checkout
    };
  } catch (err) {
    logger.error("[order-create-handler] multi-vendor checkout failed", {
      tenantId: ctx.tenantId,
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      reply:
        "Hubo un problema al procesar tu pedido multi-tienda. Intenta de nuevo o escribe *hablar con humano*.",
      newState: "cart",
    };
  }
}

/**
 * Handles "cancelar_pedido" intent — clears the cart and resets to idle.
 */
export async function orderCancelHandler(
  ctx: ConversationContext,
  _classification: Classification,
): Promise<ActionResult> {
  void ctx; // all context is handled by returning newState + empty cart
  const cleared: CartItem[] = [];
  const total = 0;
  void total;

  return {
    reply:
      "Tu carrito ha sido vaciado. ¡Cuando quieras volver a pedir, aquí estaremos! 🛒\n\nEscribe *hola* para ver el menú.",
    newState: "idle",
    updatedCartItems: cleared,
  };
}
