import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { normalizeCartografia, emptyCartografia, hasPredio, type LothCartografia } from "@/lib/forestal/loth-cartografia";

/**
 * ForestLothCartografiaDB — referencias (centros poblados, campamentos, ingreso
 * a la UMF…) y el cuadro de ACCESOS del plano forestal del Libro TH.
 *
 * POR QUÉ EXISTE:
 * un plano oficial no muestra solo el polígono: muestra cómo se llega y qué hay
 * alrededor. Eso no vive en ninguna tabla del libro y agregar dos modelos por un
 * puñado de filas no se paga. Igual que `ForestLothParcelaDB`, se guarda en el
 * KV global `PlatformSetting`, key `loth-cartografia:{tenantId}`.
 *
 * Patrón Buleje: `tenantId` 1er parámetro, sin `prisma.*` directo, forma y
 * validación en `lib/forestal/loth-cartografia.ts` (puro, client-safe).
 */

export type { LothCartografia } from "@/lib/forestal/loth-cartografia";

const KEY_PREFIX = "loth-cartografia:";

export const ForestLothCartografiaDB = {
  /** Lee la cartografía del tenant (vacía si nunca se cargó). */
  async get(tenantId: string): Promise<LothCartografia> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown>(`${KEY_PREFIX}${tenantId}`);
    return raw ? normalizeCartografia(raw) : emptyCartografia();
  },

  /** Reemplaza referencias + accesos (normaliza, sella updatedAt y audita). */
  async set(tenantId: string, input: unknown, user = "unknown", nowIso?: string): Promise<LothCartografia> {
    if (!tenantId) throw new Error("tenantId is required");
    const carto = normalizeCartografia(input);
    carto.updatedAt = nowIso ?? new Date().toISOString();
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, carto, user);
    auditLoth({
      tenantId,
      action: "loth_cartografia_update",
      entity: "ForestLothCartografia",
      entityId: tenantId,
      detail: `Actualizó la cartografía del plano (${carto.referencias.length} referencia(s) · ${carto.vias.length} vía(s) · ${carto.accesos.length} tramo(s) de acceso${hasPredio(carto.predio) ? ` · predio de ${carto.predio.vertices.length} vértices` : ""})`,
      user,
    });
    return carto;
  },
};
