import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { normalizeParcela, emptyParcela, polygonAreaHa, hasParcela, type LothParcela } from "@/lib/forestal/loth-geo";

/**
 * ForestLothParcelaDB — polígono del área de aprovechamiento del Libro TH, la
 * pieza de geolocalización que exige el Reglamento UE Antideforestación (EUDR).
 *
 * POR QUÉ EXISTE:
 * el libro ya captura el GPS de cada tala (`gpsLat/gpsLng`), pero EUDR pide el
 * POLÍGONO de la parcela ("plot of land") donde se produjo la madera. No hay un
 * campo de geometría en `ForestPlan` — y agregar uno es una migración por un
 * puñado de vértices. Igual que `ForestLothCitesDB` y `ForestLothCierreDB`, vive
 * en el KV global `PlatformSetting`, key `loth-parcela:{tenantId}`.
 *
 * Patrón Buleje: `tenantId` 1er parámetro, sin `prisma.*` directo (delega en
 * `PlatformSettingsDB`). La forma y la matemática (área, punto-en-polígono) viven
 * en `lib/forestal/loth-geo.ts` (puro, client-safe).
 */

export type { LothParcela } from "@/lib/forestal/loth-geo";

const KEY_PREFIX = "loth-parcela:";

export const ForestLothParcelaDB = {
  /** Lee la parcela declarada del tenant (vacía si nunca se dibujó). */
  async get(tenantId: string): Promise<LothParcela> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown>(`${KEY_PREFIX}${tenantId}`);
    return raw ? normalizeParcela(raw) : emptyParcela();
  },

  /** Reemplaza la parcela (normaliza + sella updatedAt + audita). */
  async set(tenantId: string, input: unknown, user = "unknown", nowIso?: string): Promise<LothParcela> {
    if (!tenantId) throw new Error("tenantId is required");
    const parcela = normalizeParcela(input);
    parcela.updatedAt = nowIso ?? new Date().toISOString();
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, parcela, user);
    const detalle = hasParcela(parcela)
      ? `Actualizó el área de aprovechamiento (${parcela.vertices.length} vértices · ${polygonAreaHa(parcela.vertices).toFixed(2)} ha${parcela.deforestacionCero ? " · deforestación cero declarada" : ""})`
      : "Borró el área de aprovechamiento declarada";
    auditLoth({
      tenantId,
      action: "loth_parcela_update",
      entity: "ForestLothParcela",
      entityId: tenantId,
      detail: detalle,
      user,
    });
    return parcela;
  },
};
