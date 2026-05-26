import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * RecommendationsDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/recommendations.
 * Motor colaborativo simple: historial propio → co-compradores → categorías → best-sellers.
 * SECURITY 2026-05-25 (audit): tenantId AHORA obligatorio (1er param). Antes
 * `product.findMany` traía catálogo de TODOS los tenants → leak cross-tenant +
 * O(productos_globales) en RAM por request. Todas las queries scopean por tenant.
 */

export interface RecommendedProduct {
  id: number;
  name: string;
  category: string;
  price: unknown; // Decimal — el caller lo serializa
  image: string | null;
  unit: string | null;
}

interface RecommendOpts {
  phone?: string | null;
  limit?: number;
}

export const RecommendationsDB = {
  /**
   * Devuelve productos recomendados para un phone dado (o best-sellers si sin historial).
   * Algoritmo: collaborative filtering → categorías frecuentes → best-sellers fallback.
   */
  async forPhone(tenantId: string, opts: RecommendOpts = {}): Promise<RecommendedProduct[]> {
    const { phone, limit = 8 } = opts;
    const safeLimit = Math.min(Math.max(limit, 1), 30);

    // Productos activos del tenant para mapeo rápido (scopeado — antes era global)
    const allProducts = await prisma.product.findMany({
      where: { tenantId, active: true },
      select: {
        id: true,
        name: true,
        category: true,
        price: true,
        image: true,
        unit: true,
        stock: true,
      },
      // Perf 2026-05-26 (P0-4): cap defensivo al catálogo cargado en RAM por
      // request. Un tenant patológico con miles de productos activos no debe
      // hacer crecer el productMap sin techo. 2000 cubre cualquier bodega real.
      take: 2000,
    });
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    let recommended: number[] = [];

    if (phone) {
      // 1. Historial del cliente
      const [orderItems, saleItems] = await Promise.all([
        prisma.orderItem.findMany({
          where: { order: { tenantId, customerPhone: phone, status: { not: "cancelado" } } },
          select: { productId: true },
        }),
        prisma.saleItem.findMany({
          where: { sale: { tenantId, customerPhone: phone } },
          select: { productId: true },
        }),
      ]);

      const boughtIds = new Set<number>();
      for (const i of orderItems) if (i.productId) boughtIds.add(i.productId);
      for (const i of saleItems) if (i.productId) boughtIds.add(i.productId);

      if (boughtIds.size > 0) {
        // 2. Clientes que compraron lo mismo
        const [coOrders, coSales] = await Promise.all([
          prisma.orderItem.findMany({
            where: {
              productId: { in: [...boughtIds] },
              order: { tenantId, customerPhone: { not: phone }, status: { not: "cancelado" } },
            },
            select: { order: { select: { customerPhone: true } } },
          }),
          prisma.saleItem.findMany({
            where: {
              productId: { in: [...boughtIds] },
              sale: { tenantId, customerPhone: { not: phone } },
            },
            select: { sale: { select: { customerPhone: true } } },
          }),
        ]);

        const coPhones = new Set<string>();
        for (const i of coOrders) if (i.order.customerPhone) coPhones.add(i.order.customerPhone);
        for (const i of coSales) if (i.sale.customerPhone) coPhones.add(i.sale.customerPhone);

        if (coPhones.size > 0) {
          // Perf 2026-05-26 (P0-4): acotar el fan-out. Un producto muy popular
          // puede tener miles de co-compradores → el `IN [...coPhones]` del paso
          // 3 explotaba O(N²). 200 co-clientes son más que suficientes para una
          // señal colaborativa robusta y mantienen la query acotada.
          const coPhonesArr = [...coPhones].slice(0, 200);
          // 3. Productos que esos co-clientes compraron y el cliente actual no
          const [coOrderItems, coSaleItems] = await Promise.all([
            prisma.orderItem.findMany({
              where: {
                order: { tenantId, customerPhone: { in: coPhonesArr }, status: { not: "cancelado" } },
                productId: { notIn: [...boughtIds] },
              },
              select: { productId: true },
            }),
            prisma.saleItem.findMany({
              where: {
                sale: { tenantId, customerPhone: { in: coPhonesArr } },
                productId: { notIn: [...boughtIds] },
              },
              select: { productId: true },
            }),
          ]);

          const freq = new Map<number, number>();
          for (const i of coOrderItems) if (i.productId) freq.set(i.productId, (freq.get(i.productId) ?? 0) + 1);
          for (const i of coSaleItems) if (i.productId) freq.set(i.productId, (freq.get(i.productId) ?? 0) + 1);

          recommended = [...freq.entries()]
            .filter(([id]) => productMap.has(id) && (productMap.get(id)!.stock ?? 0) > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, safeLimit)
            .map(([id]) => id);
        }

        // 4. Rellenar con misma categoría si faltan
        if (recommended.length < safeLimit) {
          const boughtProducts = [...boughtIds].map((id) => productMap.get(id)).filter(Boolean);
          const catFreq = new Map<string, number>();
          for (const p of boughtProducts) if (p) catFreq.set(p.category, (catFreq.get(p.category) ?? 0) + 1);

          const topCats = [...catFreq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
          const usedIds = new Set([...boughtIds, ...recommended]);

          for (const cat of topCats) {
            if (recommended.length >= safeLimit) break;
            const catProducts = allProducts
              .filter((p) => p.category === cat && !usedIds.has(p.id) && (p.stock ?? 0) > 0)
              .sort((a, b) => toNumOrZero(b.price) - toNumOrZero(a.price));
            for (const p of catProducts) {
              if (recommended.length >= safeLimit) break;
              recommended.push(p.id);
              usedIds.add(p.id);
            }
          }
        }
      }
    }

    // 5. Fallback: best-sellers últimos 30 días
    if (recommended.length < safeLimit) {
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const topSold = await prisma.orderItem.groupBy({
        by: ["productId"],
        where: { order: { tenantId, createdAt: { gte: since }, status: { not: "cancelado" } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: safeLimit * 2,
      });

      const usedIds = new Set(recommended);
      for (const row of topSold) {
        if (recommended.length >= safeLimit) break;
        const id = row.productId;
        if (id && !usedIds.has(id) && productMap.has(id) && (productMap.get(id)!.stock ?? 0) > 0) {
          recommended.push(id);
          usedIds.add(id);
        }
      }
    }

    return recommended
      .map((id) => productMap.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        image: p.image,
        unit: p.unit,
      }));
  },
};
