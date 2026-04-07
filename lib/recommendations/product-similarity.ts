/**
 * lib/recommendations/product-similarity.ts
 *
 * Algoritmo de co-ocurrencia para recomendaciones "quien compró X también compró Y".
 *
 * Lógica:
 *  1. Buscar órdenes completadas que incluyan el productId de referencia.
 *  2. Obtener todos los otros items de esas órdenes.
 *  3. Contar cuántas veces cada producto co-ocurre con el de referencia.
 *  4. Devolver top N ordenado por frecuencia descendente.
 *
 * Cache agresivo de 24 h porque el patrón de compra cambia lento.
 */

import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import type { OrderStatus } from "@/lib/generated/prisma/client";

// ── Tipos públicos ───────────────────────────────────────────────────────────

export type RelatedProduct = {
  productId: number;
  name: string;
  price: number;
  image: string | null;
  /** Número de órdenes en las que co-ocurre con el producto de referencia */
  score: number;
};

// Statuses que representan órdenes completadas / entregadas
const COMPLETED_STATUSES: OrderStatus[] = ["confirmado", "en_camino", "entregado"];

// Máximo de órdenes a analizar para no colapsar la DB
const MAX_ORDERS = 500;

// TTL de cache: 24 horas en segundos
const CACHE_TTL = 86_400;

// ── Función principal ────────────────────────────────────────────────────────

/**
 * Devuelve los top `limit` productos que fueron comprados junto con `productId`.
 * Usa cache de 24 h. Multi-tenant estricto: el tenantId está incluido en la clave.
 */
export async function getRelatedProducts(
  tenantId: string,
  productId: number,
  limit = 5,
): Promise<RelatedProduct[]> {
  const cacheKey = `recommendations:related:${tenantId}:${productId}:${limit}`;

  return getOrSet<RelatedProduct[]>(cacheKey, CACHE_TTL, async () => {
    logger.debug("[recommendations] computing related products", {
      tenantId,
      productId,
      limit,
    });

    // Paso 1: órdenes completadas que incluyen el producto de referencia
    const ordersWithTarget = await prisma.order.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: COMPLETED_STATUSES },
        items: { some: { productId } },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: MAX_ORDERS,
    });

    if (ordersWithTarget.length === 0) {
      logger.debug("[recommendations] no completed orders found for product", {
        tenantId,
        productId,
      });
      return [];
    }

    const orderIds = ordersWithTarget.map((o) => o.id);

    // Paso 2: todos los items de esas órdenes, excluyendo el producto de referencia
    const coItems = await prisma.orderItem.findMany({
      where: {
        orderId: { in: orderIds },
        productId: { not: productId },
      },
      select: {
        productId: true,
        name: true,
        price: true,
        image: true,
      },
    });

    // Paso 3: contar co-ocurrencias por producto
    // Usamos Map<productId, { count, lastSeenItem }> para mantener metadata
    type ItemMeta = {
      count: number;
      name: string;
      price: number;
      image: string | null;
    };

    const counts = new Map<number, ItemMeta>();

    for (const item of coItems) {
      if (item.productId == null) continue;

      const existing = counts.get(item.productId);
      if (existing) {
        existing.count++;
      } else {
        counts.set(item.productId, {
          count: 1,
          name: item.name,
          price: item.price,
          image: item.image || null,
        });
      }
    }

    // Paso 4: ordenar por score desc y tomar los top N
    const related: RelatedProduct[] = Array.from(counts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([pid, meta]) => ({
        productId: pid,
        name: meta.name,
        price: meta.price,
        image: meta.image,
        score: meta.count,
      }));

    logger.debug("[recommendations] computed related products", {
      tenantId,
      productId,
      relatedCount: related.length,
    });

    return related;
  });
}

// ── Recomendaciones por historial de cliente ─────────────────────────────────

/**
 * Devuelve productos recomendados para un cliente basándose en su historial completo.
 * Agrega los scores de co-ocurrencia de todos los productos que el cliente compró,
 * excluyendo los que ya compró para no repetir.
 */
export async function getRecommendedForCustomer(
  tenantId: string,
  customerPhone: string,
  limit = 5,
): Promise<RelatedProduct[]> {
  const cacheKey = `recommendations:customer:${tenantId}:${customerPhone}:${limit}`;

  return getOrSet<RelatedProduct[]>(cacheKey, CACHE_TTL, async () => {
    logger.debug("[recommendations] computing customer recommendations", {
      tenantId,
      customerPhone,
      limit,
    });

    // Obtener historial de compras del cliente (órdenes completadas)
    const customerOrders = await prisma.order.findMany({
      where: {
        tenantId,
        customerPhone,
        deletedAt: null,
        status: { in: COMPLETED_STATUSES },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: MAX_ORDERS,
    });

    const customerOrderIds = customerOrders.map((o) => o.id);

    // Items de esas órdenes para saber qué compró el cliente
    const customerItems = await prisma.orderItem.findMany({
      where: { orderId: { in: customerOrderIds } },
      select: { productId: true },
    });

    if (customerOrders.length === 0) {
      return [];
    }

    // Productos que el cliente ya compró (para excluirlos de las recomendaciones)
    const alreadyBought = new Set<number>();
    for (const item of customerItems) {
      if (item.productId != null) alreadyBought.add(item.productId);
    }

    // Para cada producto comprado, obtener sus co-ocurrencias y sumar scores
    const aggregated = new Map<
      number,
      { score: number; name: string; price: number; image: string | null }
    >();

    for (const productId of alreadyBought) {
      // Reusar la función de co-ocurrencia con un límite generoso
      const related = await getRelatedProducts(tenantId, productId, 20);
      for (const r of related) {
        if (alreadyBought.has(r.productId)) continue; // no recomendar ya comprados
        const existing = aggregated.get(r.productId);
        if (existing) {
          existing.score += r.score;
        } else {
          aggregated.set(r.productId, {
            score: r.score,
            name: r.name,
            price: r.price,
            image: r.image,
          });
        }
      }
    }

    const recommendations: RelatedProduct[] = Array.from(aggregated.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([pid, meta]) => ({
        productId: pid,
        name: meta.name,
        price: meta.price,
        image: meta.image,
        score: meta.score,
      }));

    logger.debug("[recommendations] computed customer recommendations", {
      tenantId,
      customerPhone,
      count: recommendations.length,
    });

    return recommendations;
  });
}
