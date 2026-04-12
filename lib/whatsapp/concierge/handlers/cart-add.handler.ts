import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { formatItemAdded, formatProductNotFound } from "../../message-templates";
import type { ConversationContext, ActionResult, Classification, CartItem } from "../types";
import { extractCartItems } from "../conversation-store";

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Adds one or more items to the conversation cart.
 * Looks up each product name in the DB to get the real price + unit.
 * Merges quantities for duplicate products.
 */
export async function cartAddHandler(
  ctx: ConversationContext,
  classification: Classification,
): Promise<ActionResult> {
  const requestedItems = classification.items ?? [];

  if (requestedItems.length === 0) {
    return {
      reply: "¿Qué producto deseas agregar? Escribe, por ejemplo: *quiero 2 kg de arroz*",
      newState: "cart",
    };
  }

  const existingCart: CartItem[] = extractCartItems(ctx.conversation);
  const updatedCart = [...existingCart];
  const notFoundNames: string[] = [];
  let lastAdded: CartItem | null = null;

  for (const req of requestedItems) {
    try {
      // tenantId always first filter (CLAUDE.md rule #3)
      const product = await (prisma as unknown as {
        product: {
          findFirst: (args: unknown) => Promise<{
            id: number;
            name: string;
            price: unknown;
            unit: string;
            stock: number | null;
          } | null>;
        };
      }).product.findFirst({
        where: {
          tenantId: ctx.tenantId,
          active: true,
          name: { contains: req.name, mode: "insensitive" },
        },
        select: { id: true, name: true, price: true, unit: true, stock: true },
        orderBy: { name: "asc" },
      });

      if (!product) {
        notFoundNames.push(req.name);
        continue;
      }

      const price =
        typeof product.price === "number"
          ? product.price
          : parseFloat(String(product.price));

      // Merge if already in cart
      const existing = updatedCart.find((c) => c.productId === product.id);
      if (existing) {
        existing.quantity += req.quantity;
      } else {
        const item: CartItem = {
          productId: product.id,
          name: product.name,
          quantity: req.quantity,
          price,
          unit: req.unit ?? product.unit,
        };
        updatedCart.push(item);
        lastAdded = item;
      }
    } catch (err) {
      logger.error("[cart-add-handler] DB error", {
        tenantId: ctx.tenantId,
        product: req.name,
        error: err instanceof Error ? err.message : String(err),
      });
      notFoundNames.push(req.name);
    }
  }

  if (updatedCart.length === existingCart.length && notFoundNames.length > 0) {
    // Nothing was added at all
    return {
      reply: formatProductNotFound(notFoundNames.join(", ")),
      newState: "cart",
    };
  }

  const addedItem = lastAdded ?? updatedCart[updatedCart.length - 1];
  let reply = formatItemAdded(addedItem, updatedCart.length);

  if (notFoundNames.length > 0) {
    reply += `\n\n⚠️ No encontré: *${notFoundNames.join(", ")}*. Verifica el nombre e intenta de nuevo.`;
  }

  return {
    reply,
    newState: "cart",
    updatedCartItems: updatedCart,
  };
}
