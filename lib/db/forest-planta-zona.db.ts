import "server-only";
import { randomUUID } from "node:crypto";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { normalizeZona, zonaTipoMeta, type PlantaZona } from "@/lib/forestal/planta-zona-types";

/**
 * ForestPlantaZonaDB — zonas físicas del aserradero (Mapa de Planta, ADR-142).
 *
 * POR QUÉ KV: una zona (patio de trozas, aserrado, despacho…) es identidad
 * estable de la planta, no un movimiento del libro. Se guarda como lista en un
 * KV maestro por tenant (`PlatformSetting`), igual que la Ficha del CTP y la geo
 * EUDR — sin fabricar una migración (que necesita DIRECT_URL). No toca las tablas
 * de trazabilidad; el mapa LEE el libro (saldos) pero las zonas viven aparte.
 *
 * `tenantId` 1er param en toda operación. Auditado vía `auditCtp`.
 */

const KEY_PREFIX = "ctp-planta-zonas:";

export const ForestPlantaZonaDB = {
  /** Todas las zonas del tenant, más nuevas primero por creación. */
  async list(tenantId: string): Promise<PlantaZona[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown[]>(`${KEY_PREFIX}${tenantId}`);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((z) => normalizeZona((z ?? {}) as Record<string, unknown>))
      .filter((z) => z.id && z.codigo)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /**
   * Crea o actualiza una zona (upsert por id). Sin id → crea con uno nuevo.
   * Valida que el polígono tenga ≥3 puntos si viene (el marcador simple no).
   */
  async save(tenantId: string, input: Partial<PlantaZona> & Record<string, unknown>, user = "unknown"): Promise<PlantaZona> {
    if (!tenantId) throw new Error("tenantId is required");
    const list = await this.list(tenantId);
    const isNew = !input.id || !list.some((z) => z.id === input.id);
    const existing = isNew ? undefined : list.find((z) => z.id === input.id);
    const zona = normalizeZona({
      ...existing,
      ...input,
      id: isNew ? randomUUID() : String(input.id),
      createdAt: existing?.createdAt,
    });
    if (!zona.codigo) throw new Error("El código de la zona es obligatorio.");
    const next = isNew ? [zona, ...list] : list.map((z) => (z.id === zona.id ? zona : z));
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, next, user);
    auditCtp({
      tenantId,
      action: "ctp_planta_zona_set",
      entity: "ForestPlantaZona",
      entityId: zona.id,
      detail: `${isNew ? "Creó" : "Actualizó"} la zona ${zona.codigo} (${zonaTipoMeta(zona.tipo).label})${zona.areaM2 != null ? ` · ${Math.round(zona.areaM2)} m²` : ""}`,
      user,
    });
    return zona;
  },

  /** Borra una zona por id. Devuelve true si existía. */
  async remove(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return false;
    const list = await this.list(tenantId);
    const zona = list.find((z) => z.id === id);
    if (!zona) return false;
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, list.filter((z) => z.id !== id), user);
    auditCtp({
      tenantId,
      action: "ctp_planta_zona_delete",
      entity: "ForestPlantaZona",
      entityId: id,
      detail: `Borró la zona ${zona.codigo} (${zonaTipoMeta(zona.tipo).label})`,
      user,
    });
    return true;
  },
};
