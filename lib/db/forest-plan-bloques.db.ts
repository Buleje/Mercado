/**
 * El reparto por bloque o zona de las especies de un plan (Brandon 24-10).
 *
 * Sin schema, como los parámetros del POA (`forest-loth-poa.db.ts`): una clave
 * de `PlatformSettings` por negocio con el mapa `planId → reparto`. Es un
 * DETALLE del registro, no su base: el saldo sigue en `ForestPlanSpecies` y el
 * reparto no lo cambia (`lib/forestal/loth-plan-bloques.ts`).
 *
 * Se escribe con `actualizar` (lee de la base bajo candado: dos guardados a la
 * vez no se pisan) y un guardado igual al que ya está no escribe ni audita.
 */
import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { bloquesDelPlanSchema, juntarPorEspecie, type BloqueDelPlan } from "@/lib/forestal/loth-plan-bloques";

const KEY_PREFIX = "loth-plan-bloques:";
const claveDe = (tenantId: string) => `${KEY_PREFIX}${tenantId}`;

export interface RepartoGuardado {
  bloques: BloqueDelPlan[];
  updatedAt: string;
  updatedBy: string;
}

type Store = Record<string, RepartoGuardado>;

/** Lo guardado vuelto a validar: un valor roto en la clave no llega a la pantalla. */
function normalizar(raw: unknown): RepartoGuardado | null {
  const o = (raw ?? null) as Partial<RepartoGuardado> | null;
  if (!o) return null;
  const p = bloquesDelPlanSchema.safeParse(o.bloques);
  if (!p.success || p.data.length === 0) return null;
  return {
    bloques: p.data,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
    updatedBy: typeof o.updatedBy === "string" ? o.updatedBy : "",
  };
}

export const ForestPlanBloquesDB = {
  /** El reparto de un plan, leído de la base (no del caché: se lee justo después de guardarlo). */
  async leer(tenantId: string, planId: string): Promise<RepartoGuardado | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) return null;
    const store = await PlatformSettingsDB.getFresco<Store>(claveDe(tenantId));
    return normalizar(store?.[planId]);
  },

  /**
   * Guarda el reparto ya validado (`bloquesDelPlanSchema`). Vacío = lo borra.
   * Devuelve lo que quedó y si se escribió algo.
   */
  async guardar(
    tenantId: string,
    planId: string,
    bloques: BloqueDelPlan[],
    user = "unknown",
  ): Promise<{ reparto: RepartoGuardado | null; cambio: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    const res = await PlatformSettingsDB.actualizar<Store, { reparto: RepartoGuardado | null; cambio: boolean; antes: number }>(
      claveDe(tenantId),
      (actual) => {
        const store: Store = { ...(actual ?? {}) };
        const antes = normalizar(store[planId]);
        if (JSON.stringify(antes?.bloques ?? []) === JSON.stringify(bloques)) {
          return { resultado: { reparto: antes, cambio: false, antes: antes?.bloques.length ?? 0 } };
        }
        if (bloques.length === 0) {
          delete store[planId];
          return { valor: store, resultado: { reparto: null, cambio: true, antes: antes?.bloques.length ?? 0 } };
        }
        const reparto: RepartoGuardado = { bloques, updatedAt: new Date().toISOString(), updatedBy: user };
        store[planId] = reparto;
        return { valor: store, resultado: { reparto, cambio: true, antes: antes?.bloques.length ?? 0 } };
      },
      user,
    );
    if (res.cambio) {
      const especies = juntarPorEspecie(bloques).length;
      auditLoth({
        tenantId,
        action: "loth_plan_bloques_update",
        entity: "ForestLothPlanBloques",
        entityId: planId,
        detail:
          bloques.length === 0
            ? `Quitó el reparto por bloques (tenía ${res.antes} ${res.antes === 1 ? "bloque" : "bloques"})`
            : `Guardó el reparto por bloques: ${bloques.length} ${bloques.length === 1 ? "bloque" : "bloques"} · ${especies} ${especies === 1 ? "especie" : "especies"} (${bloques.map((b) => b.nombre).join(", ")})`,
        user,
      });
    }
    return { reparto: res.reparto, cambio: res.cambio };
  },
};
