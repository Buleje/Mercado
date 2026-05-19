import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { CommissionsDB } from "@/lib/db/commissions.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";

const CommissionPostSchema = z.object({
  orderId: z.string().min(1, "orderId requerido"),
  storeId: z.string().optional(),
  partnerId: z.string().optional(),
  type: z.enum(["marketplace_fee", "delivery_fee", "platform_fee", "refund_reversal"]),
  amount: z.number(), // permite negativos para reversa
  // Audit 2026-05-17 P0-4: rate en formato % (0-100), no proporción 0-1.
  rate: z.number().min(0).max(100, "La tasa debe estar entre 0 y 100"),
});

const CommissionSettleSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Se requiere al menos un id").max(100),
});

const ListQuerySchema = z.object({
  storeId: z.string().max(100).optional(),
  status: z.enum(["pending", "settled", "paid", "refunded"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = ListQuerySchema.safeParse({
      storeId: searchParams.get("storeId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues.map(i => i.message) },
        { status: 400 },
      );
    }

    // Audit 2026-05-17 P0-1: tenantId obligatorio en el filtro.
    const { items, totals } = await CommissionsDB.listLedger(auth.tenantId, {
      storeId: parsed.data.storeId,
      status: parsed.data.status,
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to ? new Date(parsed.data.to) : undefined,
    });

    return NextResponse.json({
      data: items,
      totals: {
        totalPending: totals.pending,
        totalSettled: totals.settled,
        totalPaid: totals.paid,
        totalRefunded: totals.refunded,
      },
    });
  } catch (err) {
    logger.error("[commissions/ledger] GET error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "commissions-ledger"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CommissionPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const commission = await CommissionsDB.recordCommission(auth.tenantId, parsed.data);
    if (!commission) {
      return NextResponse.json(
        { error: "Comisión ya existe para esta orden+tipo (idempotente)", duplicate: true },
        { status: 409 },
      );
    }

    logActivity(
      "Crear",
      "commissionLedger",
      `Comisión registrada: ${commission.type} — S/${commission.amount} (orden ${commission.orderId})`,
      commission.id,
      auth.username
    ).catch(() => { /* fire-and-forget per CLAUDE.md rule #7 */ });

    return NextResponse.json(commission, { status: 201 });
  } catch (err) {
    logger.error("[commissions/ledger] POST error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "commissions-ledger"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CommissionSettleSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    // Audit P0 fix 2026-05-11 mantenido: settle scoped a tenantId.
    const result = await CommissionsDB.settleByIds(auth.tenantId, parsed.data.ids);

    logActivity(
      "Liquidar",
      "commissionLedger",
      `${result.count} comisiones liquidadas (ids: ${parsed.data.ids.slice(0, 3).join(", ")}${parsed.data.ids.length > 3 ? "…" : ""})`,
      undefined,
      auth.username
    ).catch(() => { /* fire-and-forget */ });

    return NextResponse.json({ settled: result.count, settledAt: result.settledAt });
  } catch (err) {
    logger.error("[commissions/ledger] PATCH error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
