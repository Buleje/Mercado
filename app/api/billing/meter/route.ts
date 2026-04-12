import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import {
  recordUsageEvent,
  getMeteredUsage,
  currentBillingMonth,
  METERED_EVENTS,
} from "@/lib/billing/metering";
import { logger } from "@/lib/logger";

const MeterBodySchema = z.object({
  event: z.enum(METERED_EVENTS),
  amount: z.number().positive().max(10_000),
  idempotencyKey: z.string().min(1).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/billing/meter
 * Body: { event, amount, idempotencyKey?, metadata? }
 *
 * Records a metered usage event for the caller's tenant. The tenant is
 * taken from the admin session — never trusted from the body.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = MeterBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const ok = await recordUsageEvent({
    tenantId: auth.tenantId,
    event: parsed.data.event,
    amount: parsed.data.amount,
    idempotencyKey: parsed.data.idempotencyKey,
    metadata: parsed.data.metadata,
  });

  if (!ok) {
    logger.warn("[api/billing/meter] record refused (duplicate or persist error)", {
      tenantId: auth.tenantId,
      event: parsed.data.event,
    });
    return NextResponse.json({ recorded: false }, { status: 202 });
  }

  return NextResponse.json({ recorded: true }, { status: 201 });
}

/**
 * GET /api/billing/meter
 * Query: ?from=ISO&to=ISO (both optional; defaults to current billing month)
 *
 * Returns the aggregated metered usage for the caller's tenant over the
 * given period, broken down by event type.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  let period = currentBillingMonth();
  if (fromStr && toStr) {
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (
      Number.isFinite(from.getTime()) &&
      Number.isFinite(to.getTime()) &&
      from < to
    ) {
      period = { from, to };
    }
  }

  const usage = await getMeteredUsage(auth.tenantId, period);
  return NextResponse.json({
    tenantId: auth.tenantId,
    from: period.from.toISOString(),
    to: period.to.toISOString(),
    usage,
  });
}
