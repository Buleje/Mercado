/**
 * lib/billing/plan-mapping.ts
 *
 * Mapping bidireccional entre los dos sistemas de planes:
 *
 *   - **Backend `PlanId`** (`free | pro | business | enterprise`)
 *     Persiste en DB (`Tenant.plan`). Cambia con muchos archivos legacy
 *     que dependen de estos slugs.
 *
 *   - **Frontend `PlanTier`** (`basico | pro | enterprise | max`)
 *     Filtra los tabs del sidebar admin y se muestra en UI.
 *
 * Equivalencias (decididas en este iteración):
 *   free        ↔ basico
 *   pro         ↔ pro
 *   business    ↔ enterprise
 *   enterprise  ↔ max
 *
 * Cuando el superadmin asigne un plan a un tenant, escribe `PlanId` en DB.
 * El cliente del tenant lee ese `PlanId`, lo convierte a `PlanTier` y filtra
 * el sidebar.
 */

import type { PlanId } from "@/lib/superadmin-types";
import type { PlanTier } from "@/lib/billing/plan-tiers";

export const TIER_TO_PLAN_ID: Record<PlanTier, PlanId> = {
  basico: "free",
  pro: "pro",
  enterprise: "business",
  max: "enterprise",
};

export const PLAN_ID_TO_TIER: Record<PlanId, PlanTier> = {
  free: "basico",
  pro: "pro",
  business: "enterprise",
  enterprise: "max",
};

/** Convierte un `PlanId` legacy (DB) al nuevo `PlanTier` (UI). */
export function planIdToTier(plan: PlanId): PlanTier {
  return PLAN_ID_TO_TIER[plan] ?? "basico";
}

/** Convierte un `PlanTier` (UI) al `PlanId` legacy (DB). */
export function tierToPlanId(tier: PlanTier): PlanId {
  return TIER_TO_PLAN_ID[tier] ?? "free";
}

/** Etiqueta humana para `PlanId` — usa los nombres del sistema nuevo. */
export const PLAN_ID_LABEL: Record<PlanId, string> = {
  free: "Básico",
  pro: "Pro",
  business: "Enterprise",
  enterprise: "Max",
};
