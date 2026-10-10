import "server-only";
import { prisma } from "@/lib/prisma";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { defaultPoaConfig, esPlanDePlantacion, normEspecie, type OrigenPoa, type PlanParaPoa, type PoaConfig } from "@/lib/forestal/loth-poa";

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
 * El DEFECTO depende del plan (ADR-455): una plantación registrada no lleva
 * plan de manejo y no reserva semilleros (0 %); el bosque natural, 10 %. La
 * regla vive en `defaultPoaConfig` y se aplica ACÁ, una sola vez: la vista
 * POA, el censo de tala, el mapa, el planificador y la Extracción leen todos
 * de este `get`. Lo que el negocio guardó siempre manda.
 *
 * KV `PlatformSetting`, key `loth-poa:{tenantId}` → `{ [planId]: PoaConfig }`.
 * Patrón Buleje: `tenantId` 1er parámetro, sin `prisma.*` directo.
 */

export type { PoaConfig } from "@/lib/forestal/loth-poa";

const KEY_PREFIX = "loth-poa:";

/** Normaliza la config que llega del editor/API (claves de especie + rango). */
function normalizeConfig(raw: unknown, porDefecto: PoaConfig): PoaConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const overridesRaw = (o.dmcOverrides ?? {}) as Record<string, unknown>;
  const dmcOverrides: Record<string, number> = {};
  for (const [k, v] of Object.entries(overridesRaw).slice(0, 300)) {
    const cm = Number(v);
    // Un DMC fuera de 10–200 cm es un error de tipeo, no una decisión técnica.
    if (Number.isFinite(cm) && cm >= 10 && cm <= 200) dmcOverrides[normEspecie(k)] = Math.round(cm);
  }
  // Sin % (o vacío) → el defecto de ESTE plan, no el de fábrica.
  const pctRaw = o.semillerosPct == null || o.semillerosPct === "" ? Number.NaN : Number(o.semillerosPct);
  const semillerosPct = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, Math.round(pctRaw))) : porDefecto.semillerosPct;
  return { dmcOverrides, semillerosPct };
}

type PoaStore = Record<string, PoaConfig>;

/** La config que rige un plan y de dónde sale su % de semilleros. */
export interface PoaDelPlan {
  config: PoaConfig;
  origen: OrigenPoa;
}

/** Lo mínimo del plan para decidir el defecto; `null` si no es de este negocio o no existe. */
async function planDelTenant(tenantId: string, planId: string): Promise<PlanParaPoa | null> {
  return prisma.forestPlan.findFirst({
    where: { tenantId, id: planId },
    select: { planType: true, planNumber: true, tituloHabilitante: true },
  });
}

export const ForestLothPoaDB = {
  /**
   * Config y origen de UN plan. `plan` evita releerlo cuando quien llama ya lo
   * tiene (la Extracción lee todos los planes de una vez).
   */
  async leer(tenantId: string, planId: string, plan?: PlanParaPoa | null): Promise<PoaDelPlan> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) return { config: defaultPoaConfig(), origen: "defecto" };
    const [store, datos] = await Promise.all([
      PlatformSettingsDB.get<PoaStore>(`${KEY_PREFIX}${tenantId}`),
      plan !== undefined ? Promise.resolve(plan) : planDelTenant(tenantId, planId),
    ]);
    const porDefecto = defaultPoaConfig(datos);
    const guardada = store?.[planId];
    if (guardada) return { config: normalizeConfig(guardada, porDefecto), origen: "guardado" };
    return { config: porDefecto, origen: esPlanDePlantacion(datos) ? "plantacion" : "defecto" };
  },

  /** Config del plan (defaults del plan si nunca se tocó). */
  async get(tenantId: string, planId: string, plan?: PlanParaPoa | null): Promise<PoaConfig> {
    return (await ForestLothPoaDB.leer(tenantId, planId, plan)).config;
  },

  /** Reemplaza la config de UN plan sin tocar la de los demás. */
  async set(tenantId: string, planId: string, input: unknown, user = "unknown"): Promise<PoaConfig> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    const [actual, datos] = await Promise.all([
      PlatformSettingsDB.get<PoaStore>(`${KEY_PREFIX}${tenantId}`),
      planDelTenant(tenantId, planId),
    ]);
    const store = actual ?? {};
    const config = normalizeConfig(input, defaultPoaConfig(datos));
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
