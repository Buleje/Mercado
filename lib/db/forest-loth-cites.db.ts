import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditLoth } from "@/lib/forestal/loth-audit";
import {
  emptyLothCites,
  normalizeLothCites,
  type LothCitesCatalogo,
} from "@/lib/forestal/loth-cites-types";

/**
 * ForestLothCitesDB — catálogo de permisos CITES del Libro de Operaciones TH.
 *
 * POR QUÉ EXISTE:
 * una especie CITES (caoba, cedro, shihuahuaco) es LEGAL con su permiso de
 * exportación archivado; NO es infracción. Pero el libro debe poder acreditar el
 * N° de permiso y su vigencia ante OSINFOR — el booleano `cites` de cada línea no
 * alcanza. Este catálogo es la fuente que cruza el panel Cumplimiento y que ve el
 * operador al registrar una especie protegida.
 *
 * DÓNDE VIVE (sin migración):
 * en el KV global `PlatformSetting`, key `loth-cites:{tenantId}` — mismo patrón
 * que `ForestCtpFichaDB` (ficha del CTP) y `lib/rum-history.ts`: data per-tenant
 * por prefijo de key, para no fabricar una migración por un puñado de permisos.
 *
 * Patrón Buleje: `tenantId` 1er parámetro, sin `prisma.*` directo (delega en
 * `PlatformSettingsDB`). La forma y los helpers puros viven en
 * `lib/forestal/loth-cites-types.ts` (client-safe).
 */

export type { LothCitesCatalogo, LothCitesPermiso } from "@/lib/forestal/loth-cites-types";

const KEY_PREFIX = "loth-cites:";

export const ForestLothCitesDB = {
  /** Lee el catálogo CITES del tenant (vacío si nunca se cargó). */
  async get(tenantId: string): Promise<LothCitesCatalogo> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown>(`${KEY_PREFIX}${tenantId}`);
    return raw ? normalizeLothCites(raw) : emptyLothCites();
  },

  /** Reemplaza el catálogo (normaliza + audita). Devuelve la forma canónica. */
  async set(tenantId: string, input: unknown, user = "unknown"): Promise<LothCitesCatalogo> {
    if (!tenantId) throw new Error("tenantId is required");
    const catalogo = normalizeLothCites(input);
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, catalogo, user);
    auditLoth({
      tenantId,
      action: "loth_cites_update",
      entity: "ForestLothCites",
      entityId: tenantId,
      detail: `Actualizó el catálogo de permisos CITES del libro (${catalogo.permisos.length} ${catalogo.permisos.length === 1 ? "permiso" : "permisos"})`,
      user,
    });
    return catalogo;
  },
};
