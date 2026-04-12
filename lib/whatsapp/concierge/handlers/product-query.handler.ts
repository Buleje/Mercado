import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { formatProductList, formatProductNotFound } from "../../message-templates";
import type { ConversationContext, ActionResult, Classification, CartItem } from "../types";
import { extractCartItems } from "../conversation-store";

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Searches for products by name and returns the top-3 results formatted
 * as a WhatsApp message. Transitions the session to "browsing".
 */
export async function productQueryHandler(
  ctx: ConversationContext,
  classification: Classification,
): Promise<ActionResult> {
  const query = classification.productQuery?.trim() ?? ctx.message.trim();

  if (!query) {
    return {
      reply: "¿Qué producto deseas buscar? Escribe el nombre, por ejemplo: *buscar arroz*",
      newState: "browsing",
    };
  }

  try {
    // tenantId is always the first filter (CLAUDE.md rule #3)
    const products = await (prisma as unknown as {
      product: {
        findMany: (args: unknown) => Promise<Array<{
          id: number;
          name: string;
          price: unknown;
          stock: number | null;
          unit: string;
        }>>;
      };
    }).product.findMany({
      where: {
        tenantId: ctx.tenantId,
        active: true,
        name: { contains: query, mode: "insensitive" },
      },
      select: { id: true, name: true, price: true, stock: true, unit: true },
      orderBy: { name: "asc" },
      take: 3,
    });

    if (products.length === 0) {
      return {
        reply: formatProductNotFound(query),
        newState: "browsing",
      };
    }

    const entries = products.map((p) => ({
      id: p.id,
      name: p.name,
      price: typeof p.price === "number" ? p.price : parseFloat(String(p.price)),
      stock: p.stock,
      unit: p.unit,
    }));

    const currentCart: CartItem[] = extractCartItems(ctx.conversation);
    void currentCart; // cart preserved, no change

    return {
      reply: formatProductList(entries, query),
      newState: "browsing",
    };
  } catch (err) {
    logger.error("[product-query-handler] DB error", {
      tenantId: ctx.tenantId,
      query,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      reply: "Tuve un problema buscando ese producto. Intenta de nuevo en un momento.",
      newState: "browsing",
    };
  }
}
