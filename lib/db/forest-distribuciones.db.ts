import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { construirRegistroDistribucion, type DistribucionRegistro } from "@/lib/forestal/distribucion-registro";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { tomadosPorOtros } from "@/lib/forestal/recorrido-estado";
import { prisma } from "@/lib/prisma";

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
/**
 * Cuánto espera el guardado del cubicador la clave (2.ª revisión de ADR-519):
 * una jornada del Recorrido la tiene tomada mientras escribe el Libro. Pasado
 * esto, `ClaveOcupadaError` (la ruta responde 409 «prueba de nuevo») en vez
 * del 500 del timeout de Prisma, que por defecto es 5 s.
 */
export const ESPERA_GUARDAR_MS = 8_000;
/** Tope por tenant: el KV es un JSON; sin límite, se infla sin necesidad. */
const MAX_GUARDADAS = 300;

type BloqueEntrante = Parameters<typeof construirRegistroDistribucion>[0]["bloques"][number];

/**
 * Lo que el SERVIDOR anotó en un bloque no lo borra un guardado viejo
 * (2.ª revisión de ADR-519): una pestaña del cubicador abierta desde antes
 * de una jornada manda el bloque sin `loteId` ni la jornada nueva, y el
 * guardado entero la borraba. Se conserva:
 *  · `loteId` guardado si el entrante no trae ninguno (uno distinto, manda el
 *    entrante: es un cambio a propósito; uno anulado lo marca el GET);
 *  · `jornadasLibro` unidas por día: entre dos del mismo día gana la de N°
 *    más alto, que es la que se escribió después en el Libro;
 *  · `corridaIds` unidos.
 */
export function conservarAnotaciones<B extends BloqueEntrante>(guardado: BloqueRolliza | undefined, entrante: B): B {
  if (!guardado) return entrante;
  const porDia = new Map<number, NonNullable<BloqueRolliza["jornadasLibro"]>[number]>();
  for (const j of [...(guardado.jornadasLibro ?? []), ...(entrante.jornadasLibro ?? [])]) {
    const previa = porDia.get(j.dia);
    if (!previa || j.lineNo > previa.lineNo) porDia.set(j.dia, j);
  }
  const jornadas = [...porDia.values()].sort((a, b) => a.dia - b.dia);
  const corridas = [...new Set([...(guardado.corridaIds ?? []), ...(entrante.corridaIds ?? [])])];
  return {
    ...entrante,
    loteId: entrante.loteId || guardado.loteId || undefined,
    ...(jornadas.length > 0 ? { jornadasLibro: jornadas } : {}),
    ...(corridas.length > 0 ? { corridaIds: corridas } : {}),
  };
}

/**
 * Una distribución NUEVA trae en un bloque el lote o una corrida que ya anotó
 * un bloque de OTRA distribución guardada (copia, «Guardar como», una pestaña
 * vieja). Guardarla sería la misma producción amparada dos veces en el
 * Anexo 04: la ruta responde 409 y pide abrir la original desde Guardadas.
 */
export class DistribucionYaTomadaError extends Error {
  constructor(message: string, readonly detalle: { bloque: string; loteId?: string; corridaId?: string }) {
    super(message);
    this.name = "DistribucionYaTomadaError";
  }
}

/**
 * El primer lote o corrida de `bloques` que ya es de otro bloque guardado, como error; o `null`.
 *
 * `lotesVivos`: los lotes de aserrío que siguen vivos (sin `deletedAt`). Un
 * lote ya eliminado no ampara nada en el Anexo 04, así que el bloque viejo
 * que lo anotó no es dueño de nada y la nueva distribución puede guardarse
 * (decisión de la revisión del 27-10). Sin el conjunto se bloquea igual: sin
 * saber, lo seguro es no amparar dos veces.
 */
