import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ClaveOcupadaError, PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  construirEmision, claveEmision, etiquetaEmision, filaNoCuadra, recortarBandeja, traseraQueSigue, vinculosDe,
  type AnexoEmitido, type EntradaEmision,
} from "@/lib/forestal/anexo04-registro";
import { CtpInvariantError } from "./forest-ctp-consumo.db";

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
 *
 * Lectura FRESCA y escritura con bloqueo (ADR-446, lección de ADR-445): el
 * registro ahora también dice qué despachos lo registraron. Leído de la caché
 * por instancia, un guardado podía reescribir la lista de hace 5 minutos y
 * borrar ese vínculo; dos guardados a la vez perdían uno.
 */

const KEY_PREFIX = "ctp-anexos:";
/** Tope por tenant: el KV es un JSON y cada emisión guarda sus medidas. */
const MAX_EMITIDOS = 200;

/** La clave KV de la bandeja de un tenant (la usa también el registro de guías desde el anexo). */
export const claveAnexos = (tenantId: string): string => `${KEY_PREFIX}${tenantId}`;

/**
 * Cuánto espera un guardado o un borrado a que se libere la bandeja. Mientras
 * se registra una guía desde su anexo la bandeja está tomada hasta un minuto
 * (contra la base desde el panel local): sin tope, el guardado moría a los 5 s
 * de Prisma con un 500 sin explicación.
 */
const ESPERA_BANDEJA_MS = 3_000;

const MENSAJE_OCUPADA =
  "Se está registrando una guía desde un Anexo 04 en este momento: intenta de nuevo en unos segundos.";

/** Cuántas líneas de Despacho vivas registraron este anexo (ADR-446). */
async function despachosVivos(tx: Prisma.TransactionClient, tenantId: string, a: AnexoEmitido | null | undefined) {
  const ids = a?.despachoIds ?? [];
  if (ids.length === 0) return 0;
  return tx.forestCtpEntry.count({
    where: { tenantId, id: { in: ids }, section: "despacho", deletedAt: null, status: "registrado" },
  });
}

/** El guardado/borrado espera la bandeja con tope y lo que no alcanza es un 409 con nombre. */
async function conBandeja<R>(fn: () => Promise<R>): Promise<R> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ClaveOcupadaError) throw new CtpInvariantError(MENSAJE_OCUPADA, "TANDA_EN_CURSO");
    throw err;
  }
}

