import "server-only";
import { prisma } from "@/lib/prisma";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  construirTramite,
  leerPisos,
  pisosTrasRegistro,
  type TramiteInput,
  type TramiteRegistro,
} from "@/lib/forestal/tramites-registro";

/**
 * ForestTramitesDB — los trámites y oficios que el CTP presenta a la autoridad.
 *
 * POR QUÉ KV (ADR-308 §4): son decenas por año, no miles; el contrato de datos
 * está escrito en `tramites-registro.ts`, así que promoverlo a modelo Prisma
 * cuando haga falta (buscar en el cuerpo, adjuntar archivos) es leer el KV e
 * insertar filas. Mismo patrón que las cubicaciones guardadas y las zonas de
 * planta: sin fabricar una migración que necesita DIRECT_URL.
 *
 * `tenantId` 1er parámetro; todo write auditado vía `auditCtp` — lo que se
 * presenta ante SERFOR/ARFFS es parte del expediente, no metadata.
 *
 * TODA escritura pasa por `PlatformSettingsDB.actualizar` (candado por clave,
 * lectura de la BASE): con `get` + `set` sueltos, dos impresiones a la vez
 * leían la misma lista, sacaban el mismo «REL-2026-0001» y la segunda pisaba
 * a la primera (y `get` además lee de un caché de hasta 5 min).
 */

const KEY_PREFIX = "ctp-tramites:";
/**
 * El piso de los correlativos (`PisosCorrelativo`): lo más alto que ya salió,
 * para que borrar una carta no devuelva su código. `interno:` = clave de
 * trabajo, no viaja en `getAll()`; se lee y escribe sólo dentro del candado de
 * la lista (nunca por `get`, así que no tiene caché que invalidar).
 */
const KEY_PISOS_PREFIX = "interno:ctp-tramites-correlativos:";
/** Tope por tenant: el KV es un JSON y cada trámite lleva su formulario dentro. */
const MAX_TRAMITES = 400;

