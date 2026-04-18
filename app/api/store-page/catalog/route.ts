import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";

/**
 * GET /api/store-page/catalog
 *
 * Lista todos los productos del tenant con su estado de visibilidad
 * en la tienda individual (/t/[slug]). Default: visible=true.
 *
 * Auth: requireAdmin(["admin", "owner"]).
 * Respeta aislamiento multi-tenant (tenantId del JWT).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const list = await withDbRetry(() =>
      StorePageDB.listCatalogWithVisibility(auth.tenantId),
    );
    return NextResponse.json(list);
  } catch (e) {
    logger.error("[store-page/catalog] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json([], { status: 200 });
  }
}
