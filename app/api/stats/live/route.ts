import { NextResponse } from "next/server";

/**
 * GET /api/stats/live
 *
 * Social proof REAL desde DB. Usado por LiveSocialProofBanner en heros del
 * marketplace/tienda para aplicar Cialdini Social Proof sin inventar datos.
 *
 * Regla de autenticidad (research Buyer Psychology Framework 2026):
 *   - Si bodegas>=5 OR pedidos24h>=5 → show=true
 *   - Si bodegas>=3 AND pedidos24h>=1 → show=true (umbral suave Pucallpa)
 *   - Caso contrario → show=false (escondemos el banner)
 *
 * Cache: public 5 min + SWR 60s.
 */
export async function GET() {
  try {
    const { prisma } = await import("@/lib/prisma");

    // Paralelizar queries
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since1h = new Date(now - 60 * 60 * 1000);

    const [activeStores, ordersLast24h, ordersLastHour, activeShoppers] = await Promise.all([
      prisma.store.count({
        where: { isPublished: true },
      }).catch(() => 0),
      prisma.order.count({
        where: { createdAt: { gte: since24h } },
      }).catch(() => 0),
      prisma.order.count({
        where: { createdAt: { gte: since1h } },
      }).catch(() => 0),
      // Clientes únicos que ordenaron en las ultimas 24h (social proof fuerte)
      prisma.order
        .findMany({
          where: { createdAt: { gte: since24h } },
          select: { customerPhone: true },
          distinct: ["customerPhone"],
        })
        .then((rows) => rows.filter((r) => r.customerPhone).length)
        .catch(() => 0),
    ]);

    // Umbrales de autenticidad
    const show =
      activeStores >= 5 ||
      ordersLast24h >= 5 ||
      (activeStores >= 3 && ordersLast24h >= 1);

    return NextResponse.json(
      {
        activeStores,
        ordersToday: ordersLast24h,
        ordersLastHour,
        activeShoppers,
        show,
        // Señal adicional para UI — si hay actividad en la ultima hora
        isHot: ordersLastHour >= 2,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      },
    );
  } catch {
    return NextResponse.json({
      activeStores: 0,
      ordersToday: 0,
      ordersLastHour: 0,
      activeShoppers: 0,
      show: false,
      isHot: false,
    });
  }
}
