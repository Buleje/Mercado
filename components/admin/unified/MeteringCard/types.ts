/**
 * MeteringCard — tipos compartidos
 * Derivados del esquema de ADR-044 y ADR-047.
 */

import type { MeteredEvent } from "@/lib/billing/metering";

// ─── Periodos ───────────────────────────────────────────────────────────────

export type MeteringPeriod = {
  from: string; // ISO 8601
  to: string;   // ISO 8601
};

// ─── Planes / tiers ─────────────────────────────────────────────────────────

export type BillingPlan = "free" | "starter" | "pro" | "enterprise";

// ─── Quotas por métrica ──────────────────────────────────────────────────────

export interface QuotaThreshold {
  /** Límite máximo del plan para esta métrica */
  limit: number;
  /** Fracción en la que se dispara la alerta (0-1) */
  alertAt: number;
}

export type QuotaThresholds = Record<MeteredEvent, QuotaThreshold>;

// ─── Snapshot de uso ─────────────────────────────────────────────────────────

export interface MeteringSnapshot {
  tenantId: string;
  plan: BillingPlan;
  period: MeteringPeriod;
  /** Uso acumulado por evento en el período */
  usage: Record<MeteredEvent, number>;
  /** Quotas del plan activo */
  quotas: QuotaThresholds;
  /** Costo USD estimado del período */
  estimatedCostUsd: number;
  /** Histórico de 7 días por evento (más reciente último) */
  sparklines: Record<MeteredEvent, number[]>;
}

// ─── Estado de semáforo ───────────────────────────────────────────────────────

export type TrafficLight = "green" | "yellow" | "red";

export function computeTrafficLight(used: number, limit: number): TrafficLight {
  if (limit === 0 || limit === Infinity) return "green";
  const ratio = used / limit;
  if (ratio >= 0.9) return "red";
  if (ratio >= 0.7) return "yellow";
  return "green";
}

export function computePercentage(used: number, limit: number): number {
  if (limit === 0 || limit === Infinity) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

// ─── Etiquetas en español ─────────────────────────────────────────────────────

export const EVENT_LABELS: Record<MeteredEvent, string> = {
  "order.created":  "Pedidos",
  "ai.call":        "Llamadas IA",
  "ai.recommend":   "Recomendaciones IA",
  "ai.insight":     "Insights IA",
  "sms.sent":       "SMS enviados",
  "whatsapp.sent":  "WhatsApp enviados",
  "sunat.emitted":  "Comprobantes SUNAT",
  "storage.blob":   "Almacenamiento (KB)",
};

export const PLAN_LABELS: Record<BillingPlan, string> = {
  free:       "Gratis",
  starter:    "Starter",
  pro:        "Pro",
  enterprise: "Enterprise",
};

// ─── Props de los componentes ─────────────────────────────────────────────────

export interface MeteringCardProps {
  tenantId: string;
  period?: MeteringPeriod;
}
