import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { defaultPoaConfig, normEspecie, type PoaConfig } from "@/lib/forestal/loth-poa";

/**
 * ForestLothPoaDB — parámetros del Plan Operativo por plan de manejo: el DMC que
 * rige cada especie y el porcentaje de semilleros que queda en pie.
 *
 * POR QUÉ EXISTE:
 * el DMC por defecto sale de la norma (RJ 458-2002-INRENA), pero un plan puede
 * tener otro aprobado por la ARFFS y las listas regionales cambian. Guardarlo
 * como override por plan evita tocar `ForestPlanSpecies` (migración) para un
 * puñado de números que además son configuración, no datos del censo.
 *
 * KV `PlatformSetting`, key `loth-poa:{tenantId}` → `{ [planId]: PoaConfig }`.
 * Patrón Buleje: `tenantId` 1er parámetro, sin `prisma.*` directo.
 */

export type { PoaConfig } from "@/lib/forestal/loth-poa";

const KEY_PREFIX = "loth-poa:";

/** Normaliza la config que llega del editor/API (claves de especie + rango). */
function normalizeConfig(raw: unknown): PoaConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const overridesRaw = (o.dmcOverrides ?? {}) as Record<string, unknown>;
  const dmcOverrides: Record<string, number> = {};
  for (const [k, v] of Object.entries(overridesRaw).slice(0, 300)) {
    const cm = Number(v);
    // Un DMC fuera de 10–200 cm es un error de tipeo, no una decisión técnica.
    if (Number.isFinite(cm) && cm >= 10 && cm <= 200) dmcOverrides[normEspecie(k)] = Math.round(cm);
  }
  const pctRaw = Number(o.semillerosPct);
  const semillerosPct = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, Math.round(pctRaw))) : defaultPoaConfig().semillerosPct;
  return { dmcOverrides, semillerosPct };
}

type PoaStore = Record<string, PoaConfig>;

export const ForestLothPoaDB = {
  /** Config del plan (defaults si nunca se tocó). */
  async get(tenantId: string, planId: string): Promise<PoaConfig> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) return defaultPoaConfig();
    const store = (await PlatformSettingsDB.get<PoaStore>(`${KEY_PREFIX}${tenantId}`)) ?? {};
    return store[planId] ? normalizeConfig(store[planId]) : defaultPoaConfig();
  },

  /** Reemplaza la config de UN plan sin tocar la de los demás. */
  async set(tenantId: string, planId: string, input: unknown, user = "unknown"): Promise<PoaConfig> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    const store = (await PlatformSettingsDB.get<PoaStore>(`${KEY_PREFIX}${tenantId}`)) ?? {};
    const config = normalizeConfig(input);
    store[planId] = config;
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, store, user);
    auditLoth({
      tenantId,
      action: "loth_poa_config_update",
      entity: "ForestLothPoa",
      entityId: planId,
      detail: `Actualizó los parámetros del POA (${Object.keys(config.dmcOverrides).length} DMC por especie · ${config.semillerosPct}% de semilleros)`,
      user,
    });
    return config;
  },
};
