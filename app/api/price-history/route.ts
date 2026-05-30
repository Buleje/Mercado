import { NextResponse, type NextRequest } from "next/server";
import { PriceHistoryDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";
import { getTenantIdFromRequest } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  try {
    // Batch: ?productIds=1,2,3 → { [id]: history[] } en UNA query. Mata el N+1
    // del sparkline del inventario (84 productos = 84 requests → 1). Público
    // como el path por-producto. Perf 2026-05-29.
    const productIdsParam = req.nextUrl.searchParams.get("productIds");
    if (productIdsParam) {
      const tenantId = getTenantIdFromRequest(req);
      const ids = [...new Set(
        productIdsParam.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
      )].slice(0, 200);
      const map = await PriceHistoryDB.getByProducts(tenantId, ids);
      return NextResponse.json(map, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      });
    }

    const productId = req.nextUrl.searchParams.get("productId");

    // Product-specific price history is public (used by the store sparkline)
    if (productId) {
      const tenantId = getTenantIdFromRequest(req);
      const history = await PriceHistoryDB.getByProduct(tenantId, Number(productId));
      return NextResponse.json(history, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      });
    }

    // Full history listing is admin-only
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const history = await PriceHistoryDB.getAll(auth.tenantId);
    return NextResponse.json(history);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
