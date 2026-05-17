import { NextRequest, NextResponse } from "next/server";
import { PayablesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const supplierId = searchParams.get("supplierId");
    if (supplierId) return NextResponse.json(await withDbRetry(() => PayablesDB.getBySupplierId(auth.tenantId, supplierId)));
    return NextResponse.json(await withDbRetry(() => PayablesDB.getAll(auth.tenantId)));
  } catch (e) {
    logger.error("[payables] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "payables"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  const body = await req.json();
  if (!body.supplierId || !body.amount) {
    return NextResponse.json({ error: "supplierId and amount required" }, { status: 400 });
  }
  const id = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const payable = await PayablesDB.add(auth.tenantId, {
    id,
    supplierId: body.supplierId,
    supplierName: body.supplierName || "",
    purchaseOrderId: body.purchaseOrderId || undefined,
    description: body.description || "",
    amount: Number(body.amount),
    paidAmount: 0,
    status: "pendiente",
    dueDate: body.dueDate || new Date().toISOString(),
    payments: [],
    createdAt: new Date().toISOString(),
  });
  // Fase 4 perf (2026-05-16): refresh stats (overduePayables) + overview.
  try {
    const { invalidateAdminCache } = await import("@/lib/admin-cache");
    invalidateAdminCache.afterPayable(auth.tenantId);
  } catch { /* fire-and-forget */ }
  return NextResponse.json(payable, { status: 201 });
}
