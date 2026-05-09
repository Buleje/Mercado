import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { MarketplaceAdminDB } from "@/lib/db/marketplace-public.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

/**
 * GET /api/marketplace/kpis
 * KPIs del marketplace para el panel admin del vendedor.
 * Retorna: publishedProducts, monthOrders, pendingCommissions
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const store = await MarketplaceStoresDB.getByTenantId(auth.tenantId);

    if (!store) {
      return NextResponse.json({
        publishedProducts: 0,
        monthOrders: 0,
        pendingCommissions: 0,
      });
    }

    const kpis = await MarketplaceAdminDB.getVendorKpis(auth.tenantId, store.id);
    return NextResponse.json(kpis);
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
