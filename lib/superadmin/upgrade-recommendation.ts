/**
 * lib/superadmin/upgrade-recommendation.ts
 *
 * Recomendación PURA de upgrade de plan para tiendas cerca del límite. Convierte
 * "esta tienda está al 95% de su plan" en "súbela a Pro = +S/90/mes": el
 * operador sabe a QUÉ plan y CUÁNTO MRR extra, en vez de upsell a ciegas.
 *
 * Sin DB. El ladder de planes (precio + límite de pedidos/mes) vive acá como
 * single source para el cálculo del upside.
 */

export interface PlanRung {
  plan: string;
  label: string;
  pricePEN: number;
  /** Límite de pedidos/mes; Infinity = ilimitado. */
  orderLimit: number;
}

/** Escalera de planes por capacidad (precio + límite de pedidos). */
export const PLAN_LADDER: PlanRung[] = [
  { plan: "free", label: "Free", pricePEN: 0, orderLimit: 100 },
  { plan: "starter", label: "Starter", pricePEN: 89, orderLimit: 1000 },
  { plan: "pro", label: "Pro", pricePEN: 179, orderLimit: 10000 },
  { plan: "business", label: "Business", pricePEN: 349, orderLimit: Infinity },
];

export interface UpgradeRecommendation {
  recommendedPlan: string;
  recommendedLabel: string;
  /** Upside mensual de MRR (precio nuevo − actual), en S/. */
  upsidePEN: number;
  /** Nuevo límite de pedidos/mes; null = ilimitado. */
  newOrderLimit: number | null;
}

/** Normaliza aliases legacy del plan al ladder. */
function normalizePlan(plan: string): string {
  if (plan === "basico") return "free";
  return plan;
}

/**
 * Recomienda el plan al que conviene subir una tienda dado su consumo de
 * pedidos del mes. Devuelve null si el plan ya es el tope, es desconocido o es
 * enterprise (fuera del ladder estándar — se negocia aparte).
 */
export function recommendUpgrade(
  currentPlan: string,
  ordersThisMonth: number,
): UpgradeRecommendation | null {
  const norm = normalizePlan(currentPlan);
  const idx = PLAN_LADDER.findIndex((r) => r.plan === norm);
  if (idx === -1) return null; // desconocido / enterprise → sin recomendación
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
