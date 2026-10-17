import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PayablesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// coerce en amount: algunos callers mandan number, otros string numérico.
const CreatePayableSchema = z.object({
  supplierId: z.string().min(1),
  amount: z.coerce.number().positive(),
  supplierName: z.string().optional(),
  purchaseOrderId: z.string().optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

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

  const raw = await req.json().catch(() => ({}));
  const parsed = CreatePayableSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const id = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const payable = await PayablesDB.add(auth.tenantId, {
    id,
    supplierId: data.supplierId,
    supplierName: data.supplierName || "",
    purchaseOrderId: data.purchaseOrderId || undefined,
    description: data.description || "",
    amount: data.amount,
    paidAmount: 0,
    status: "pendiente",
    dueDate: data.dueDate || new Date().toISOString(),
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
