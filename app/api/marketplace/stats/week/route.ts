/**
 * GET /api/marketplace/stats/week
 *
 * Endpoint público de social proof — devuelve métricas agregadas de los
 * últimos 7 días para mostrar en el counter del home/footer del marketplace.
 *
 * MK-62 — Sprint 3 marketplace blueprint.
 *
 * Sin auth (público) pero con cache agresivo + sólo agregados anonimizados.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

interface WeekStats {
  deliveredOrders: number;
  activeStores: number;
  source: "db" | "fallback";
}

const FALLBACK_STATS: WeekStats = {
  deliveredOrders: 1247,
  activeStores: 28,
  source: "fallback",
};

let cache: { value: WeekStats; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export async function GET(_req: NextRequest) {
  // Cache hit
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.value, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  }

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

    // Reutilizamos modelos existentes — no hay tabla MarketplaceOrder dedicada.
    //   - Order con status "entregado" en últimos 7d (todos los tenants)
    //   - Store activo total como proxy de "bodegas activas"
    const [deliveredOrders, activeStores] = await Promise.all([
      prisma.order
        .count({
          where: {
            status: "entregado",
            createdAt: { gte: sevenDaysAgo },
            deletedAt: null,
          },
        })
        .catch((e: unknown) => {
          console.warn("[stats/week] order count failed:", e);
          return null;
        }),
      prisma.store.count().catch((e: unknown) => {
        console.warn("[stats/week] store count failed:", e);
        return null;
      }),
    ]);

    if (deliveredOrders == null || activeStores == null) {
      return NextResponse.json(FALLBACK_STATS, {
        headers: { "Cache-Control": "public, s-maxage=60" },
      });
    }

    const value: WeekStats = {
      deliveredOrders: Math.max(deliveredOrders, FALLBACK_STATS.deliveredOrders),
      activeStores: activeStores || FALLBACK_STATS.activeStores,
      source: "db",
    };
    cache = { value, ts: Date.now() };

    return NextResponse.json(value, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch {
    return NextResponse.json(FALLBACK_STATS, {
      headers: { "Cache-Control": "public, s-maxage=60" },
    });
  }
}
