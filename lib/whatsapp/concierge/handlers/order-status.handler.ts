import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { formatCart, formatOrderConfirmation } from "../../message-templates";
import type { ConversationContext, ActionResult, Classification, CartItem } from "../types";
import { extractCartItems, extractState } from "../conversation-store";

// ─── Label helpers ────────────────────────────────────────────────────────────

function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pendiente de confirmación",
    confirmed: "Confirmado",
    preparing: "Preparando tu pedido",
    ready: "Listo para entrega",
    delivering: "En camino",
    delivered: "Entregado",
    cancelled: "Cancelado",
  };
  return labels[status] ?? status;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Handles "consultar_estado" intent.
 * - If current state is "cart" → shows cart summary (not yet an order).
 * - Otherwise → queries the most recent order for this phone + tenant.
 */
export async function orderStatusHandler(
  ctx: ConversationContext,
  _classification: Classification,
): Promise<ActionResult> {
  const currentState = extractState(ctx.conversation);

  // In cart state: the "order" is still local — show cart summary
  if (currentState === "cart") {
    const items: CartItem[] = extractCartItems(ctx.conversation);
    if (items.length === 0) {
      return {
        reply: "Tu carrito está vacío. Escribe *ver categorías* para empezar.",
        newState: "cart",
      };
    }
    const total = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
    return {
      reply: formatCart(items, total),
      newState: "cart",
    };
  }

  // For checkout / awaiting_payment / completed → look up real order in DB
  try {
    const order = await (prisma as unknown as {
      order: {
        findFirst: (args: unknown) => Promise<{
          id: string;
          status: string;
          total: unknown;
          deliveryAddress: string | null;
          items: Array<{
            name: string;
            quantity: number;
            price: unknown;
            unit: string;
            productId: number;
          }>;
        } | null>;
      };
    }).order.findFirst({
      where: {
        tenantId: ctx.tenantId,
        customerPhone: ctx.phone,
        status: { notIn: ["cancelled"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        total: true,
        deliveryAddress: true,
        items: {
          select: { name: true, quantity: true, price: true, unit: true, productId: true },
        },
      },
    });

    if (!order) {
      return {
        reply:
          "No encontré pedidos recientes a tu nombre.\n\nEscribe *hola* para empezar un nuevo pedido.",
        newState: "idle",
      };
    }

    const statusLabel = orderStatusLabel(order.status);
    const total =
      typeof order.total === "number"
        ? order.total
        : parseFloat(String(order.total));

    const cartItems: CartItem[] = order.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      quantity: i.quantity,
      price: typeof i.price === "number" ? i.price : parseFloat(String(i.price)),
      unit: i.unit,
    }));

    const address = order.deliveryAddress ?? "Por confirmar";
    const base = formatOrderConfirmation(order.id, cartItems, total, address);

    return {
      reply: `${base}\n\n📦 *Estado actual:* ${statusLabel}`,
      newState: currentState,
    };
  } catch (err) {
    logger.error("[order-status-handler] DB error", {
      tenantId: ctx.tenantId,
      phone: ctx.phone,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      reply: "No pude consultar el estado de tu pedido en este momento. Intenta en un momento.",
      newState: currentState,
    };
  }
}
