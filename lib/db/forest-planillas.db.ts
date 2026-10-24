import "server-only";
import { z } from "zod";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { logger } from "@/lib/logger";
import { esPlanillaId, parteEditable, promptParaLeer } from "@/lib/forestal/planillas/catalogo";
import type { PlanillaCampo, PlanillaId, PromptGuardado } from "@/lib/forestal/planillas/tipos";

/**
 * ForestPlanillasDB — el prompt PROPIO de cada negocio para leer sus planillas
 * de campo (17-10). Sin guardado, se lee con el de fábrica del catálogo.
 *
 * POR QUÉ KV: son a lo sumo seis textos por negocio que se editan de vez en
 * cuando; mismo patrón que el talonario de la matricial (`gtf-talonario:<t>`).
 * Un `PlatformSetting` por tenant con TODOS sus prompts, escritura con bloqueo
 * por clave (ADR-445: dos pestañas que guardan a la vez no se pisan).
 *
 * Lectura SIEMPRE fresca (`getFresco`): quien edita el prompt prueba la lectura
 * enseguida, y la caché de 5 min por instancia le leería la foto con el viejo.
 * Una ida a la base al lado de una lectura de IA de varios segundos no se nota.
 */

const KEY_PREFIX = "planillas-prompt:";

export const clavePromptsPlanillas = (tenantId: string): string => `${KEY_PREFIX}${tenantId}`;

const GuardadoSchema = z.object({
  planillaId: z.string(),
  texto: z.string().min(1),
  basadoEnVersion: z.number().int().min(0),
  actualizadoPor: z.string().catch("unknown"),
  actualizadoEn: z.string().catch(""),
});

export type PromptsDelNegocio = Partial<Record<PlanillaId, PromptGuardado>>;

/** Lo guardado, sano: sólo planillas que existen y entradas que tienen forma (lo demás se ignora, no tumba la lectura). */
function sanear(valor: unknown): PromptsDelNegocio {
  const out: PromptsDelNegocio = {};
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return out;
  for (const [id, v] of Object.entries(valor as Record<string, unknown>)) {
    if (!esPlanillaId(id)) continue;
    const r = GuardadoSchema.safeParse(v);
    if (r.success) out[id] = { ...r.data, planillaId: id };
  }
  return out;
}

export const ForestPlanillasDB = {
  async prompts(tenantId: string): Promise<PromptsDelNegocio> {
    if (!tenantId) throw new Error("tenantId is required");
    return sanear(await PlatformSettingsDB.getFresco<unknown>(clavePromptsPlanillas(tenantId)));
  },

  async prompt(tenantId: string, planillaId: PlanillaId): Promise<PromptGuardado | null> {
    return (await ForestPlanillasDB.prompts(tenantId))[planillaId] ?? null;
  },

  /** Guarda (o reemplaza) el prompt del negocio para una planilla. Devuelve lo guardado. */
  async guardar(
    tenantId: string,
    planillaId: PlanillaId,
    datos: { texto: string; basadoEnVersion: number },
    user = "unknown",
  ): Promise<PromptGuardado> {
    if (!tenantId) throw new Error("tenantId is required");
    const guardado: PromptGuardado = {
      planillaId,
      texto: datos.texto,
      basadoEnVersion: datos.basadoEnVersion,
      actualizadoPor: user,
      actualizadoEn: new Date().toISOString(),
    };
    return PlatformSettingsDB.actualizar<unknown, PromptGuardado>(
      clavePromptsPlanillas(tenantId),
      (actual) => ({ valor: { ...sanear(actual), [planillaId]: guardado }, resultado: guardado }),
      user,
    );
  },

  /**
   * El prompt con el que se lee una foto de esa planilla en este negocio: el
   * suyo si lo guardó, si no el de fábrica. Si la base falla, el de fábrica (y
   * así lo dice `origen`): no leer la foto por no poder leer el ajuste sería peor.
   */
  async promptParaLeer(tenantId: string, planilla: PlanillaCampo): Promise<{ texto: string; origen: "fabrica" | "negocio"; version: number }> {
    let guardado: PromptGuardado | null = null;
    try {
      guardado = await ForestPlanillasDB.prompt(tenantId, planilla.id);
    } catch (err) {
      logger.error("[planillas] no se pudo leer el prompt del negocio; se usa el de fábrica", {
        tenantId,
        planillaId: planilla.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    const propio = guardado && parteEditable(guardado.texto) ? guardado : null;
    return propio
      ? { texto: promptParaLeer(planilla, propio), origen: "negocio", version: propio.basadoEnVersion }
      : { texto: planilla.prompt, origen: "fabrica", version: planilla.versionPrompt };
  },

  /** Vuelve al prompt de fábrica. `true` si había uno guardado. */
  async borrar(tenantId: string, planillaId: PlanillaId, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, boolean>(
      clavePromptsPlanillas(tenantId),
      (actual) => {
        const todos = sanear(actual);
        if (!todos[planillaId]) return { resultado: false };
        delete todos[planillaId];
        return { valor: todos, resultado: true };
      },
      user,
    );
  },
};
