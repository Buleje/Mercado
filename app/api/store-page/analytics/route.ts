import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const analytics = await withDbRetry(() =>
      StorePageDB.getAnalytics(auth.tenantId),
    );
    return NextResponse.json(analytics);
  } catch (e) {
    logger.error("[store-page/analytics] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Error al leer analytics" },
      { status: 503 },
    );
  }
}
