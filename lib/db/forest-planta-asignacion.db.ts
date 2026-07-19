import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";

/**
 * ForestPlantaAsignacionDB — dónde está ubicada cada troza (ADR-142 follow-up).
 *
 * Mapa `woodEntryId → zonaId`: qué ingreso de materia prima está apilado en qué
 * zona del Mapa de Planta. Igual que las zonas, va en KV (PlatformSetting) — no
 * fabrica una migración ni agrega columnas a WoodEntry. La ubicación es un dato
 * operativo mutable (la madera se mueve), no del libro legal, así que vive aparte.
 *
 * `tenantId` 1er param. Auditado vía `auditCtp` (`ctp_planta_asignar`).
 */

const KEY_PREFIX = "ctp-planta-asignacion:";

export const ForestPlantaAsignacionDB = {
  /** Mapa `entryId → zonaId` del tenant (solo entradas con zona asignada). */
  async getMap(tenantId: string): Promise<Record<string, string>> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<Record<string, unknown>>(`${KEY_PREFIX}${tenantId}`);
    const out: Record<string, string> = {};
    if (raw && typeof raw === "object") {
      for (const [entryId, zonaId] of Object.entries(raw)) {
        if (typeof zonaId === "string" && zonaId.trim()) out[entryId] = zonaId;
      }
    }
    return out;
  },

  /** Ubica (o desubica con zonaId=null) un ingreso en una zona. */
  async set(tenantId: string, entryId: string, zonaId: string | null, user = "unknown"): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const id = String(entryId ?? "").trim();
    if (!id) throw new Error("entryId is required");
    const map = await this.getMap(tenantId);
    const zona = zonaId ? String(zonaId).trim() : "";
    if (zona) map[id] = zona;
    else delete map[id];
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
    const map = await this.getMap(tenantId);
    const before = Object.keys(map).length;
    for (const [entryId, zid] of Object.entries(map)) if (zid === zonaId) delete map[entryId];
    const cleaned = before - Object.keys(map).length;
    if (cleaned > 0) await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, map, user);
    return cleaned;
  },
};
