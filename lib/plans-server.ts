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

/**
 * Single source of truth for the runtime price of ONE plan.
 * Reads `PlatformSetting("plan-prices")` with a 5-minute cache, falls back to
 * `DEFAULT_PLAN_PRICES` on error or when no override exists.
 */
export async function getPlanPrice(plan: PlanId): Promise<number> {
  const all = await getAllPlanPrices();
  return all[plan];
}

/**
 * Single source of truth for the runtime prices of ALL plans.
 * Reads `PlatformSetting("plan-prices")` with a 5-minute cache, falls back to
 * `DEFAULT_PLAN_PRICES` on error or when no override exists.
 */
export async function getAllPlanPrices(): Promise<Record<PlanId, number>> {
  try {
    const { PlatformSettingsDB } = await import("@/lib/db/platform-settings.db");
    const override = await PlatformSettingsDB.get<Partial<Record<PlanId, number>>>(
      "plan-prices",
    );
    if (!override) return { ...DEFAULT_PLAN_PRICES };
    return {
      free: typeof override.free === "number" ? override.free : DEFAULT_PLAN_PRICES.free,
      pro: typeof override.pro === "number" ? override.pro : DEFAULT_PLAN_PRICES.pro,
      business:
        typeof override.business === "number"
          ? override.business
          : DEFAULT_PLAN_PRICES.business,
      enterprise:
        typeof override.enterprise === "number"
          ? override.enterprise
          : DEFAULT_PLAN_PRICES.enterprise,
    };
  } catch {
    // If the DB class or the model is missing (migration not yet run), fall
    // back to defaults without breaking the build.
    return { ...DEFAULT_PLAN_PRICES };
  }
}
