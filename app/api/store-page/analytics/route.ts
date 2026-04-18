import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";

const EMPTY_ANALYTICS = {
  visits: 0,
  conversions: 0,
  conversionRate: 0,
  visitsByDay: [] as Array<{ date: string; visits: number }>,
  topReferrers: [] as Array<{ source: string; count: number }>,
  topProducts: [] as Array<{ productId: string; name: string; clicks: number }>,
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const analytics = await withDbRetry(() =>
      StorePageDB.getAnalytics(auth.tenantId),
    );
    return NextResponse.json(analytics ?? EMPTY_ANALYTICS);
  } catch (e) {
    // Graceful: tabla inexistente (pre-migration) o falla transitoria — devolver vacío
    // en lugar de 503 para no romper el dashboard. El admin verá 0 registros.
    logger.warn("[store-page/analytics] GET fallback empty", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(EMPTY_ANALYTICS, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
