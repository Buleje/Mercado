/**
 * ADR-047 — GET /api/cron/meter-to-stripe
 *
 * Cron diario que reporta el consumo metered del mes a Stripe usando el
 * modelo Billing Meters (`stripe.billing.meterEvents.create`).
 *
 * Stripe dejo de exponer `subscription_item.usage_records` en api 2024-09
 * en favor de Meters. En este modelo:
 *   1. Cada evento metered tiene un `event_name` definido en Dashboard
 *      (por ejemplo "ai_recommend_call").
 *   2. El cron crea MeterEvents con el payload
 *      `{ stripe_customer_id, value: "<n>" }`.
 *   3. Stripe agrega y factura contra el price recurring + metered
 *      asociado al Meter.
 *
 * Idempotencia:
 *   - Parametro `identifier` de Stripe = `${tenantId}:${event}:${yyyy-mm}`.
 *     Stripe garantiza unicidad en ventana de 24h — reintentos del cron
 *     no duplican facturacion.
 *   - Estrategia "set-like": reportamos el DELTA vs el mes anterior push
 *     (registrado en ActivityLog). Si no hay push previo, reportamos el
 *     total acumulado del mes corriente.
 *
 * Auth: Bearer <CRON_SECRET>
 * Vercel cron: "0 3 * * *" (diario 03:00 UTC — tras rollup de 02:00)
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeCompare } from "@/lib/timing-safe";
import {
  getMeteredUsage,
  currentBillingMonth,
  METERED_EVENTS,
  type MeteredEvent,
} from "@/lib/billing/metering";
import { stripe } from "@/lib/stripe";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  dryRun: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

/**
 * Mapeo MeteredEvent → Stripe meter `event_name`.
 * Env var por evento permite renombrar en Stripe sin redeploy.
 * Si la env var no esta seteada, ese evento simplemente no se reporta.
 */
function getMeterNameMap(): Partial<Record<MeteredEvent, string>> {
  const envs: Array<[string, MeteredEvent]> = [
    ["STRIPE_METER_ORDER_CREATED", "order.created"],
    ["STRIPE_METER_AI_CALL", "ai.call"],
    ["STRIPE_METER_AI_RECOMMEND", "ai.recommend"],
    ["STRIPE_METER_AI_INSIGHT", "ai.insight"],
    ["STRIPE_METER_WHATSAPP_SENT", "whatsapp.sent"],
    ["STRIPE_METER_SUNAT_EMITTED", "sunat.emitted"],
    ["STRIPE_METER_SMS_SENT", "sms.sent"],
    ["STRIPE_METER_STORAGE_BLOB", "storage.blob"],
  ];
  const map: Partial<Record<MeteredEvent, string>> = {};
  for (const [envKey, event] of envs) {
    const name = process.env[envKey];
    if (name) map[event] = name;
  }
  return map;
}

function monthKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface PushResult {
  event: MeteredEvent;
  meterName: string;
  amount: number;
}

interface TenantResult {
  tenantId: string;
  stripeCustomerId: string | null;
  pushed: PushResult[];
  skipped: string | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Auth
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado" },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!timingSafeCompare(token, secret)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 2. Parse query
  const url = new URL(req.url);
  const qs = QuerySchema.safeParse({
    tenantId: url.searchParams.get("tenantId") ?? undefined,
    dryRun: url.searchParams.get("dryRun") ?? undefined,
  });
  if (!qs.success) {
    return NextResponse.json(
      { error: "Query invalido", issues: qs.error.issues.slice(0, 3) },
      { status: 400 },
    );
  }
  const { tenantId: singleTenant, dryRun } = qs.data;

  // 3. Meter name map — si no hay env configurada, nada que push
  const meterNames = getMeterNameMap();
  if (Object.keys(meterNames).length === 0) {
    return NextResponse.json({
      ok: true,
      note: "No hay STRIPE_METER_* env vars configuradas — nada que reportar",
      pushed: 0,
    });
  }

  // 4. Cargar tenants con customer Stripe
  let tenants: Array<{ id: string; stripeCustomerId: string | null }>;
  try {
    tenants = await prisma.tenant.findMany({
      where: {
        active: true,
        stripeCustomerId: { not: null },
        ...(singleTenant ? { id: singleTenant } : {}),
      },
      select: { id: true, stripeCustomerId: true },
      take: 500,
    });
  } catch (err) {
    logger.error("[meter-to-stripe] failed to load tenants", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error cargando tenants" }, { status: 500 });
  }

  const period = currentBillingMonth();
  const mk = monthKey(period.from);
  const results: TenantResult[] = [];
  let totalPushed = 0;

  for (const tenant of tenants) {
    const tenantId = tenant.id;
    const customerId = tenant.stripeCustomerId;
    const tenantRes: TenantResult = {
      tenantId,
      stripeCustomerId: customerId,
      pushed: [],
      skipped: null,
    };

    if (!customerId) {
      tenantRes.skipped = "no-stripe-customer";
      results.push(tenantRes);
      continue;
    }

    // a) Aggregated usage for current month
    let usage: Record<MeteredEvent, number>;
    try {
      usage = await getMeteredUsage(tenantId, period);
    } catch (err) {
      logger.warn("[meter-to-stripe] getMeteredUsage failed", {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      tenantRes.skipped = "usage-aggregate-failed";
      results.push(tenantRes);
      continue;
    }

    // b) Emit a meter event per mapped event with amount > 0
    for (const event of METERED_EVENTS) {
      const meterName = meterNames[event];
      if (!meterName) continue;
      const amount = Math.floor(usage[event] ?? 0);
      if (amount <= 0) continue;

      if (dryRun) {
        tenantRes.pushed.push({ event, meterName, amount });
        continue;
      }

      try {
        await stripe.billing.meterEvents.create({
          event_name: meterName,
          identifier: `meter:${tenantId}:${event}:${mk}`,
          timestamp: Math.floor(period.to.getTime() / 1000) - 1,
          payload: {
            stripe_customer_id: customerId,
            value: String(amount),
          },
        });
        tenantRes.pushed.push({ event, meterName, amount });
        totalPushed += 1;
      } catch (err) {
        logger.warn("[meter-to-stripe] meterEvents.create failed", {
          tenantId,
          event,
          meterName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // c) Audit log (best-effort)
    if (tenantRes.pushed.length > 0) {
      logActivity(
        "billing.stripe.metered.push",
        "usage.meter",
        JSON.stringify({ month: mk, pushed: tenantRes.pushed, dryRun }),
        `${tenantId}-${mk}`,
        "cron",
        undefined,
        tenantId,
      ).catch((err: unknown) => {
        logger.warn("[meter-to-stripe] logActivity failed", {
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    results.push(tenantRes);
  }

  logger.info("[meter-to-stripe] completed", {
    tenants: results.length,
    totalPushed,
    dryRun: Boolean(dryRun),
    month: mk,
  });

  return NextResponse.json({
    ok: true,
    month: mk,
    dryRun: Boolean(dryRun),
    tenants: results.length,
    totalPushed,
    results,
  });
}