export function choqueConOtraDistribucion(
  guardadas: readonly DistribucionRegistro[],
  nuevaId: string,
  bloques: readonly BloqueRolliza[],
  lotesVivos?: ReadonlySet<string>,
): DistribucionYaTomadaError | null {
  /* Sólo OTRAS distribuciones: lo que la misma ya anotó es suyo (re-guardarla
     no choca consigo misma). Bloque "" = no se excluye ninguno más. */
  const tomados = tomadosPorOtros(guardadas.filter((d) => d.id !== nuevaId), nuevaId, "");
  for (const b of bloques) {
    const etiqueta = b.etiqueta || "sin etiqueta";
    const deOtro = b.loteId ? tomados.lotes.get(b.loteId) : undefined;
    if (b.loteId && deOtro && (!lotesVivos || lotesVivos.has(b.loteId))) {
      return new DistribucionYaTomadaError(`Este lote ya es del ${deOtro}: ábrela desde Guardadas.`, { bloque: etiqueta, loteId: b.loteId });
    }
    const jornadas = (b.jornadasLibro ?? []).map((j) => ({ id: j.corridaId, lineNo: j.lineNo as number | undefined }));
    const otras = [...(b.corridaIds ?? []), ...(b.complementos ?? []).map((c) => c.corridaId)].map((id) => ({ id, lineNo: undefined }));
    for (const c of [...jornadas, ...otras]) {
      const quien = c.id ? tomados.corridas.get(c.id) : undefined;
      if (quien) {
        const corrida = c.lineNo != null ? `La corrida N° ${c.lineNo}` : "Una corrida";
        return new DistribucionYaTomadaError(`${corrida} del bloque ${etiqueta} ya es del ${quien}: ábrela desde Guardadas.`, {
          bloque: etiqueta,
          corridaId: c.id ?? undefined,
        });
      }
    }
  }
  return null;
}

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
   * registro entero; no hay versión que compare), salvo lo que anotó el
   * servidor (`conservarAnotaciones`).
   */
  async save(
    tenantId: string,
    input: Parameters<typeof construirRegistroDistribucion>[0],
    user = "unknown",
  ): Promise<DistribucionRegistro> {
    if (!tenantId) throw new Error("tenantId is required");
    /* Fuera del candado (una consulta, sólo si algún bloque trae lote): qué
       lotes siguen vivos, para que uno ya eliminado no trabe la nueva. */
    const lotesPedidos = [...new Set(input.bloques.map((b) => b.loteId).filter((id): id is string => Boolean(id)))];
    const lotesVivos =
      lotesPedidos.length === 0
        ? new Set<string>()
        : new Set(
            (
              await prisma.forestLoteAserrio.findMany({
                where: { tenantId, id: { in: lotesPedidos }, deletedAt: null },
                select: { id: true },
              })
            ).map((l) => l.id),
          );
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
          bloques: existente ? input.bloques.map((b) => conservarAnotaciones(existente.bloques.find((x) => x.id === b.id), b)) : input.bloques,
          createdAt: existente?.createdAt,
          createdBy: existente?.createdBy ?? user,
        });
        /* Sólo al CREAR: una guardada ya es dueña de lo que anotó el servidor. */
        if (!existente) {
          const choque = choqueConOtraDistribucion(list, registro.id, registro.bloques, lotesVivos);
          if (choque) throw choque;
        }
        const next = existente
          ? list.map((d) => (d.id === registro.id ? registro : d))
          : [registro, ...list].slice(0, MAX_GUARDADAS);
        return { valor: next, resultado: { registro, existente } };
      },
      user,
      { esperaMaxMs: ESPERA_GUARDAR_MS, timeout: ESPERA_GUARDAR_MS + 7_000, maxWait: 10_000 },
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

  /**
   * Anota en UN bloque guardado lo que el servidor acaba de escribir en el
   * Libro (el lote creado, la jornada registrada) — Recorrido del permiso,
   * ADR-519. Mismo candado que `save`, y `cambio` recibe el bloque LEÍDO BAJO
   * CANDADO: dos jornadas seguidas no se pisan la lista. Devuelve el bloque
   * anotado, o `null` si la distribución o el bloque ya no están.
   *
   * Sin renglón de auditoría propio: lo que se anota ya quedó auditado por el
   * Libro (alta del lote, corrida) y por el paso del recorrido.
   */
  async anotarBloque(
    tenantId: string,
    distribucionId: string,
    bloqueId: string,
    cambio: (b: BloqueRolliza) => Partial<BloqueRolliza>,
    user = "unknown",
  ): Promise<BloqueRolliza | null> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, BloqueRolliza | null>(
      `${KEY_PREFIX}${tenantId}`,
      (actual) => {
        const list = normalizar(actual);
        const d = list.find((x) => x.id === distribucionId);
        const b = d?.bloques.find((x) => x.id === bloqueId);
        if (!d || !b) return { resultado: null };
        const anotado: BloqueRolliza = { ...b, ...cambio(b) };
        const registro = construirRegistroDistribucion({
          ...d,
          bloques: d.bloques.map((x) => (x.id === bloqueId ? anotado : x)),
          createdAt: d.createdAt,
          createdBy: d.createdBy,
        });
        return { valor: list.map((x) => (x.id === d.id ? registro : x)), resultado: anotado };
      },
      user,
    );
  },

  /**
   * Escribe en el Libro Y anota el bloque en UNA transacción (revisión de
   * ADR-519, A1). Con `anotarBloque` suelto, si el pedido se cortaba entre la
   * corrida y la anotación, el día quedaba en el Libro sin que el bloque lo
   * supiera y el Recorrido no se recuperaba. Acá `escribir` corre dentro del
   * `cambio` de `PlatformSettingsDB.actualizar` (como la guía desde su anexo,
   * ADR-446): o quedan las dos cosas o ninguna.
   *
   * Orden de candados: la clave KV de las distribuciones del negocio (primero,
   * la toma `actualizar`) → lo que tome `escribir` (N° de línea → lote →
   * trozas `ORDER BY id` → ingresos). Nada que tenga un lote o una troza pide
   * después la clave KV, así que no hay ciclo. Costo: mientras corre, otro
   * guardado de distribuciones del mismo negocio espera (una jornada tarda
   * 1-3 s; el tope es el de `txOpts`).
   *
   * Si la distribución o el bloque ya no están guardados, tira ANTES de
   * escribir en el Libro: no queda una corrida que ningún bloque reclama.
   */
  async escribirEnBloque<R>(
    tenantId: string,
    distribucionId: string,
    bloqueId: string,
    escribir: (
      tx: Prisma.TransactionClient,
      b: BloqueRolliza,
    ) => Promise<{ parche: Partial<BloqueRolliza>; resultado: R }>,
    user = "unknown",
    txOpts?: { timeout?: number; maxWait?: number },
  ): Promise<{ bloque: BloqueRolliza; resultado: R }> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, { bloque: BloqueRolliza; resultado: R }>(
      `${KEY_PREFIX}${tenantId}`,
      async (actual, tx) => {
        const list = normalizar(actual);
        const d = list.find((x) => x.id === distribucionId);
        const b = d?.bloques.find((x) => x.id === bloqueId);
        if (!d || !b) {
          throw new CtpInvariantError("La distribución o el bloque ya no están guardados: no se escribió nada.", "VALIDACION", {
            motivo: "BLOQUE_NO_GUARDADO",
          });
        }
        const { parche, resultado } = await escribir(tx, b);
        const anotado: BloqueRolliza = { ...b, ...parche };
        const registro = construirRegistroDistribucion({
          ...d,
          bloques: d.bloques.map((x) => (x.id === bloqueId ? anotado : x)),
          createdAt: d.createdAt,
          createdBy: d.createdBy,
        });
        return { valor: list.map((x) => (x.id === d.id ? registro : x)), resultado: { bloque: anotado, resultado } };
      },
      user,
      txOpts,
    );
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
