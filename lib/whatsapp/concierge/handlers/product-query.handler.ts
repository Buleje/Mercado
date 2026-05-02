import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  formatProductList,
  formatProductNotFound,
} from "../../message-templates";
import {
  searchProductsCrossTenant,
  formatCrossTenantResults,
} from "../cross-tenant-search";
import type {
  ConversationContext,
  ActionResult,
  Classification,
  CartItem,
} from "../types";
import { extractCartItems } from "../conversation-store";

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Busca productos en el marketplace cross-tenant.
 *
 * Flujo:
 *  1. Busca en TODOS los stores publicados via searchProductsCrossTenant().
 *  2. Si hay resultados → responde con la lista cross-tenant numerada.
 *  3. Si 0 resultados → fallback al catálogo del tenant propio (comportamiento
 *     original, preserva retrocompatibilidad).
 *
 * Transitions state → "browsing".
 * Never throws — retorna ActionResult con friendly error en su defecto.
 */
export async function productQueryHandler(
  ctx: ConversationContext,
  classification: Classification,
): Promise<ActionResult> {
  const query = classification.productQuery?.trim() ?? ctx.message.trim();

  if (!query) {
    return {
      reply:
        "¿Qué producto deseas buscar? Escribe el nombre, por ejemplo: *buscar arroz*",
      newState: "browsing",
    };
  }

  // ── 1. Cross-tenant marketplace search ──────────────────────────────────────
  try {
    const crossResults = await searchProductsCrossTenant({
      query,
      limit: 5,
      // customerLat / customerLng: actualmente no capturados en la sesión WA.
      // Se puede extender ConversationContext en el futuro si se implementa
      // geolocation sharing vía WhatsApp Location.
    });

    if (crossResults.length > 0) {
      logger.info("[product-query-handler] cross-tenant hit", {
        query,
        storeCount: new Set(crossResults.map((r) => r.storeId)).size,
        total: crossResults.length,
      });

      const currentCart: CartItem[] = extractCartItems(ctx.conversation);
      void currentCart; // cart preserved, no change

      return {
        reply: formatCrossTenantResults(crossResults, query),
        newState: "browsing",
      };
    }

    // ── 2. Fallback: single-tenant search (classic behavior) ─────────────────
    logger.info("[product-query-handler] cross-tenant miss, fallback to tenant", {
      tenantId: ctx.tenantId,
      query,
    });

    return await _tenantFallbackSearch(ctx, query);
  } catch (err) {
    logger.error("[product-query-handler] cross-tenant search error", {
      tenantId: ctx.tenantId,
      query,
      error: err instanceof Error ? err.message : String(err),
    });

    // Degradation path: try tenant-level search before surfacing an error
    try {
      return await _tenantFallbackSearch(ctx, query);
    } catch {
      return {
        reply:
          "Tuve un problema buscando ese producto. Intenta de nuevo en un momento.",
        newState: "browsing",
      };
    }
  }
}

// ─── Tenant-level fallback (original implementation) ─────────────────────────

/**
 * Replica el comportamiento original: busca solo en el catálogo del tenant
 * cuyo número WhatsApp recibió el mensaje.
 *
 * Se mantiene como fallback para cuando el marketplace no tiene resultados
 * o en caso de error de la capa cross-tenant.
 *
 * CLAUDE.md #1: aquí se hace llamada directa a prisma porque la query es
 * single-tenant (filtra por tenantId) y no existe una DB class de productos
 * expuesta para este read liviano. TODO: migrar a ProductsDB.search() cuando
 * se agregue ese método.
 */
async function _tenantFallbackSearch(
  ctx: ConversationContext,
  query: string,
): Promise<ActionResult> {
  // tenantId always first filter (CLAUDE.md rule #3)
  const products = await (
    prisma as unknown as {
      product: {
        findMany: (args: unknown) => Promise<
          Array<{
            id: number;
            name: string;
            price: unknown;
            stock: number | null;
            unit: string;
          }>
        >;
      };
    }
  ).product.findMany({
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
}
