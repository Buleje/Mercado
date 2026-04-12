import "server-only";
/**
 * ADR-047 — Quota Checker.
 *
 * Evalúa si el uso actual de un tenant para un evento dado
 * supera el threshold de alerta definido en USAGE_TIERS.
 * Devuelve null (ok), "warning" (≥alertAt), o "critical" (≥90%).
 */
import type { MeteredEvent } from "@/lib/billing/metering";
import { getQuota, normalizeTier } from "@/lib/billing/wire-up/usage-tiers";
import { SettingsDB } from "@/lib/db/settings.db";
import type { AlertLevel } from "./deduper";

export interface QuotaCheckResult {
  level: AlertLevel | null;
  percentUsed: number;
  currentUsage: number;
  limit: number;
  planName: string;
  businessName?: string;
}

/**
 * Verifica si el uso de un evento supera el threshold de alerta.
 *
 * @param tenantId      Tenant a verificar
 * @param event         Evento facturable (ej: "order.created")
 * @param currentUsage  Suma acumulada del mes actual
 */
export async function checkQuota(
  tenantId: string,
  event: MeteredEvent,
  currentUsage: number,
): Promise<QuotaCheckResult> {
  const settings = await SettingsDB.get(tenantId);
  const planName = (settings as Record<string, unknown>).planName as string | undefined ?? "free";
  const businessName = (settings as Record<string, unknown>).businessName as string | undefined;
  const tier = normalizeTier(planName);
  const quota = getQuota(tier, event);

  if (!quota || quota.limit === 0) {
    // Límite 0 = bloqueado en este tier (ej: sunat en free)
    return {
      level: currentUsage > 0 ? "critical" : null,
      percentUsed: currentUsage > 0 ? 100 : 0,
      currentUsage,
      limit: 0,
      planName,
      businessName,
    };
  }

  if (quota.limit === Infinity) {
    return {
      level: null,
      percentUsed: 0,
      currentUsage,
      limit: Infinity,
      planName,
      businessName,
    };
  }

  const percentUsed = currentUsage / quota.limit;

  let level: AlertLevel | null = null;
  if (percentUsed >= 0.9) {
    level = "critical";
  } else if (percentUsed >= quota.alertAt) {
    level = "warning";
  }

  return {
    level,
    percentUsed: percentUsed * 100,
    currentUsage,
    limit: quota.limit,
    planName,
    businessName,
  };
}
