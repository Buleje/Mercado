import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PayablesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { CuentasPorPagarDB } from "@/lib/db/cuentas-por-pagar.db";

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

  /* C41-C42 + revisión de security 17-10: revisar si repite y crear van en una
     transacción con candado por proveedor (5 POST a la vez = 1 cuenta), y el
     proveedor tiene que ser de este negocio. Sin `withDbRetry`: reintentar un
     alta que quizá ya se guardó la duplicaría. */
  let r: Awaited<ReturnType<typeof CuentasPorPagarDB.crearSinRepetir>>;
  try {
    r = await CuentasPorPagarDB.crearSinRepetir(auth.tenantId, {
      supplierId: data.supplierId,
      amount: data.amount,
      purchaseOrderId: data.purchaseOrderId || undefined,
      description: data.description,
      dueDate: data.dueDate,
    });
  } catch (e) {
    logger.error("[payables] alta error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar la cuenta. Prueba otra vez." }, { status: 503 });
  }
  if (!r.ok) {
    return NextResponse.json({ error: r.error, ...(r.duplicada && { duplicada: r.duplicada }) }, { status: r.status });
  }
  // Fase 4 perf (2026-05-16): refresh stats (overduePayables) + overview.
  try {
    const { invalidateAdminCache } = await import("@/lib/admin-cache");
    invalidateAdminCache.afterPayable(auth.tenantId);
  } catch { /* fire-and-forget */ }
  return NextResponse.json(r.cuenta, { status: 201 });
}
