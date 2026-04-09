import { NextResponse, type NextRequest } from "next/server";
import { PriceHistoryDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const productId = req.nextUrl.searchParams.get("productId");

    // Product-specific price history is public (used by the store sparkline)
    if (productId) {
      const history = await PriceHistoryDB.getByProduct(Number(productId));
      return NextResponse.json(history, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      });
    }

    // Full history listing is admin-only
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const history = await PriceHistoryDB.getAll();
    return NextResponse.json(history);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
