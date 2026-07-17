import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  emptyCtpFicha,
  normalizeCtpFicha,
  type CtpFicha,
} from "@/lib/forestal/ctp-ficha-types";

/**
 * ForestCtpFichaDB — Ficha legal del Centro de Transformación Primaria (CTP).
 *
 * POR QUÉ EXISTE:
 * SERFOR exige que un CTP esté REGISTRADO ante la ARFFS (Autoridad Regional
 * Forestal y de Fauna Silvestre), que tenga un **Código de CTP** asignado y que
 * declare los **títulos habilitantes** de los que proviene su materia prima.
 * Esa identidad legal es la que debe encabezar CADA documento fiscalizable que
 * emite el módulo: el certificado de trazabilidad, la GTF de salida y el export
 * del Libro de Operaciones (LO-CTP). Sin ella, esos documentos salen "anónimos"
 * y no sirven ante un fiscalizador.
 *
 * DÓNDE VIVE (sin migración):
 * en el KV global `PlatformSetting`, key `ctp-ficha:{tenantId}` — mismo patrón
 * documentado que `lib/rum-history.ts`: data per-tenant en el KV global vía
 * prefijo de key, para no fabricar una migración (fricción pooler/DIRECT_URL)
 * por un puñado de campos de configuración. Si el módulo crece (varios CTP por
 * tenant, versionado del registro), promover a tabla propia con el skill
 * `migration-planner`.
 *
 * Patrón Buleje: `tenantId` 1er parámetro. No toca `prisma.*` directo — delega
 * en `PlatformSettingsDB` (la única vía canónica al modelo). La forma y los
 * helpers puros viven en `lib/forestal/ctp-ficha-types.ts` (client-safe).
 */

export type { CtpFicha, CtpTituloHabilitante } from "@/lib/forestal/ctp-ficha-types";
export { emptyCtpFicha, ctpFichaFaltantes, CTP_FICHA_REQUIRED } from "@/lib/forestal/ctp-ficha-types";

const KEY_PREFIX = "ctp-ficha:";

export const ForestCtpFichaDB = {
  /** Lee la ficha del CTP del tenant (vacía si nunca se cargó). */
  async get(tenantId: string): Promise<CtpFicha> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown>(`${KEY_PREFIX}${tenantId}`);
    return raw ? normalizeCtpFicha(raw) : emptyCtpFicha();
  },

  /** Persiste la ficha (normaliza + audita). Devuelve la forma canónica guardada. */
  async set(tenantId: string, input: Partial<CtpFicha>, user = "unknown"): Promise<CtpFicha> {
    if (!tenantId) throw new Error("tenantId is required");
    // Merge sobre lo existente: el editor puede mandar solo lo que cambió.
    const current = await this.get(tenantId);
    const merged = normalizeCtpFicha({ ...current, ...input });
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, merged, user);
    auditCtp({
      tenantId,
      action: "ctp_ficha_update",
      entity: "ForestCtpFicha",
      entityId: tenantId,
      detail: `Actualizó la ficha legal del CTP${merged.codigoCtp ? ` · Código CTP ${merged.codigoCtp}` : ""}${merged.ruc ? ` · RUC ${merged.ruc}` : ""}`,
      user,
    });
    return merged;
  },
};
