import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { claveGeo } from "@/lib/forestal/loth-alcance-geo";
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
  /**
   * Lee la parcela declarada (vacía si nunca se dibujó). Sin `planId` es la del
   * negocio; con `planId`, la propia de ese permiso (ADR-462), SIN heredar.
   */
  async get(tenantId: string, planId?: string | null): Promise<LothParcela> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown>(claveGeo(KEY_PREFIX, tenantId, planId));
    return raw ? normalizeParcela(raw) : emptyParcela();
  },

  /** La de cada plan de la lista que tenga área (los que no, no salen). */
  async listarPorPlan(tenantId: string, planIds: readonly string[]): Promise<{ planId: string; parcela: LothParcela }[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const todas = await Promise.all(planIds.map(async (planId) => ({ planId, parcela: await ForestLothParcelaDB.get(tenantId, planId) })));
    return todas.filter((x) => hasParcela(x.parcela));
  },

  /**
   * Copia el área del negocio al plan, SIN pisar nunca: bajo el lock de la clave
   * del plan, si ya tiene área no escribe.
   */
  async copiarDelNegocio(tenantId: string, planId: string, user = "unknown", nowIso?: string): Promise<{ ok: true; parcela: LothParcela } | { ok: false; motivo: "ya_tiene_area" | "sin_area_del_negocio" }> {
    if (!tenantId) throw new Error("tenantId is required");
    const clavePlan = claveGeo(KEY_PREFIX, tenantId, planId);
    const negocio = await ForestLothParcelaDB.get(tenantId);
    if (!hasParcela(negocio)) return { ok: false, motivo: "sin_area_del_negocio" };
    const copia: LothParcela = { ...negocio, updatedAt: nowIso ?? new Date().toISOString() };
    const hecho = await PlatformSettingsDB.actualizar<unknown, boolean>(
      clavePlan,
      (actual) => (actual && hasParcela(normalizeParcela(actual)) ? { resultado: false } : { valor: copia, resultado: true }),
      user,
    );
    if (!hecho) return { ok: false, motivo: "ya_tiene_area" };
    auditLoth({
      tenantId,
      action: "loth_parcela_update",
      entity: "ForestLothParcela",
      entityId: planId,
      detail: `Pasó el área del negocio (${copia.vertices.length} vértices) al permiso`,
      user,
    });
    return { ok: true, parcela: copia };
  },

  /** Reemplaza la parcela (normaliza + sella updatedAt + audita). */
  async set(tenantId: string, input: unknown, user = "unknown", nowIso?: string, planId?: string | null): Promise<LothParcela> {
    if (!tenantId) throw new Error("tenantId is required");
    const parcela = normalizeParcela(input);
    parcela.updatedAt = nowIso ?? new Date().toISOString();
    // Mismo lock por clave que `copiarDelNegocio`: guardar y copiar no se pisan.
    await PlatformSettingsDB.actualizar<unknown, null>(claveGeo(KEY_PREFIX, tenantId, planId), () => ({ valor: parcela, resultado: null }), user);
    const detalle = hasParcela(parcela)
      ? `Actualizó el área de aprovechamiento (${parcela.vertices.length} vértices · ${polygonAreaHa(parcela.vertices).toFixed(2)} ha${parcela.deforestacionCero ? " · deforestación cero declarada" : ""})`
      : "Borró el área de aprovechamiento declarada";
    auditLoth({
      tenantId,
      action: "loth_parcela_update",
      entity: "ForestLothParcela",
      entityId: planId || tenantId,
      detail: detalle,
      user,
    });
    return parcela;
  },
};
