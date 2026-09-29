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

/**
 * Otro guardó el plano después de que este cliente lo leyó: su PUT pisaría
 * lo del otro (el documento se reemplaza entero). Lleva la versión actual para
 * que el cliente recargue o mezcle sobre ella.
 */
export class CartografiaCambioError extends Error {
  constructor(readonly actual: LothCartografia) {
    super("La cartografía cambió desde que se leyó.");
    this.name = "CartografiaCambioError";
  }
}

export const ForestLothCartografiaDB = {
  /**
   * Lee la cartografía del tenant (vacía si nunca se cargó). De la BASE, sin
   * el caché por instancia: el `updatedAt` que se lee acá es la versión contra
   * la que el cliente guarda después, y una vieja daría un 409 falso.
   */
  async get(tenantId: string): Promise<LothCartografia> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.getFresco<unknown>(`${KEY_PREFIX}${tenantId}`);
    return raw ? normalizeCartografia(raw) : emptyCartografia();
  },

  /**
   * Reemplaza referencias + accesos (normaliza, sella updatedAt y audita).
   *
   * Control optimista: con `baseUpdatedAt` (el `updatedAt` que el cliente
   * leyó), si lo guardado ya es otro se tira `CartografiaCambioError` y NO se
   * escribe. Leer y escribir van bajo el lock de la clave (`actualizar`): dos
   * PUT con la misma base no pasan los dos. Sin `baseUpdatedAt` (clientes
   * viejos) se guarda como siempre.
   */
  async set(tenantId: string, input: unknown, user = "unknown", nowIso?: string, opts: { baseUpdatedAt?: string | null } = {}): Promise<LothCartografia> {
    if (!tenantId) throw new Error("tenantId is required");
    const carto = normalizeCartografia(input);
    carto.updatedAt = nowIso ?? new Date().toISOString();
    const r = await PlatformSettingsDB.actualizar<unknown, LothCartografia | null>(
      `${KEY_PREFIX}${tenantId}`,
      (actualRaw) => {
        if (opts.baseUpdatedAt !== undefined) {
          const actual = actualRaw ? normalizeCartografia(actualRaw) : emptyCartografia();
          if ((actual.updatedAt ?? null) !== (opts.baseUpdatedAt ?? null)) return { resultado: actual };
        }
        return { valor: carto, resultado: null };
      },
      user,
    );
    if (r) throw new CartografiaCambioError(r);
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
