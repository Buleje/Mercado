import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { PlatformSettingsDB, candadoDeClave } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  isDateClosed,
  closedPeriodOf,
  LibroCambioAlCerrarError,
  type CtpCierrePeriodo,
} from "@/lib/forestal/ctp-cierre-types";

/**
 * ForestCtpCierreDB — cierre de período fiscal del Libro de Operaciones CTP (ADR-139).
 *
 * POR QUÉ EXISTE:
 * un libro de operaciones que no se puede CERRAR no es un libro — es una query
 * viva sobre datos mutables, y eso es lo primero que un inspector OSINFOR
 * desconfía. Cerrar un mes lo vuelve un acta inmutable: congela costos, guarda la
 * existencia de cierre (que hereda el mes siguiente como apertura) y BLOQUEA toda
 * edición de las líneas fechadas en ese mes.
 *
 * DÓNDE VIVE (sin migración):
 * KV global `PlatformSetting`, key `ctp-cierre:{tenantId}` → array de períodos
 * cerrados (mismo patrón que `ForestCtpFichaDB`). La INMUTABILIDAD no la da el
 * storage sino los guards `isClosedOn` en las DB classes de escritura.
 *
 * ANTI-CICLO: esta clase expone solo `isClosedOn` (booleano) + persistencia. NO
 * importa `forest-ctp.db` ni la clase de error — así las DB classes de escritura
 * pueden importarla sin ciclo, y cada una tira su propio CtpInvariantError.
 * La ORQUESTACIÓN del cierre (calcular saldos + congelar corridas) vive en el
 * endpoint, que compone ForestCtpDB.saldos + ForestCtpConsumoDB.congelarCosto +
 * este `save`.
 */

const KEY_PREFIX = "ctp-cierre:";

/** El cliente con que se lee: el global o el de una transacción abierta. */
type Db = typeof prisma | Prisma.TransactionClient;

/** Un vaciado del libro tiene el candado hasta 30 s (`TX_OPTS` de
 *  `forest-ctp-purga.db.ts`): cerrar o reabrir lo espera en vez de vencer a los
 *  5 s por omisión de la transacción. Pasados 32 s, `ClaveOcupadaError` (la
 *  ruta responde 409), no el 500 del timeout de Prisma. */
const ESPERA_AL_VACIADO = { timeout: 35_000, esperaMaxMs: 32_000 } as const;

/**
 * La fila de la clave tiene que EXISTIR antes de que alguien la bloquee: con
 * la tabla sin fila (un negocio que nunca cerró un mes), el `FOR SHARE` del
 * vaciado no tenía qué bloquear y el primer cierre se le colaba. Sentencia
 * aparte y fuera de toda transacción: así queda confirmada antes de la foto
 * del vaciado. `'[]'` = ningún cierre, lo mismo que la fila ausente.
 */
async function asegurarFila(key: string): Promise<void> {
  await prisma.$executeRaw`INSERT INTO "PlatformSetting" (key, value, "updatedAt") VALUES (${key}, '[]'::jsonb, now()) ON CONFLICT (key) DO NOTHING`;
}

