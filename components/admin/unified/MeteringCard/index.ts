/**
 * Barrel export — MeteringCard
 * Import directo recomendado para evitar tree-shaking issues:
 *   import MeteringCard from "@/components/admin/unified/MeteringCard/MeteringCard";
 * Este barrel es solo para conveniencia de los consumers simples.
 */
export { default } from "./MeteringCard";
export type {
  MeteringCardProps,
  MeteringSnapshot,
  MeteringPeriod,
  QuotaThresholds,
  QuotaThreshold,
  BillingPlan,
  TrafficLight,
} from "./types";
export { EVENT_LABELS, PLAN_LABELS, computeTrafficLight, computePercentage } from "./types";
export { MeteringCardClient, PlanBadge } from "./MeteringCard.client";
