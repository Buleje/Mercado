import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { logger } from "@/lib/logger";

/**
 * GET /api/delivery/me/nearby-stores
 *
 * Devuelve las tiendas (Store) publicadas del tenant del partner con su
 * frecuencia REAL — número de entregas (DeliveryAssignment.delivered) cuyos
 * items provienen de cada tienda en los últimos 30 días. NO usa mocks.
 *
 * Brandon mayo 2026 v7: este endpoint reemplaza el placeholder anterior donde
 * el mapa solo pintaba marcadores con hash-offset del partner. Ahora cada
 * tienda tiene su lat/lng real, logo, slug y nivel de frecuencia (alto/medio
 * /bajo) calculado desde DeliveryAssignment.
 *
 * Auth: cookie `buleje-partner-sess` (requirePartner).
 */

type Heat = "high" | "medium" | "low";

interface NearbyStore {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  lat: number;
  lng: number;
  deliveriesLast30d: number;
  heat: Heat;
  rating: number;
  reviewCount: number;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    // Brandon mayo 2026 v7: respetar el flag `useThirdPartyDelivery` del
    // tenant. Si está desactivado, la tienda NO aparece en el mapa del rider.
    // Raw SQL para evitar dependencia del cache del Prisma Client en dev.
     
    const tenantRows = await prisma.$queryRaw<Array<{ useThirdPartyDelivery: boolean }>>`
      SELECT "useThirdPartyDelivery" FROM "Tenant" WHERE id = ${session.tenantId} LIMIT 1
    `;
    if (!tenantRows[0]?.useThirdPartyDelivery) {
      return NextResponse.json({ stores: [] });
    }

    // 1) Tiendas publicadas del tenant con geo válida.
     
    const stores = await prisma.store.findMany({
      where: {
        tenantId: session.tenantId,
        isPublished: true,
        lat: { not: null },
        lng: { not: null },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        lat: true,
        lng: true,
        rating: true,
        reviewCount: true,
      },
    });

    if (stores.length === 0) {
      return NextResponse.json({ stores: [] });
    }

    // 2) Para cada tienda, contar DeliveryAssignment.delivered en últimos 30d
    //    cuya order tenga al menos un OrderItem cuyo Product esté en
    //    StoreProduct.storeId = thisStore.id.
    //
    //    Hacemos una sola query con groupBy aproximado vía raw SQL para no
    //    sobre-fetchear. Nota: si no hay StoreProduct, count será 0 (honesto).
    const storeIds = stores.map((s) => s.id);
    const deliveriesByStore = await prisma.$queryRaw<
      Array<{ storeId: string; count: bigint }>
    >`
      SELECT sp."storeId" AS "storeId", COUNT(DISTINCT da.id)::bigint AS count
      FROM "DeliveryAssignment" da
      JOIN "Order" o ON o.id = da."orderId"
      JOIN "OrderItem" oi ON oi."orderId" = o.id
      JOIN "StoreProduct" sp ON sp."productId" = oi."productId"
      WHERE da."tenantId" = ${session.tenantId}
        AND da.status = 'delivered'
        AND da."deliveredAt" >= ${since}
        AND sp."storeId" = ANY(${storeIds})
      GROUP BY sp."storeId"
    `;
    const countMap = new Map<string, number>();
    for (const r of deliveriesByStore) {
      countMap.set(r.storeId, Number(r.count));
    }

    // 3) Heat threshold dinámico: el 33% top = high, siguiente 33% = medium,
    //    resto = low. Si todos son 0, todos low.
    const counts = stores.map((s) => countMap.get(s.id) ?? 0);
    const sortedCounts = [...counts].filter((n) => n > 0).sort((a, b) => b - a);
    const highCut = sortedCounts[Math.floor(sortedCounts.length / 3) - 1] ?? Infinity;
    const medCut = sortedCounts[Math.floor((sortedCounts.length * 2) / 3) - 1] ?? Infinity;

    function classifyHeat(n: number): Heat {
      if (n === 0) return "low";
      if (n >= highCut) return "high";
      if (n >= medCut) return "medium";
      return "low";
    }

    const payload: NearbyStore[] = stores.map((s) => {
      const n = countMap.get(s.id) ?? 0;
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        logo: s.logo,
        lat: s.lat as number,
        lng: s.lng as number,
        deliveriesLast30d: n,
        heat: classifyHeat(n),
        rating: Number(s.rating ?? 0),
        reviewCount: s.reviewCount ?? 0,
      };
    });

    logger.info("delivery.nearby-stores.read", {
      partnerId: session.partnerId,
      tenantId: session.tenantId,
      storeCount: payload.length,
      withDeliveries: payload.filter((s) => s.deliveriesLast30d > 0).length,
    });

    return NextResponse.json({ stores: payload });
  } catch (err) {
    logger.error("delivery.nearby-stores.failed", {
      partnerId: session.partnerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "No se pudieron obtener las tiendas cercanas" },
      { status: 500 },
    );
  }
}
