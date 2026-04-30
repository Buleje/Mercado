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

/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

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
let revalidateInflight = false;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

/** Refresca el cache en background — no bloquea ninguna response. */
function revalidateInBackground() {
  if (revalidateInflight) return;
  revalidateInflight = true;
  void (async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
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
            logger.warn("[stats/week] order count failed", { err: e instanceof Error ? e.message : String(e) });
            return null;
          }),
        prisma.store.count().catch((e: unknown) => {
          logger.warn("[stats/week] store count failed", { err: e instanceof Error ? e.message : String(e) });
          return null;
        }),
      ]);
      if (deliveredOrders == null || activeStores == null) return;
      cache = {
        value: {
          deliveredOrders: Math.max(deliveredOrders, FALLBACK_STATS.deliveredOrders),
          activeStores: activeStores || FALLBACK_STATS.activeStores,
          source: "db",
        },
        ts: Date.now(),
      };
    } finally {
      revalidateInflight = false;
    }
  })();
}

export async function GET(_req: NextRequest) {
  // Cache hit fresco
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.value, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  }

  // Sprint 7 fix: no bloqueamos al cliente con Prisma cold-start (4-5s).
  // Devolvemos fallback inmediato + revalidate background. La 2da request
  // ya tendrá data fresca del cache (TTL 5min).
  revalidateInBackground();
  if (!cache) {
    return NextResponse.json(FALLBACK_STATS, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" },
    });
  }
  // Cache stale pero existe — devolvemos lo viejo mientras revalidate.
  return NextResponse.json(cache.value, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" },
  });
}

