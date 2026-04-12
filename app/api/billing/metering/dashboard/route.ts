/**
 * ADR-047 — GET /api/billing/metering/dashboard
 *
 * Devuelve un snapshot de metering listo para el componente MeteringCard:
 * { tenantId, period, plan, quotas, usage, history }
 *
 * Protected: requireAdmin(req, ["admin"])
 * tenantId siempre del server session — nunca del query string.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  getMeteredUsage,
  currentBillingMonth,
  METERED_EVENTS,
} from "@/lib/billing/metering";
import { USAGE_TIERS, normalizeTier } from "@/lib/billing/wire-up/usage-tiers";
import { SettingsDB } from "@/lib/db/settings.db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Auth
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { tenantId } = auth;

  // 2. Período actual (mes de facturación)
  const period = currentBillingMonth();

  // 3. Uso acumulado del mes
  const usage = await getMeteredUsage(tenantId, period).catch((err: unknown) => {
    logger.error("[metering/dashboard] getMeteredUsage failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as Record<
      typeof METERED_EVENTS[number],
      number
    >;
  });

  // 4. Plan del tenant
  const settings = await SettingsDB.get(tenantId).catch(() => ({ mode: "checkout" as const }));
  const planName = (settings as Record<string, unknown>).planName as string | undefined ?? "free";
  const tier = normalizeTier(planName);
  const tierQuotas = USAGE_TIERS[tier];

  // 5. Construir quotas con % de uso
  const quotas = Object.fromEntries(
    METERED_EVENTS.map((event) => {
      const quota = tierQuotas[event];
      const used = usage[event] ?? 0;
      const limit = quota?.limit ?? 0;
      const alertAt = quota?.alertAt ?? 0.8;
      const percent = limit > 0 && limit !== Infinity ? (used / limit) * 100 : 0;
      return [
        event,
        {
          used,
          limit: limit === Infinity ? null : limit,
          alertAt,
          percentUsed: Math.min(100, percent),
          status:
            limit === 0
              ? "blocked"
              : limit === Infinity
              ? "unlimited"
              : percent >= 90
              ? "critical"
              : percent >= alertAt * 100
              ? "warning"
              : "ok",
        },
      ];
    }),
  );

  // 6. Historia simplificada: últimas 6 entradas por evento (para MeteringChart)
  //    Se devuelven los totales del período actual agrupados por día sería complejo
  //    sin una query SQL adicional. Por ahora se devuelve el acumulado mensual.
  //    Un endpoint de /history puede agregarse en ADR futuro si se necesita granularidad diaria.
  const history: { period: string; usage: typeof usage }[] = [
    {
      period: period.from.toISOString().slice(0, 7), // YYYY-MM
      usage,
    },
  ];

  return NextResponse.json({
    tenantId,
    period: {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
    },
    plan: planName,
    tier,
    quotas,
    usage,
    history,
  });
}
