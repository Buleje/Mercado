// ─── SaaS Plan Definitions ───────────────────────────────────────────────────
// Static plan config — no DB model needed. Plans are referenced by the
// `plan` string field on the Tenant model ("free" | "pro" | "business" | "enterprise").

export type PlanId = "free" | "pro" | "business" | "enterprise";

export interface PlanLimits {
  maxProducts: number;        // -1 = unlimited
  maxUsers: number;           // -1 = unlimited
  maxOrdersPerMonth: number;  // -1 = unlimited
  maxStores: number;          // -1 = unlimited
  customDomain: boolean;
  apiAccess: boolean;
  advancedAnalytics: boolean;
  multiStore: boolean;
  prioritySupport: boolean;
  whiteLabel: boolean;
  dedicatedSupport: boolean;
  sla: boolean;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  description: string;
  priceMonthly: number;   // USD
  priceYearly: number;    // USD (total/year — includes discount)
  color: string;           // Tailwind color key
  popular?: boolean;
  limits: PlanLimits;
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    name: "Gratis",
    description: "Ideal para empezar tu tienda en línea",
    priceMonthly: 0,
    priceYearly: 0,
    color: "gray",
    limits: {
      maxProducts: 50,
      maxUsers: 2,
      maxOrdersPerMonth: 200,
      maxStores: 1,
      customDomain: false,
      apiAccess: false,
      advancedAnalytics: false,
      multiStore: false,
      prioritySupport: false,
      whiteLabel: false,
      dedicatedSupport: false,
      sla: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Para negocios en crecimiento que necesitan más poder",
    priceMonthly: 49,
    priceYearly: 470, // ~20% discount ($39.17/mo)
    color: "blue",
    popular: true,
    limits: {
      maxProducts: 500,
      maxUsers: 10,
      maxOrdersPerMonth: 2000,
      maxStores: 1,
      customDomain: true,
      apiAccess: false,
      advancedAnalytics: true,
      multiStore: false,
      prioritySupport: false,
      whiteLabel: false,
      dedicatedSupport: false,
      sla: false,
    },
  },
  business: {
    id: "business",
    name: "Business",
    description: "Para negocios establecidos con múltiples sucursales",
    priceMonthly: 149,
    priceYearly: 1430, // ~20% discount ($119.17/mo)
    color: "violet",
    limits: {
      maxProducts: -1,
      maxUsers: -1,
      maxOrdersPerMonth: -1,
      maxStores: 5,
      customDomain: true,
      apiAccess: true,
      advancedAnalytics: true,
      multiStore: true,
      prioritySupport: true,
      whiteLabel: false,
      dedicatedSupport: false,
      sla: false,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "Para cadenas y franquicias con requerimientos avanzados",
    // Canonical price. Matches lib/superadmin-types.ts:DEFAULT_SETTINGS.priceEnterprise.
    // NOTE: static default only — runtime consumers must use `getPlanPrice("enterprise")`
    // which reads from the PlatformSetting("plan-prices") row in DB.
    priceMonthly: 499,
    priceYearly: 4790, // ~20% discount (~$399.17/mo)
    color: "amber",
    limits: {
      maxProducts: -1,
      maxUsers: -1,
      maxOrdersPerMonth: -1,
      maxStores: -1,
      customDomain: true,
      apiAccess: true,
      advancedAnalytics: true,
      multiStore: true,
      prioritySupport: true,
      whiteLabel: true,
      dedicatedSupport: true,
      sla: true,
    },
  },
};

/** All plan IDs ordered by tier */
export const PLAN_ORDER: PlanId[] = ["free", "pro", "business", "enterprise"];

/** Returns the limits for a given plan id (defaults to "free" on unknown values). */
export function getPlanLimits(plan: string): PlanLimits {
  return (PLANS[plan as PlanId] ?? PLANS.free).limits;
}

/** Returns the PlanDef for a given plan id (defaults to "free" on unknown values). */
export function getPlanDef(plan: string): PlanDef {
  return PLANS[plan as PlanId] ?? PLANS.free;
}

/**
 * Checks whether the current usage is within the allowed limit.
 * A limit of -1 is treated as unlimited.
 */
export function withinLimit(current: number, max: number): boolean {
  return max === -1 || current < max;
}

/**
 * Returns a 402 payload for over-limit responses.
 */
export function planLimitPayload(resource: string, current: number, max: number, plan: string) {
  return {
    error: `Límite del plan alcanzado`,
    detail: `Tu plan ${getPlanDef(plan).name} permite ${max} ${resource}. Actualmente tienes ${current}.`,
    resource,
    current,
    max,
    plan,
    upgrade: true,
  };
}

// ─── Single source of truth para precios de planes ────────────────────────────
// Fix del bug MRR fake 2026-04-09 — antes había 3 lugares desincronizados:
//   · lib/superadmin-types.ts:DEFAULT_SETTINGS (499)
//   · app/api/superadmin/analytics/route.ts PLAN_PRICES (399) ← estaba mal
//   · lib/plans.ts PLANS.enterprise.priceMonthly (399)        ← estaba mal
//
// Los defaults canónicos viven acá (archivo client-safe). Los helpers runtime
// `getPlanPrice` / `getAllPlanPrices` que consultan `PlatformSetting` viven en
// `@/lib/plans-server` — ese archivo tiene `server-only` y NO debe importarse
// desde Client Components (fetchear vía API en ese caso).

/** Defaults canónicos — si no hay override en DB, se usan estos. */
export const DEFAULT_PLAN_PRICES: Record<PlanId, number> = {
  free: 0,
  pro: 49,
  business: 149,
  enterprise: 499,
};
