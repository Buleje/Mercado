/**
 * ADR-047 — Usage-based tiering.
 *
 * Define los límites de quota y thresholds de alerta por plan.
 * Usado por quota-alerts.ts para determinar cuándo disparar notificaciones.
 */
import type { MeteredEvent } from "@/lib/billing/metering";

export type TierName = "free" | "starter" | "pro" | "enterprise";

export interface TierQuota {
  /** Límite de unidades por mes. `Infinity` para enterprise (sin límite). */
  limit: number;
  /** Fracción del límite que dispara una alerta (ej: 0.8 = 80%). */
  alertAt: number;
}

export type TierQuotaMap = Partial<Record<MeteredEvent, TierQuota>>;

export const USAGE_TIERS: Record<TierName, TierQuotaMap> = {
  free: {
    "order.created":    { limit: 100,   alertAt: 0.8 },
    "ai.call":          { limit: 50,    alertAt: 0.8 },
    "ai.recommend":     { limit: 200,   alertAt: 0.8 },
    "ai.insight":       { limit: 50,    alertAt: 0.8 },
    "whatsapp.sent":    { limit: 500,   alertAt: 0.8 },
    "sunat.emitted":    { limit: 0,     alertAt: 1.0 }, // bloqueado en free
    "storage.blob":     { limit: 1024,  alertAt: 0.8 }, // 1 GB en KB
    "sms.sent":         { limit: 50,    alertAt: 0.8 },
  },
  starter: {
    "order.created":    { limit: 1000,  alertAt: 0.8 },
    "ai.call":          { limit: 500,   alertAt: 0.8 },
    "ai.recommend":     { limit: 2000,  alertAt: 0.9 },
    "ai.insight":       { limit: 500,   alertAt: 0.9 },
    "whatsapp.sent":    { limit: 5000,  alertAt: 0.8 },
    "sunat.emitted":    { limit: 500,   alertAt: 0.9 },
    "storage.blob":     { limit: 10240, alertAt: 0.8 }, // 10 GB en KB
    "sms.sent":         { limit: 200,   alertAt: 0.8 },
  },
  pro: {
    "order.created":    { limit: 10000,  alertAt: 0.9 },
    "ai.call":          { limit: 5000,   alertAt: 0.9 },
    "ai.recommend":     { limit: 20000,  alertAt: 0.9 },
    "ai.insight":       { limit: 5000,   alertAt: 0.9 },
    "whatsapp.sent":    { limit: 50000,  alertAt: 0.9 },
    "sunat.emitted":    { limit: 5000,   alertAt: 0.9 },
    "storage.blob":     { limit: 102400, alertAt: 0.9 }, // 100 GB en KB
    "sms.sent":         { limit: 1000,   alertAt: 0.9 },
  },
  enterprise: {
    "order.created":    { limit: Infinity, alertAt: 1.0 },
    "ai.call":          { limit: Infinity, alertAt: 1.0 },
    "ai.recommend":     { limit: Infinity, alertAt: 1.0 },
    "ai.insight":       { limit: Infinity, alertAt: 1.0 },
    "whatsapp.sent":    { limit: Infinity, alertAt: 1.0 },
    "sunat.emitted":    { limit: Infinity, alertAt: 1.0 },
    "storage.blob":     { limit: Infinity, alertAt: 1.0 },
    "sms.sent":         { limit: Infinity, alertAt: 1.0 },
  },
} as const;

/** Devuelve el nombre del plan normalizado como TierName. Fallback: "free". */
export function normalizeTier(planName: string | null | undefined): TierName {
  const name = (planName ?? "free").toLowerCase().trim();
  if (name === "starter" || name === "pro" || name === "enterprise") {
    return name as TierName;
  }
  return "free";
}

/** Devuelve la quota de un evento para un tier dado. */
export function getQuota(
  tier: TierName,
  event: MeteredEvent,
): TierQuota | null {
  return USAGE_TIERS[tier][event] ?? null;
}
