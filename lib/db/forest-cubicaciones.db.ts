import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { construirRegistro, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";

/**
 * ForestCubicacionesDB — cubicaciones guardadas del aserradero.
 *
 * POR QUÉ KV: una cubicación es la MEDICIÓN de un lote (el papel que se firma
 * con el cliente), no un movimiento del Libro de Operaciones — al Libro entra
 * después, como producción, con su propio registro. Se guarda como lista en un
 * `PlatformSetting` por tenant, igual que las zonas de planta y la cartografía
 * EUDR: sin fabricar una migración (que necesita DIRECT_URL).
 *
 * `tenantId` 1er parámetro en toda operación; auditado vía `auditCtp`.
 */

const KEY_PREFIX = "ctp-cubicaciones:";
/** Tope por tenant: el KV es un JSON; sin límite, un dictado diario lo infla. */
const MAX_GUARDADAS = 300;

export const ForestCubicacionesDB = {
  /** Todas las cubicaciones del tenant, la más reciente primero. */
  async list(tenantId: string): Promise<CubicacionRegistro[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown[]>(`${KEY_PREFIX}${tenantId}`);
    if (!Array.isArray(raw)) return [];
    return (raw as CubicacionRegistro[])
      .filter((c) => c && typeof c.id === "string" && Array.isArray(c.piezas))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  },

  /**
   * Crea o actualiza una cubicación (upsert por id). Los totales NO se creen
   * del cliente: `construirRegistro` los recalcula desde las piezas.
   */
  async save(
    tenantId: string,
    input: Parameters<typeof construirRegistro>[0],
    user = "unknown",
  ): Promise<CubicacionRegistro> {
    if (!tenantId) throw new Error("tenantId is required");
    const list = await this.list(tenantId);
    const existente = input.id ? list.find((c) => c.id === input.id) : undefined;
    const registro = construirRegistro({
      ...input,
      createdAt: existente?.createdAt,
      createdBy: existente?.createdBy ?? user,
    });
    const next = existente
      ? list.map((c) => (c.id === registro.id ? registro : c))
      : [registro, ...list].slice(0, MAX_GUARDADAS);
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, next, user);
    auditCtp({
      tenantId,
      action: existente ? "ctp_cubicacion_update" : "ctp_cubicacion_create",
      entity: "ForestCubicacion",
      entityId: registro.id,
      detail: `${existente ? "Actualizó" : "Guardó"} la cubicación "${registro.nombre}" · ${registro.totales.piezas} piezas · ${registro.totales.pieTablar} PT`,
      user,
    });
    return registro;
  },

  /** Borra una cubicación por id. Devuelve true si existía. */
  async remove(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return false;
    const list = await this.list(tenantId);
    const registro = list.find((c) => c.id === id);
    if (!registro) return false;
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, list.filter((c) => c.id !== id), user);
    auditCtp({
      tenantId,
      action: "ctp_cubicacion_delete",
      entity: "ForestCubicacion",
      entityId: id,
      detail: `Borró la cubicación "${registro.nombre}" (${registro.totales.pieTablar} PT)`,
      user,
    });
    return true;
  },
};
