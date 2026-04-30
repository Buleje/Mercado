import { NextResponse, type NextRequest } from "next/server";
import { PriceHistoryDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";
import { getTenantIdFromRequest } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  try {
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