/** La lista cruda del KV, limpia y ordenada (el más reciente primero). */
export function normalizarAnexos(raw: unknown): AnexoEmitido[] {
  if (!Array.isArray(raw)) return [];
  return (raw as AnexoEmitido[])
    .filter((a) => a && typeof a.id === "string" && Array.isArray(a.piezas))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export const ForestAnexosDB = {
  /** Anexos emitidos del tenant, el más reciente primero. Leído de la base, sin caché. */
  async list(tenantId: string): Promise<AnexoEmitido[]> {
    if (!tenantId) throw new Error("tenantId is required");
    return normalizarAnexos(await PlatformSettingsDB.getFresco<unknown[]>(claveAnexos(tenantId)));
  },

  /**
   * Registra (o actualiza) una emisión. Los totales y las hojas NO se creen del
   * cliente: `construirEmision` los recalcula desde las piezas. Los vínculos con
   * el libro (despachos, reemplazado) se conservan: no son del papel.
   */
  async save(tenantId: string, input: EntradaEmision, user = "unknown"): Promise<AnexoEmitido> {
    if (!tenantId) throw new Error("tenantId is required");
    /* El m³ de cada fila sale de sus medidas: el libro lo registra tal cual al
       pasar la guía a Despacho (ADR-446), así que uno que no cuadra no entra. */
    const malas = input.piezas
      .map((p, i) => ({ i, err: filaNoCuadra(p) }))
      .filter((x) => x.err != null);
    if (malas.length > 0) {
      const [primera] = malas;
      throw new CtpInvariantError(
        `La fila ${primera.i + 1} del anexo dice ${primera.err!.declaradoM3} m³ y sus medidas dan ${primera.err!.calculadoM3}: vuelve a cubicarla.`,
        "VALIDACION",
        { filas: malas.map((x) => x.i + 1) },
      );
    }
    const { registro, existia } = await conBandeja(() => PlatformSettingsDB.actualizar<unknown, { registro: AnexoEmitido; existia: boolean }>(
      claveAnexos(tenantId),
      async (actual, tx) => {
        const list = normalizarAnexos(actual);
        const clave = claveEmision(input.datos.numero ?? "", input.datos.gtf ?? "");
        const existente = input.id
          ? list.find((a) => a.id === input.id)
          : list.find((a) => claveEmision(a.numero, a.gtf) === clave && clave !== "||");
        /* Un anexo cuya salida ya está en el libro no se corrige por acá: sus
           líneas de Despacho dicen lo que decía el papel al registrarlo. */
        const vivos = await despachosVivos(tx, tenantId, existente);
        if (existente && vivos > 0) {
          throw new CtpInvariantError(
            `El ${etiquetaEmision(existente)} ya está registrado en el libro (${vivos} línea(s) de Despacho): no se edita. Si esa salida está mal, anula esas líneas primero.`,
            "ANEXO_REGISTRADO",
            { anexoId: existente.id, despachos: vivos },
          );
        }
        const registro: AnexoEmitido = {
          ...construirEmision({
            ...input,
            /* El croquis de la trasera: el que viene, o el que ya tenía si
               las piezas no cambiaron (ver `traseraQueSigue`). */
            trasera: traseraQueSigue(existente, input),
            id: existente?.id ?? input.id,
            createdAt: existente?.createdAt,
            createdBy: existente?.createdBy ?? user,
          }),
          ...vinculosDe(existente),
        };
        /* El tope nunca expulsa un anexo que respalda despachos (ADR-446). */
        const next = existente
          ? list.map((a) => (a.id === registro.id ? registro : a))
          : recortarBandeja([registro, ...list], MAX_EMITIDOS, registro.id);
        return { valor: next, resultado: { registro, existia: Boolean(existente) } };
      },
      user,
      { esperaMaxMs: ESPERA_BANDEJA_MS },
    ));
    auditCtp({
      tenantId,
      action: existia ? "ctp_anexo04_update" : "ctp_anexo04_emit",
      entity: "ForestAnexo04",
      entityId: registro.id,
      detail: `${existia ? "Actualizó" : "Emitió"} el ${etiquetaEmision(registro)} · ${registro.hojas} hoja(s) · ${registro.totalPiezas} piezas · ${registro.totalM3} m³`,
      user,
    });
    return registro;
  },

  /**
   * Borra una emisión por id. Devuelve true si existía.
   *
   * Un anexo cuya salida ya está en el libro (despachos vigentes) no se borra:
   * es el papel que respalda esas líneas ante una fiscalización. Si los
   * despachos se anularon, se puede.
   */
  async remove(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return false;
    const registro = await conBandeja(() => PlatformSettingsDB.actualizar<unknown, AnexoEmitido | null>(
      claveAnexos(tenantId),
      async (actual, tx) => {
        const list = normalizarAnexos(actual);
        const registro = list.find((a) => a.id === id) ?? null;
        if (!registro) return { resultado: null };
        const vigentes = await despachosVivos(tx, tenantId, registro);
        if (vigentes > 0) {
          throw new CtpInvariantError(
            `El ${etiquetaEmision(registro)} respalda ${vigentes} línea(s) de Despacho del libro: no se borra. Si esa salida está mal, anula esas líneas primero.`,
            "ANEXO_REGISTRADO",
            { anexoId: id, despachos: vigentes },
          );
        }
        return { valor: list.filter((a) => a.id !== id), resultado: registro };
      },
      user,
      { esperaMaxMs: ESPERA_BANDEJA_MS },
    ));
    if (!registro) return false;
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
