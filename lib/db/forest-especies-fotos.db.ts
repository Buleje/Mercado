import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  MAX_FOTOS_ESPECIE,
  claveEspecie,
  construirFoto,
  type FotoEspecie,
  type FotoEspecieInput,
} from "@/lib/forestal/especies-fotos";

/**
 * ForestEspeciesFotosDB — la biblioteca de fotos de referencia de las especies.
 *
 * POR QUÉ KV (mismo criterio que trámites, ADR-308 §4): son decenas de especies
 * por CTP, no miles, y cada entrada guarda una URL — no la imagen. Promoverlo a
 * modelo Prisma el día que haga falta (varias fotos por especie, aprobación) es
 * leer el KV e insertar filas, sin fabricar una migración que necesita
 * DIRECT_URL.
 *
 * Los writes se auditan: una foto pegada al lado de un nombre científico en el
 * libro es un dato que alguien puso, y tiene que poder saberse quién.
 */

const KEY_PREFIX = "ctp-especies-fotos:";

export const ForestEspeciesFotosDB = {
  /** Todas las fotos del tenant, alfabéticas. */
  async list(tenantId: string): Promise<FotoEspecie[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown[]>(`${KEY_PREFIX}${tenantId}`);
    if (!Array.isArray(raw)) return [];
    return (raw as FotoEspecie[])
      .filter((f) => f && typeof f.clave === "string" && typeof f.url === "string")
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  },

  /**
   * Alta o reemplazo de la foto de una especie (upsert por clave normalizada).
   * `null` = la entrada no tenía nombre o la URL no era del storage propio.
   */
  async save(tenantId: string, input: FotoEspecieInput, user = "unknown"): Promise<FotoEspecie | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const foto = construirFoto(input, user, new Date().toISOString());
    if (!foto) return null;

    const list = await this.list(tenantId);
    const previa = list.find((f) => f.clave === foto.clave);
    const next = previa
      ? list.map((f) => (f.clave === foto.clave ? foto : f))
      : [foto, ...list].slice(0, MAX_FOTOS_ESPECIE);
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, next, user);

    auditCtp({
      tenantId,
      action: "ctp_especie_foto",
      entity: "ForestEspecieFoto",
      entityId: foto.clave,
      detail: `${previa ? "Reemplazó" : "Cargó"} la foto de referencia de ${foto.nombre}${foto.cientifico ? ` (${foto.cientifico})` : ""}`,
      user,
    });
    return foto;
  },

  /** Saca la foto de una especie. Devuelve si había algo que sacar. */
  async remove(tenantId: string, nombre: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const clave = claveEspecie(nombre);
    if (!clave) return false;
    const list = await this.list(tenantId);
    const previa = list.find((f) => f.clave === clave);
    if (!previa) return false;
    await PlatformSettingsDB.set(
      `${KEY_PREFIX}${tenantId}`,
      list.filter((f) => f.clave !== clave),
      user,
    );
    auditCtp({
      tenantId,
      action: "ctp_especie_foto",
      entity: "ForestEspecieFoto",
      entityId: clave,
      detail: `Quitó la foto de referencia de ${previa.nombre}`,
      user,
    });
    return true;
  },
};
