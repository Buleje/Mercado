import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { aplicarUbicacion, parsearUbicaciones, soloZonas, type Ubicacion } from "@/lib/forestal/planta-ubicacion";

/**
 * ForestPlantaAsignacionDB — dónde está ubicada cada troza (ADR-142 follow-up).
 *
 * Mapa `woodEntryId → { zonaId, lat?, lng? }`: qué ingreso está apilado en qué
 * zona del Mapa de Planta y, si el operador lo movió a mano, en qué punto de
 * ella. Igual que las zonas, va en KV (PlatformSetting) — no fabrica una
 * migración ni agrega columnas a WoodEntry. La ubicación es un dato operativo
 * mutable (la madera se mueve), no del libro legal, así que vive aparte.
 *
 * El formato viejo (el valor era el `zonaId` suelto) se sigue leyendo: la
 * normalización vive en `planta-ubicacion.ts`, que es puro y tiene tests.
 *
 * `tenantId` 1er param. Auditado vía `auditCtp` (`ctp_planta_asignar`).
 */

const KEY_PREFIX = "ctp-planta-asignacion:";

export const ForestPlantaAsignacionDB = {
  /** Ubicación completa (zona + punto) de cada ingreso ubicado. */
  async getUbicaciones(tenantId: string): Promise<Record<string, Ubicacion>> {
    if (!tenantId) throw new Error("tenantId is required");
    return parsearUbicaciones(await PlatformSettingsDB.get<Record<string, unknown>>(`${KEY_PREFIX}${tenantId}`));
  },

  /** Vista `entryId → zonaId`, que es lo que consume casi todo el módulo. */
  async getMap(tenantId: string): Promise<Record<string, string>> {
    return soloZonas(await this.getUbicaciones(tenantId));
  },

  /**
   * Ubica (o desubica con zonaId=null) un ingreso en una zona. `pos` fija el
   * punto exacto dentro de ella; sin `pos`, el mapa lo reparte solo.
   */
  async set(
    tenantId: string,
    entryId: string,
    zonaId: string | null,
    user = "unknown",
    pos?: { lat: number; lng: number } | null,
  ): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const id = String(entryId ?? "").trim();
    if (!id) throw new Error("entryId is required");
    const map = aplicarUbicacion(await this.getUbicaciones(tenantId), id, zonaId, pos);
    const zona = zonaId ? String(zonaId).trim() : "";
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, map, user);
    auditCtp({
      tenantId,
      action: "ctp_planta_asignar",
      entity: "ForestPlantaZona",
      entityId: id,
      detail: zona ? `Ubicó el ingreso ${id.slice(0, 8)} en la zona ${zona.slice(0, 8)}` : `Quitó el ingreso ${id.slice(0, 8)} de su zona`,
      user,
    });
  },

  /**
   * Limpia las asignaciones que apuntan a una zona borrada (evita huérfanas).
   * Devuelve cuántas se limpiaron.
   */
  async clearForZona(tenantId: string, zonaId: string, user = "unknown"): Promise<number> {
    if (!tenantId || !zonaId) return 0;
    const map = await this.getUbicaciones(tenantId);
    const before = Object.keys(map).length;
    for (const [entryId, u] of Object.entries(map)) if (u.zonaId === zonaId) delete map[entryId];
    const cleaned = before - Object.keys(map).length;
    if (cleaned > 0) await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, map, user);
    return cleaned;
  },
};
