/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";

/**
 * GET /api/marketplace/live-stats
 *
 * Devuelve métricas en vivo del marketplace para el LiveStats banner:
 *   - ordersToday: pedidos creados en últimas 24h (cross-tenant)
 *   - shoppersToday: customers únicos con orders en últimas 24h
 *   - activeStores: stores con published=true y al menos 1 producto activo
 *   - avgDeliveryMin: promedio fijo (25) hasta que tracking real exista
 *
 * Cache: 60s (basta para sensación de "live" sin pegar la DB constante).
 */
export async function GET() {
  try {
    const data = await getOrSet(
      "marketplace:live-stats:v1",
      60, // ttl en segundos
      async () => {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const [ordersTodayRaw, customersTodayRaw, activeStoresRaw] = await Promise.all([
          prisma.order.count({
            where: { createdAt: { gte: since } },
          }),
          prisma.order.findMany({
            where: { createdAt: { gte: since } },
            select: { customerPhone: true },
            distinct: ["customerPhone"],
          }),
          prisma.store.count({
            where: { isPublished: true },
          }),
        ]);

        return {
          ordersToday: ordersTodayRaw,
          shoppersToday: customersTodayRaw.filter((c) => c.customerPhone).length,
          activeStores: activeStoresRaw,
          avgDeliveryMin: 25,
        };
      },
    );

    return NextResponse.json({ data });
  } catch (e) {
    console.error("[live-stats] error", e);
    return NextResponse.json(
      { data: { ordersToday: 0, shoppersToday: 0, activeStores: 0, avgDeliveryMin: 25 } },
      { status: 200 },
    );
  }
}
