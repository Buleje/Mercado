/**
 * lib/superadmin/upgrade-recommendation.ts
 *
 * Recomendación PURA de upgrade de plan para tiendas cerca del límite. Convierte
 * "esta tienda está al 95% de su plan" en "súbela a Pro = +S/90/mes": el
 * operador sabe a QUÉ plan y CUÁNTO MRR extra, en vez de upsell a ciegas.
 *
 * Sin DB. Precio y nombre salen de la fuente única `lib/billing/plan-tiers.ts`
 * (`precioMensualDePlan` / `etiquetaDePlan`); el cupo de pedidos, de
 * `USAGE_TIERS`. Antes había una escalera propia (free/starter/pro/business) que
 * leía `Tenant.plan = "pro"` como Pro S/ 179 cuando en la base es Starter S/ 89.
 */

import { PLAN_ORDER, etiquetaDePlan, precioMensualDePlan, tierDePlanGuardado, type PlanTier } from "@/lib/billing/plan-tiers";
import { TIER_TO_PLAN_ID } from "@/lib/billing/plan-mapping";
import { USAGE_TIERS, type TierName } from "@/lib/billing/wire-up/usage-tiers";

export interface PlanRung {
  /** Valor que se guarda en `Tenant.plan` (free | pro | business | enterprise). */
  plan: string;
  label: string;
  pricePEN: number;
  /** Límite de pedidos/mes; Infinity = ilimitado. */
  orderLimit: number;
}

/** Cupo de uso de cada escalón: Free→free, Starter→starter, Pro→pro, Business→enterprise. */
const CUPO_DE_TIER: Record<PlanTier, TierName> = {
  basico: "free",
  pro: "starter",
  enterprise: "pro",
  max: "enterprise",
};

/** Cupo de uso (`USAGE_TIERS`) de un `Tenant.plan`; lo desconocido cuenta como free. */
export function cupoDeUsoDePlan(plan: string | null | undefined): TierName {
  const tier = tierDePlanGuardado(plan);
  return tier ? CUPO_DE_TIER[tier] : "free";
}

/** Escalera de planes por capacidad, en el orden de la fuente única. */
export const PLAN_LADDER: PlanRung[] = PLAN_ORDER.map((tier) => {
  const plan = TIER_TO_PLAN_ID[tier];
  return {
    plan,
    label: etiquetaDePlan(plan),
    pricePEN: precioMensualDePlan(plan),
    orderLimit: USAGE_TIERS[CUPO_DE_TIER[tier]]["order.created"]?.limit ?? Infinity,
  };
});

export interface UpgradeRecommendation {
  /** Plan a guardar en `Tenant.plan`. */
  recommendedPlan: string;
  recommendedLabel: string;
  /** Upside mensual de MRR (precio nuevo − actual), en S/. */
  upsidePEN: number;
  /** Nuevo límite de pedidos/mes; null = ilimitado. */
  newOrderLimit: number | null;
}

/**
 * Recomienda el plan al que conviene subir una tienda dado su consumo de
 * pedidos del mes. Devuelve null si el plan ya es el tope (Business) o es
 * desconocido.
 */
export function recommendUpgrade(
  currentPlan: string,
  ordersThisMonth: number,
): UpgradeRecommendation | null {
  const tier = tierDePlanGuardado(currentPlan);
  if (!tier) return null; // desconocido → sin recomendación
  const idx = PLAN_ORDER.indexOf(tier);
  if (idx >= PLAN_LADDER.length - 1) return null; // ya en el tope

  const current = PLAN_LADDER[idx];
  const higher = PLAN_LADDER.slice(idx + 1);
  // El plan más barato por encima que deje el consumo cómodo (≤80%); si ninguno
  // alcanza, el más alto disponible.
  const fit =
    higher.find((r) => r.orderLimit === Infinity || ordersThisMonth <= r.orderLimit * 0.8) ??
    higher[higher.length - 1];

  return {
    recommendedPlan: fit.plan,
    recommendedLabel: fit.label,
    upsidePEN: Math.max(0, fit.pricePEN - current.pricePEN),
    newOrderLimit: fit.orderLimit === Infinity ? null : fit.orderLimit,
  };
}
