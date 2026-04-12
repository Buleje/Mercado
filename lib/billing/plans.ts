/**
 * lib/billing/plans.ts
 *
 * Definición canónica de los planes de suscripción Stripe para Bodega San Martín SaaS.
 * Precios en céntimos de soles (PEN): 4900 = S/49.00.
 *
 * Este archivo es client-safe: no importa nada de server-only.
 * Los Price IDs de Stripe se leen desde variables de entorno en el servidor
 * — no los expongas en NEXT_PUBLIC_*.
 *
 * Coexiste con lib/plans.ts (planes legacy free/pro/business/enterprise con
 * precios en USD para el panel de superadmin). Este archivo es la fuente de
 * verdad para el flujo de pago Stripe del SaaS.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type BillingPlanId = "free" | "starter" | "pro";

export type BillingFeature =
  | "pos"
  | "fiado"
  | "delivery"
  | "sunat"
  | "analytics"
  | "whatsapp"
  | "api"
  | "multi_store"
  | "all";

export interface BillingPlan {
  id: BillingPlanId;
  name: string;
  /** Precio mensual en céntimos (PEN). 0 = gratis. */
  price: number;
  /** -1 = sin límite */
  maxProducts: number;
  /** -1 = sin límite */
  maxUsers: number;
  features: BillingFeature[];
  /**
   * Stripe Price ID. Undefined para el plan free (no requiere pago).
   * En runtime se resuelve desde env vars — nunca hardcodeado.
   */
  stripePriceId?: string;
}

// ─── Definición de planes ─────────────────────────────────────────────────────

/**
 * Planes del SaaS Bodega San Martín.
 *
 * Los stripePriceId se resuelven en tiempo de servidor desde:
 *   STRIPE_STARTER_PRICE_ID  → plan starter
 *   STRIPE_PRO_PRICE_ID      → plan pro
 *
 * Esta función permite que el archivo sea importado en contextos de build
 * sin necesitar acceso a process.env (que no existe en edge runtime estático).
 */
export function getBillingPlans(): Record<BillingPlanId, BillingPlan> {
  return {
    free: {
      id: "free",
      name: "Gratis",
      price: 0,
      maxProducts: 100,
      maxUsers: 1,
      features: ["pos"],
    },
    starter: {
      id: "starter",
      name: "Starter",
      price: 4900, // S/49.00
      maxProducts: 1000,
      maxUsers: 3,
      features: ["pos", "fiado", "delivery"],
      stripePriceId: process.env.STRIPE_STARTER_PRICE_ID,
    },
    pro: {
      id: "pro",
      name: "Pro",
      price: 14900, // S/149.00
      maxProducts: -1,
      maxUsers: -1,
      features: ["all"],
      stripePriceId: process.env.STRIPE_PRO_PRICE_ID,
    },
  };
}

/**
 * Mapa estático de planes. Usar con cuidado en contextos donde process.env
 * no esté disponible — en ese caso los stripePriceId serán undefined.
 */
export const BILLING_PLANS: Record<BillingPlanId, BillingPlan> = getBillingPlans();

/** Orden de planes de menor a mayor tier. */
export const BILLING_PLAN_ORDER: BillingPlanId[] = ["free", "starter", "pro"];

/**
 * Retorna el BillingPlan para un planId dado.
 * Fallback a "free" para valores desconocidos.
 */
export function getBillingPlan(planId: string): BillingPlan {
  const plans = getBillingPlans();
  return plans[planId as BillingPlanId] ?? plans.free;
}

/**
 * Verifica si un feature está incluido en un plan.
 * El feature "all" cubre todos los demás features.
 */
export function planHasFeature(plan: BillingPlan, feature: BillingFeature): boolean {
  return plan.features.includes("all") || plan.features.includes(feature);
}

/**
 * Retorna el Stripe Price ID para un plan dado.
 * Lanza si el plan requiere pago pero no tiene Price ID configurado.
 */
export function getStripePriceId(planId: BillingPlanId): string {
  if (planId === "free") {
    throw new Error("El plan free no tiene un Stripe Price ID — no requiere pago.");
  }
  const plan = getBillingPlan(planId);
  if (!plan.stripePriceId) {
    throw new Error(
      `Stripe Price ID no configurado para el plan "${planId}". ` +
        `Verifica STRIPE_${planId.toUpperCase()}_PRICE_ID en las variables de entorno.`,
    );
  }
  return plan.stripePriceId;
}
