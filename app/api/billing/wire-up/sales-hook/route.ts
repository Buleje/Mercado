/**
 * ADR-047 — POST /api/billing/wire-up/sales-hook
 *
 * Endpoint interno que recibe un saleId + tenantId y emite
 * `sale.completed` al MeteringBus. Llamado por:
 *   - app/api/sunat/emit-on-sale/route.ts (ADR-045)
 *   - Cualquier nuevo handler de ventas
 *
 * Seguridad: protegido con INTERNAL_API_SECRET header.
 * El tenantId NUNCA se toma del body — solo del header autenticado.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeCompare } from "@/lib/timing-safe";
import { emitMeteringEvent } from "@/lib/billing/wire-up/metering-bus";
import { logActivity } from "@/lib/activity-logger";
import { withApiHandler } from "@/lib/api-handler";

const BodySchema = z.object({
  saleId: z.string().min(1).max(128),
  tenantId: z.string().min(1).max(128),
  total: z.number().positive().optional(),
});

export const POST = withApiHandler("billing-wire-up-sales-hook", async (req: NextRequest): Promise<NextResponse> => {
  // Auth: INTERNAL_API_SECRET header
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "INTERNAL_API_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get("x-internal-secret") ?? "";
  if (!timingSafeCompare(authHeader, secret)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const { saleId, tenantId, total } = parsed.data;

  emitMeteringEvent({
    source: "sale.completed",
    tenantId,
    amount: 1,
    idempotencyKey: saleId,
    metadata: total !== undefined ? { total } : undefined,
  });

  logActivity(
    "metering.sale.hook",
    "usage.meter",
    JSON.stringify({ saleId, total }),
    saleId,
    "system",
    undefined,
    tenantId,
  ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

  return NextResponse.json({ queued: true }, { status: 202 });
});
