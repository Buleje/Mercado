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
  priceMonthly: number;   // PEN (soles) — Stripe charges in PEN, UI renders "S/"
  priceYearly: number;    // PEN (total/year — includes ~20% discount)
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
    name: "Starter",
    description: "Para bodegas con flujo diario que ya quieren crecer",
    priceMonthly: 89,
    priceYearly: 854, // ~20% off anual (~S/71/mo)
    color: "blue",
    popular: false, // el "Mas elegido" pasa a business (label "Pro")
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
    name: "Pro",
    description: "Sweet spot: bodega establecida que ya vende online",
    priceMonthly: 179,
    priceYearly: 1720, // ~20% off anual (~S/143/mo)
    color: "violet",
    popular: true, // badge "Mas elegido" — el 60% del mercado va aqui
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
    name: "Business",
    description: "Cadenas, productores y mayoristas · sin limites",
    // Canonical price mayo 2026 v2 — alineado con plan-tiers.ts PLAN_MAX.
    // Stripe Price ID: ver STRIPE_PRICE_IDS.max en plan-tiers.ts.
    // NOTE: static default — runtime consumers usan `getPlanPrice("enterprise")`
    // que lee del PlatformSetting("plan-prices") en DB.
    priceMonthly: 349,
    priceYearly: 3140, // ~25% off anual (~S/261/mo)
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
// Brandon mayo 2026 v2 — alineado 1:1 con lib/billing/plan-tiers.ts:
//   free (Free)        S/ 0
//   pro (Starter)      S/ 89
//   business (Pro)     S/ 179
//   enterprise (Business) S/ 349
//
// Los defaults canónicos viven acá (archivo client-safe). Los helpers runtime
// `getPlanPrice` / `getAllPlanPrices` que consultan `PlatformSetting` viven en
// `@/lib/plans-server` — ese archivo tiene `server-only` y NO debe importarse
// desde Client Components (fetchear vía API en ese caso).

/** Defaults canónicos — si no hay override en DB, se usan estos. */
export const DEFAULT_PLAN_PRICES: Record<PlanId, number> = {
  free: 0,
  pro: 89,
  business: 179,
  enterprise: 349,
};

/**
 * Alias para consumidores que solo necesitan el mapa de precios.
 * Client-safe — NO consulta DB. Para precios runtime (con overrides de
 * superadmin), usar `getPlanPrice()` / `getAllPlanPrices()` de
 * `@/lib/plans-server` (server-only).
 */
export const PLAN_PRICES: Record<string, number> = DEFAULT_PLAN_PRICES;

/**
 * Retorna el precio estático de un plan. Client-safe.
 * Para precios runtime con overrides de DB, usar la versión de
 * `@/lib/plans-server`.
 */
export function getPlanPrice(plan: string): number {
  return PLAN_PRICES[plan] ?? 0;
}
