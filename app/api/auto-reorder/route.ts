import { NextResponse, type NextRequest } from "next/server";
import { AutoReorderDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const lowStock = await AutoReorderDB.getLowStockProducts(auth.tenantId);
    return NextResponse.json(lowStock);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[auto-reorder] GET error", { tenantId: auth.tenantId, error: msg });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