export const ForestCtpCierreDB = {
  /** Los períodos cerrados del tenant, más reciente primero. */
  async list(tenantId: string): Promise<CtpCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<CtpCierrePeriodo[]>(`${KEY_PREFIX}${tenantId}`);
    return Array.isArray(raw) ? raw : [];
  },

  /**
   * Igual que `list`, pero SIN caché y con el cliente que se pasa: para mirar
   * el cierre DENTRO de la transacción que va a escribir (el vaciado del libro).
   * `list` sale del caché de la instancia —en otra instancia, hasta 5 min
   * viejo— y fuera de la transacción: un mes recién cerrado no frenaba nada.
   */
  async listEn(tenantId: string, db: Db): Promise<CtpCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await db.platformSetting.findUnique({
      where: { key: `${KEY_PREFIX}${tenantId}` },
      select: { value: true },
    });
    const raw: unknown = row?.value;
    return Array.isArray(raw) ? (raw as CtpCierrePeriodo[]) : [];
  },

  /**
   * La lista para quien BORRA según los cierres (el vaciado del libro), como
   * PRIMERA sentencia de su transacción Serializable. Devuelve null si ahora
   * mismo se está cerrando o reabriendo un mes: el que llama no borra.
   *
   * Por qué así y no `pg_advisory_xact_lock` + `listEn` (2026-10-02): en
   * Serializable la foto de la transacción se toma al EMPEZAR su primera
   * sentencia —el propio `SELECT pg_advisory_xact_lock`—, así que esperar a
   * que un cierre suelte el candado y leer después daba la lista VIEJA. Por
   * eso: (1) candado compartido SIN esperar (`save`/`reabrir` toman el
   * exclusivo vía `PlatformSettingsDB.actualizar`; mientras el vaciado lo
   * tiene, el cierre espera) y (2) la fila con `FOR SHARE`: si un cierre la
   * cambió después de la foto, Postgres aborta con 40001 («el libro cambió»).
   */
  /** Antes de `listBajoCandado`, FUERA de la transacción (ver `asegurarFila`). */
  async asegurarFila(tenantId: string): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    await asegurarFila(`${KEY_PREFIX}${tenantId}`);
  },

  /**
   * Huella de lo que usa el acta de un cierre hasta `to`: cuántos ingresos,
   * trozas, líneas, consumos y orígenes de despacho hay, y la última edición de
   * los que la registran. Un vaciado (o cualquier carga) en el medio la cambia.
   * Los consumos van sin `updatedAt` a propósito: congelar costos —parte del
   * propio cierre— los toca.
   */
  async huellaDelLibroHasta(tenantId: string, to: Date, db: Db = prisma): Promise<string> {
    if (!tenantId) throw new Error("tenantId is required");
    const hasta = { lte: to };
    const [ingresos, trozas, lineas, consumos, origenes] = await Promise.all([
      db.woodEntry.aggregate({ where: { tenantId, entryDate: hasta }, _count: { _all: true }, _max: { updatedAt: true } }),
      db.woodEntryTroza.count({ where: { tenantId, entry: { entryDate: hasta } } }),
      db.forestCtpEntry.aggregate({ where: { tenantId, entryDate: hasta }, _count: { _all: true }, _max: { updatedAt: true } }),
      db.forestCtpConsumo.count({ where: { tenantId, ctpEntry: { entryDate: hasta } } }),
      db.forestCtpDespachoOrigen.aggregate({
        where: { tenantId, despacho: { entryDate: hasta } },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
    ]);
    const ultima = (d: Date | null | undefined) => d?.toISOString() ?? null;
    return JSON.stringify([
      ingresos._count._all,
      ultima(ingresos._max.updatedAt),
      trozas,
      lineas._count._all,
      ultima(lineas._max.updatedAt),
      consumos,
      origenes._count._all,
      ultima(origenes._max.updatedAt),
    ]);
  },

  async listBajoCandado(tenantId: string, tx: Prisma.TransactionClient): Promise<CtpCierrePeriodo[] | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const key = `${KEY_PREFIX}${tenantId}`;
    const [libre] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock_shared(hashtext(${candadoDeClave(key)})) AS ok`;
    if (!libre?.ok) return null;
    const [fila] = await tx.$queryRaw<{ value: unknown }[]>`SELECT value FROM "PlatformSetting" WHERE key = ${key} FOR SHARE`;
    return Array.isArray(fila?.value) ? (fila.value as CtpCierrePeriodo[]) : [];
  },

  /** ¿La fecha cae en un período cerrado y no reabierto? Guard de escritura. */
  async isClosedOn(tenantId: string, date: Date | null | undefined): Promise<boolean> {
    if (!tenantId || !date) return false;
    return isDateClosed(await this.list(tenantId), date);
  },

  /** El cierre activo que contiene la fecha (para el mensaje del error). */
  async closedPeriodOf(tenantId: string, date: Date | null | undefined): Promise<CtpCierrePeriodo | null> {
    if (!tenantId || !date) return null;
    return closedPeriodOf(await this.list(tenantId), date);
  },

  async findByKey(tenantId: string, periodKey: string): Promise<CtpCierrePeriodo | null> {
    return (await this.list(tenantId)).find((c) => c.periodKey === periodKey) ?? null;
  },

  /** Persiste un cierre (reemplaza el del mismo periodKey si se re-cierra).
   *  Bajo el candado exclusivo de la clave y leyendo la BASE, no el caché
   *  (ver `listBajoCandado`; antes, una lista de hasta 5 min podía pisar otro cierre).
   *  `huella` = la de `huellaDelLibroHasta` tomada ANTES de armar el acta: se
   *  recalcula bajo el candado y, si el libro cambió, `LibroCambioAlCerrarError`
   *  y no se graba nada. */
  async save(
    tenantId: string,
    cierre: CtpCierrePeriodo,
    user: string,
    opciones?: { huella?: string },
  ): Promise<CtpCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const key = `${KEY_PREFIX}${tenantId}`;
    await asegurarFila(key);
    const next = await PlatformSettingsDB.actualizar<CtpCierrePeriodo[], CtpCierrePeriodo[]>(
      key,
      async (actual, tx) => {
        if (opciones?.huella != null && (await this.huellaDelLibroHasta(tenantId, new Date(cierre.to), tx)) !== opciones.huella) {
          throw new LibroCambioAlCerrarError();
        }
        const list = Array.isArray(actual) ? actual : [];
        const n = [cierre, ...list.filter((c) => c.periodKey !== cierre.periodKey)].sort((a, b) =>
          b.periodKey.localeCompare(a.periodKey),
        );
        return { valor: n, resultado: n };
      },
      user,
      ESPERA_AL_VACIADO,
    );
    auditCtp({
      tenantId,
      action: "ctp_periodo_cerrar",
      entity: "ForestCtpCierre",
      entityId: cierre.periodKey,
      detail: `Cerró el período ${cierre.label}: ${cierre.totales.corridasCongeladas} corridas con costo congelado${cierre.totales.corridasSinCostear ? `, ${cierre.totales.corridasSinCostear} sin costear` : ""}, existencia de cierre snapshoteada. El período queda BLOQUEADO.`,
      user,
    });
    return next;
  },

  /**
   * Reabre un período: no borra el cierre (queda en el historial, auditable),
   * solo lo marca `reabierto` para que deje de bloquear. Los costos ya
   * congelados SIGUEN congelados (congelar es irreversible) — reabrir habilita
   * ediciones, no descongela.
   */
  async reabrir(tenantId: string, periodKey: string, motivo: string, user: string): Promise<CtpCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!motivo?.trim()) throw new Error("motivo is required");
    await asegurarFila(`${KEY_PREFIX}${tenantId}`);
    const { next, target } = await PlatformSettingsDB.actualizar<
      CtpCierrePeriodo[],
      { next: CtpCierrePeriodo[]; target: CtpCierrePeriodo }
    >(
      `${KEY_PREFIX}${tenantId}`,
      (actual) => {
        const list = Array.isArray(actual) ? actual : [];
        const t = list.find((c) => c.periodKey === periodKey);
        if (!t) throw new Error("Período no encontrado");
        if (t.reabierto) throw new Error("El período ya está reabierto");
        const n = list.map((c) =>
          c.periodKey === periodKey ? { ...c, reabierto: { at: new Date().toISOString(), by: user, motivo: motivo.trim() } } : c,
        );
        return { valor: n, resultado: { next: n, target: t } };
      },
      user,
      ESPERA_AL_VACIADO,
    );
    auditCtp({
      tenantId,
      action: "ctp_periodo_reabrir",
      entity: "ForestCtpCierre",
      entityId: periodKey,
      detail: `Reabrió el período ${target.label} · motivo: ${motivo.trim()}. Los costos ya congelados quedan congelados; el período vuelve a admitir ediciones.`,
      user,
    });
    return next;
  },
};
