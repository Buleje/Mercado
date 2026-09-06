import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  construirEmision, claveEmision, etiquetaEmision,
  type AnexoEmitido, type EntradaEmision,
} from "@/lib/forestal/anexo04-registro";

/**
 * ForestAnexosDB — bandeja de ANEXOS N° 04 emitidos (lista de productos
 * transformados de la GTF).
 *
 * POR QUÉ KV: el anexo es el papel que se entregó, no un movimiento del Libro
 * (eso ya vive en `ForestCtpEntry`). Se guarda como lista en un `PlatformSetting`
 * por tenant, igual que las cubicaciones y la cartografía EUDR — sin fabricar
 * una migración (que necesita DIRECT_URL).
 *
 * Upsert por **N° + GTF**: volver a bajar el mismo anexo corrige el registro en
 * vez de duplicarlo. `tenantId` 1er parámetro; auditado vía `auditCtp`.
 */

const KEY_PREFIX = "ctp-anexos:";
/** Tope por tenant: el KV es un JSON y cada emisión guarda sus medidas. */
const MAX_EMITIDOS = 200;

export const ForestAnexosDB = {
  /** Anexos emitidos del tenant, el más reciente primero. */
  async list(tenantId: string): Promise<AnexoEmitido[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown[]>(`${KEY_PREFIX}${tenantId}`);
    if (!Array.isArray(raw)) return [];
    return (raw as AnexoEmitido[])
      .filter((a) => a && typeof a.id === "string" && Array.isArray(a.piezas))
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  },

  /**
   * Registra (o actualiza) una emisión. Los totales y las hojas NO se creen del
   * cliente: `construirEmision` los recalcula desde las piezas.
   */
  async save(tenantId: string, input: EntradaEmision, user = "unknown"): Promise<AnexoEmitido> {
    if (!tenantId) throw new Error("tenantId is required");
    const list = await this.list(tenantId);
    const clave = claveEmision(input.datos.numero ?? "", input.datos.gtf ?? "");
    const existente = input.id
      ? list.find((a) => a.id === input.id)
      : list.find((a) => claveEmision(a.numero, a.gtf) === clave && clave !== "||");
    const registro = construirEmision({
      ...input,
      id: existente?.id ?? input.id,
      createdAt: existente?.createdAt,
      createdBy: existente?.createdBy ?? user,
    });
    const next = existente
      ? list.map((a) => (a.id === registro.id ? registro : a))
      : [registro, ...list].slice(0, MAX_EMITIDOS);
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, next, user);
    auditCtp({
      tenantId,
      action: existente ? "ctp_anexo04_update" : "ctp_anexo04_emit",
      entity: "ForestAnexo04",
      entityId: registro.id,
      detail: `${existente ? "Actualizó" : "Emitió"} el ${etiquetaEmision(registro)} · ${registro.hojas} hoja(s) · ${registro.totalPiezas} piezas · ${registro.totalM3} m³`,
      user,
    });
    return registro;
  },

  /** Borra una emisión por id. Devuelve true si existía. */
  async remove(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return false;
    const list = await this.list(tenantId);
    const registro = list.find((a) => a.id === id);
    if (!registro) return false;
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, list.filter((a) => a.id !== id), user);
    auditCtp({
      tenantId,
      action: "ctp_anexo04_delete",
      entity: "ForestAnexo04",
      entityId: id,
      detail: `Borró del historial el ${etiquetaEmision(registro)}`,
      user,
    });
    return true;
  },
};
