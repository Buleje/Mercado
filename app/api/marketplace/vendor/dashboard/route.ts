export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceOrdersDB } from "@/lib/db/marketplace.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

// ── GET /api/marketplace/vendor/dashboard ─────────────────────────────────────
// Solo el dueño de la tienda (tienda_owner) o admin puede ver el dashboard.
// Devuelve: ventas totales, pedidos pendientes, productos activos, top 5 productos.

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const dashboard = await MarketplaceOrdersDB.getVendorDashboard(auth.tenantId);

    return NextResponse.json({ data: dashboard });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