/** La lista guardada, sin basura y el último tocado primero. */
function normalizar(raw: unknown): TramiteRegistro[] {
  if (!Array.isArray(raw)) return [];
  return (raw as TramiteRegistro[])
    .filter((t) => t && typeof t.id === "string" && typeof t.formatoId === "string")
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export const ForestTramitesDB = {
  /** Todos los trámites del tenant, el último tocado primero. */
  async list(tenantId: string): Promise<TramiteRegistro[]> {
    if (!tenantId) throw new Error("tenantId is required");
    return normalizar(await PlatformSettingsDB.get<unknown[]>(`${KEY_PREFIX}${tenantId}`));
  },

  async getById(tenantId: string, id: string): Promise<TramiteRegistro | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const list = await this.list(tenantId);
    return list.find((t) => t.id === id) ?? null;
  },

  /**
   * Crea o actualiza (upsert por id). El estado y las fechas los normaliza
   * `construirTramite`: el cliente no puede declarar "presentado" sin fecha ni
   * inventar un estado que no existe.
   */
  async save(tenantId: string, input: TramiteInput, user = "unknown"): Promise<TramiteRegistro> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.formatoId?.trim()) throw new Error("formatoId is required");

    const { registro, existente } = await PlatformSettingsDB.actualizar<
      unknown,
      { registro: TramiteRegistro; existente: TramiteRegistro | undefined }
    >(
      `${KEY_PREFIX}${tenantId}`,
      async (raw, tx) => {
        const list = normalizar(raw);
        const existente = input.id ? list.find((t) => t.id === input.id) : undefined;
        const clavePisos = `${KEY_PISOS_PREFIX}${tenantId}`;
        const filaPisos = await tx.platformSetting.findUnique({
          where: { key: clavePisos },
          select: { value: true },
        });
        const pisos = leerPisos(filaPisos?.value);
        const registro = construirTramite(
          {
            ...input,
            createdAt: existente?.createdAt,
            createdBy: existente?.createdBy ?? user,
            // Mismo criterio que numeroDocumento: se preserva del registro
            // existente para que `construirTramite` no saque uno nuevo en cada
            // edición.
            codigoInterno: existente?.codigoInterno,
            // El cliente nunca manda numeroDocumento — se preserva del registro
            // existente (si ya tenía uno asignado) para que `construirTramite`
            // sepa que NO tiene que sacar un correlativo nuevo.
            numeroDocumento: existente?.numeroDocumento,
            // Ídem para el sello del aviso automático: sólo `construirTramite`
            // decide si sigue valiendo (comparando contra la fechaLimite previa).
            avisoVencimientoEnviadoEn: existente?.avisoVencimientoEnviadoEn,
            fechaLimiteAnterior: existente?.fechaLimite,
            avisoSinRespuestaEnviadoEn: existente?.avisoSinRespuestaEnviadoEn,
            fechaPresentacionAnterior: existente?.fechaPresentacion,
            // La carta impresa (ADR-487): el sello sólo lo pone el servidor, con
            // el usuario de la sesión; el del registro existente se conserva.
            emision: existente?.emision ?? null,
            emitidaPor: user,
          },
          list,
          pisos,
        );

        const pisosNuevos = pisosTrasRegistro(pisos, registro);
        if (pisosNuevos) {
          await tx.platformSetting.upsert({
            where: { key: clavePisos },
            create: { key: clavePisos, value: pisosNuevos, updatedBy: user },
            update: { value: pisosNuevos, updatedBy: user },
          });
        }
        const valor = existente
          ? list.map((t) => (t.id === registro.id ? registro : t))
          : [registro, ...list].slice(0, MAX_TRAMITES);
        return { valor, resultado: { registro, existente } };
      },
      user,
    );

    // El detalle narra el hecho administrativo: qué se presentó, ante quién y
    // en qué estado quedó — es lo que se le muestra a un fiscalizador.
    const recienImpresa = registro.emision && !existente?.emision;
    auditCtp({
      tenantId,
      action: existente ? "ctp_tramite_update" : "ctp_tramite_create",
      entity: "ForestTramite",
      entityId: registro.id,
      detail:
        `${existente ? "Actualizó" : "Registró"} el trámite "${registro.formatoNombre}" · ${registro.autoridad.toUpperCase()} · ${registro.estado}` +
        (registro.expedienteAutoridad ? ` · expediente ${registro.expedienteAutoridad}` : "") +
        (registro.fechaPresentacion ? ` · presentado ${registro.fechaPresentacion}` : "") +
        (recienImpresa
          ? ` · imprimió la carta ${registro.codigoInterno} con ${registro.emision!.guias.length} guía(s)`
          : ""),
      user,
    });
    return registro;
  },

  /** Borra un trámite por id. Devuelve true si existía. */
  async remove(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return false;
    const registro = await PlatformSettingsDB.actualizar<unknown, TramiteRegistro | null>(
      `${KEY_PREFIX}${tenantId}`,
      (raw) => {
        const list = normalizar(raw);
        const r = list.find((t) => t.id === id) ?? null;
        return r ? { valor: list.filter((t) => t.id !== id), resultado: r } : { resultado: null };
      },
      user,
    );
    if (!registro) return false;
    auditCtp({
      tenantId,
      action: "ctp_tramite_delete",
      entity: "ForestTramite",
      entityId: id,
      detail: `Borró el trámite "${registro.formatoNombre}" (${registro.estado})`,
      user,
    });
    return true;
  },

  /**
   * Sella el aviso automático de vencimiento (cron `tramites-vencimiento`)
   * para que no se repita mañana. No es un acto administrativo del usuario
   * — es bookkeeping del sistema — así que no pasa por `auditCtp`.
   */
  async marcarAvisoVencimientoEnviado(
    tenantId: string,
    ids: string[],
    ahora: string = new Date().toISOString(),
  ): Promise<void> {
    if (!tenantId || ids.length === 0) return;
    const idSet = new Set(ids);
    await PlatformSettingsDB.actualizar<unknown, null>(
      `${KEY_PREFIX}${tenantId}`,
      (raw) => ({
        valor: normalizar(raw).map((t) =>
          idSet.has(t.id) ? { ...t, avisoVencimientoEnviadoEn: ahora } : t,
        ),
        resultado: null,
      }),
      "cron",
    );
  },

  /**
   * Sella el aviso automático de "N días sin respuesta" (cron
   * `tramites-sin-respuesta`) — mismo criterio que `marcarAvisoVencimientoEnviado`,
   * es bookkeeping del sistema, no pasa por `auditCtp`.
   */
  async marcarAvisoSinRespuestaEnviado(
    tenantId: string,
    ids: string[],
    ahora: string = new Date().toISOString(),
  ): Promise<void> {
    if (!tenantId || ids.length === 0) return;
    const idSet = new Set(ids);
    await PlatformSettingsDB.actualizar<unknown, null>(
      `${KEY_PREFIX}${tenantId}`,
      (raw) => ({
        valor: normalizar(raw).map((t) =>
          idSet.has(t.id) ? { ...t, avisoSinRespuestaEnviadoEn: ahora } : t,
        ),
        resultado: null,
      }),
      "cron",
    );
  },

  /**
   * Todos los tenants con algo en el expediente, para el cron de avisos
   * (no hay tabla Prisma que listar `DISTINCT tenantId`: el KV vive en
   * `PlatformSetting`, así que se lee por prefijo de clave).
   */
  async listAllTenants(): Promise<{ tenantId: string; tramites: TramiteRegistro[] }[]> {
    const rows = await prisma.platformSetting.findMany({
      where: { key: { startsWith: KEY_PREFIX } },
      select: { key: true, value: true },
    });
    return rows.map((r) => {
      const tenantId = r.key.slice(KEY_PREFIX.length);
      const raw = Array.isArray(r.value) ? (r.value as unknown[]) : [];
      const tramites = raw.filter(
        (t): t is TramiteRegistro =>
          !!t &&
          typeof t === "object" &&
          typeof (t as TramiteRegistro).id === "string" &&
          typeof (t as TramiteRegistro).formatoId === "string",
      );
      return { tenantId, tramites };
    });
  },
};
