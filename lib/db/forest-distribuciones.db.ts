import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { construirRegistroDistribucion, type DistribucionRegistro } from "@/lib/forestal/distribucion-registro";

/**
 * ForestDistribucionesDB — distribuciones de rolliza guardadas del aserradero
 * (Brandon, 2026-09-01: "una función para guardar esa distribución de
 * bloques").
 *
 * POR QUÉ KV: mismo motivo que `ForestCubicacionesDB` — es el respaldo de un
 * trabajo de gabinete (qué bloques se cargaron y con qué datos), no un
 * movimiento del Libro de Operaciones. Se guarda como lista en un
 * `PlatformSetting` por tenant, sin fabricar una migración.
 *
 * `tenantId` 1er parámetro en toda operación; auditado vía `auditCtp`.
 */

const KEY_PREFIX = "ctp-distribuciones:";
/** Tope por tenant: el KV es un JSON; sin límite, se infla sin necesidad. */
const MAX_GUARDADAS = 300;

/** Lo guardado, sin filas rotas, la más reciente primero. */
function normalizar(raw: unknown): DistribucionRegistro[] {
  if (!Array.isArray(raw)) return [];
  return (raw as DistribucionRegistro[])
    .filter((d) => d && typeof d.id === "string" && Array.isArray(d.bloques))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export const ForestDistribucionesDB = {
  /** Todas las distribuciones del tenant, la más reciente primero. */
  async list(tenantId: string): Promise<DistribucionRegistro[]> {
    if (!tenantId) throw new Error("tenantId is required");
    return normalizar(await PlatformSettingsDB.get<unknown[]>(`${KEY_PREFIX}${tenantId}`));
  },

  /**
   * Crea o actualiza una distribución (upsert por id). Los totales NO se creen
   * del cliente: `construirRegistroDistribucion` los recalcula desde los bloques.
   *
   * Lee-modifica-escribe BAJO CANDADO (`PlatformSettingsDB.actualizar`,
   * ADR-445): antes eran `list` + `set` sueltos y dos guardados a la vez de
   * DISTINTAS distribuciones perdían uno — el segundo leía la lista vieja, a
   * veces del caché, y pisaba al primero. Ojo: dos pestañas con la MISMA
   * distribución siguen quedándose con el último guardado (se reemplaza el
   * registro entero; no hay versión que compare).
   */
  async save(
    tenantId: string,
    input: Parameters<typeof construirRegistroDistribucion>[0],
    user = "unknown",
  ): Promise<DistribucionRegistro> {
    if (!tenantId) throw new Error("tenantId is required");
    const { registro, existente } = await PlatformSettingsDB.actualizar<
      unknown,
      { registro: DistribucionRegistro; existente: DistribucionRegistro | undefined }
    >(
      `${KEY_PREFIX}${tenantId}`,
      (actual) => {
        const list = normalizar(actual);
        const existente = input.id ? list.find((d) => d.id === input.id) : undefined;
        const registro = construirRegistroDistribucion({
          ...input,
          createdAt: existente?.createdAt,
          createdBy: existente?.createdBy ?? user,
        });
        const next = existente
          ? list.map((d) => (d.id === registro.id ? registro : d))
          : [registro, ...list].slice(0, MAX_GUARDADAS);
        return { valor: next, resultado: { registro, existente } };
      },
      user,
    );
    auditCtp({
      tenantId,
      action: existente ? "ctp_distribucion_update" : "ctp_distribucion_create",
      entity: "ForestDistribucion",
      entityId: registro.id,
      /* Los dos volúmenes por separado: la rolliza que entró y la madera que
         ya vino aserrada no se suman, así que la auditoría tampoco las suma —
         un solo número escondería de qué está hecha la distribución. */
      detail: `${existente ? "Actualizó" : "Guardó"} la distribución "${registro.nombre}" · ${registro.totales.bloques} bloques · ${registro.totales.rollizaM3} m³ (R)${
        (registro.totales.aserradaDirectaM3 ?? 0) > 0 ? ` · ${registro.totales.aserradaDirectaM3} m³ (A) ya aserrados` : ""
      }`,
      user,
    });
    return registro;
  },

  /** Borra una distribución por id. Devuelve true si existía. */
  async remove(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return false;
    /* Mismo candado que `save`: un borrado no pisa un guardado simultáneo. */
    const registro = await PlatformSettingsDB.actualizar<unknown, DistribucionRegistro | null>(
      `${KEY_PREFIX}${tenantId}`,
      (actual) => {
        const list = normalizar(actual);
        const encontrado = list.find((d) => d.id === id);
        return encontrado ? { valor: list.filter((d) => d.id !== id), resultado: encontrado } : { resultado: null };
      },
      user,
    );
    if (!registro) return false;
    auditCtp({
      tenantId,
      action: "ctp_distribucion_delete",
      entity: "ForestDistribucion",
      entityId: id,
      detail: `Borró la distribución "${registro.nombre}" (${registro.totales.bloques} bloques)`,
      user,
    });
    return true;
  },
};
