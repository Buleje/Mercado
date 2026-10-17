import "server-only";

import { DEFAULT_PLAN_PRICES, type PlanId } from "@/lib/plans";

/**
 * lib/plans-server.ts
 *
 * Server-only helpers that resolve plan prices against the `PlatformSetting`
 * store in the database. Split out from `lib/plans.ts` (2026-04-09, TD018 /
 * Wave 5 hotfix) so that client components consuming the static `PLANS`
 * catalog do not pull `lib/db/platform-settings.db.ts` — and transitively
 * `prisma` + `pg` + Node built-ins (`net`, `tls`, `server-only`) — into the
 * browser bundle. The marketing `/plataforma` route was breaking
 * `npm run build` because of this.
 *
 * Rule: if you need the static plan catalog (PLANS, PLAN_ORDER, limits,
 * formatting), import from `@/lib/plans`. If you need the runtime, DB-backed
 * price (overrideable by superadmin), import from `@/lib/plans-server` — and
 * do it ONLY from server components, route handlers, or other server code.
 */

/** Precio mensual de UN plan (= `precioMensualDePlan`; ver getAllPlanPrices). */
export async function getPlanPrice(plan: PlanId): Promise<number> {
  const all = await getAllPlanPrices();
  return all[plan];
}

/**
 * Single source of truth for the runtime prices of ALL plans.
 * Devuelve `DEFAULT_PLAN_PRICES` (= `precioMensualDePlan`). Async por
 * compatibilidad con los consumidores de antes.
 */
export async function getAllPlanPrices(): Promise<Record<PlanId, number>> {
  // 2026-10-09: un solo precio por plan. Antes leía el override
  // `PlatformSetting("plan-prices")` que se editaba en Ajustes: el Dashboard
  // podía cobrar un precio y Facturación/P&L (`precioMensualDePlan`) otro. El
  // precio vive en `lib/billing/plan-tiers.ts` (el mismo que ve el cliente).
  return { ...DEFAULT_PLAN_PRICES };
}
