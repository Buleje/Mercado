import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * TenantFeatureFlagDB — flags de feature por tenant en tabla dedicada
 * `TenantFeatureFlag` (@@unique([tenantId, flagKey])).
 *
 * A diferencia de `lib/feature-flags.ts` (env-only, global) y
 * `lib/flags/tenant-flags.ts` (guarda en Settings.featureFlagsJson), esta tabla
 * es indexada y auditable — apta para flags operativos por tenant como el
 * "Modo SUNAT Oficial". tenantId es siempre el 1er parámetro (regla #3).
 */
export const TenantFeatureFlagDB = {
  /** Devuelve si el flag está encendido para el tenant (default false). */
  async isEnabled(tenantId: string, flagKey: string): Promise<boolean> {
    const row = await prisma.tenantFeatureFlag.findUnique({
      where: { tenantId_flagKey: { tenantId, flagKey } },
      select: { enabled: true },
    });
    return row?.enabled ?? false;
  },

  /** Enciende/apaga el flag (upsert idempotente). */
  async set(tenantId: string, flagKey: string, enabled: boolean): Promise<void> {
    await prisma.tenantFeatureFlag.upsert({
      where: { tenantId_flagKey: { tenantId, flagKey } },
      create: { tenantId, flagKey, enabled },
      update: { enabled },
    });
  },
};
