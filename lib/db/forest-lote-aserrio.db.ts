import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { CtpInvariantError, ForestCtpConsumoDB } from "./forest-ctp-consumo.db";
import { ForestCtpDB } from "./forest-ctp.db";
import { agruparPorGuia } from "@/lib/forestal/consumo-trozas";
import { invalidateByPrefix } from "@/lib/cache";

/**
 * Lote de ASERRÍO (ADR-334): las trozas de una misma especie que van juntas a
 * la sierra.
 *
 * Es el eslabón que faltaba entre el patio y la corrida. El operador elige las
 * piezas en Consumos, las guarda en un lote, y ese lote es el que después
 * produce. En el LO-CTP el «Lote» es la columna que enlaza Consumos, Producción
 * y Salidas: hasta ahora era texto libre y nada garantizaba que las tres
 * secciones hablaran del mismo.
 *
 * No confundir con `ForestProdLoteDB`, que es el lote COMERCIAL (agrupa
 * producción terminada para vender).
 *
 * ── Invariantes ─────────────────────────────────────────────────────────────
 * L-A1 · UNA especie por lote. La sierra se calibra por especie y la corrida
 *        tiene que poder declarar la suya sin ambigüedad.
 * L-A2 · Una troza está en UN lote a la vez, y sólo si está DISPONIBLE: no
 *        consumida, recepcionada, no descarte y no madre retrozada. Es la misma
 *        regla que `motivoBloqueo()` valida en la pantalla.
 * L-A3 · Un lote CONSUMIDO no se edita. Sus piezas ya entraron a la sierra;
 *        moverlas sería reescribir lo que pasó.
 */

const CACHE_PREFIX = "forestal:lote-aserrio";

export type EstadoLoteAserrio = "abierto" | "consumido" | "cerrado";

export interface LoteAserrioInput {
  speciesCommon: string;
  speciesScientific?: string | null;
  notes?: string | null;
  /** Programación del lote (ADR-342), como el formulario oficial del SNIFFS. */
  ordenProduccion?: string | null;
  tipoProductoConsumir?: string | null;
  inicioProceso?: Date | null;
  finProceso?: Date | null;
  createdBy: string;
}

/** Lo que hace que una pieza NO se pueda meter en un lote. */
function motivoNoElegible(t: {
  consumidaEnId: string | null;
  noRecepcionada: boolean;
  descarte: boolean;
  volumenM3: unknown;
  _count?: { retrozos: number };
}): string | null {
  if (t.consumidaEnId) return "ya entró a una corrida";
  if (t.noRecepcionada) return "no llegó al patio";
  if (t.descarte) return "es descarte del retrozado";
  if ((t._count?.retrozos ?? 0) > 0) return "se cortó en pedazos: agregá los pedazos";
  if (!(Number(t.volumenM3) > 0)) return "no tiene volumen registrado";
  return null;
}

export class ForestLoteAserrioDB {
  /**
   * El siguiente correlativo del año: LA-2026-001.
   *
   * Se calcula del último code del tenant y no de un contador: un contador que
   * se desincroniza deja huecos en un libro que se presenta numerado.
   */
  private static async siguienteCode(tenantId: string): Promise<string> {
    const anio = new Date().getFullYear();
    const prefijo = `LA-${anio}-`;
    const ultimo = await prisma.forestLoteAserrio.findFirst({
      where: { tenantId, code: { startsWith: prefijo } },
      orderBy: { code: "desc" },
      select: { code: true },
    });
    const n = ultimo ? Number(ultimo.code.slice(prefijo.length)) || 0 : 0;
    return `${prefijo}${String(n + 1).padStart(3, "0")}`;
  }

  /**
   * Los lotes del tenant, con el resumen de sus piezas y la corrida que se los
   * comió.
   *
   * La corrida se resuelve aparte porque `produccionEntryId` es un id suelto y
   * no una relación de Prisma. Va igual: sin ella, un lote consumido no puede
   * decir qué salió de él —ni si esa corrida sigue viva—, y la pantalla tendría
   * que adivinar si el lote se puede deshacer.
   */
  static async list(
    tenantId: string,
    opts: { status?: EstadoLoteAserrio; especie?: string; limite?: number } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const lotes = await prisma.forestLoteAserrio.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.especie ? { speciesCommon: opts.especie } : {}),
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: Math.min(Math.max(opts.limite ?? 100, 1), 500),
      include: {
        trozas: {
          select: {
            id: true, codificacion: true, codigoPlanta: true, volumenM3: true, especieComun: true,
            largoM: true, d1Cm: true, d2Cm: true, diametroCm: true, woodEntryId: true,
            // El ESTADO de la corrida, no el id pelado: una pieza que apunta a
            // una corrida anulada volvió al patio y sigue libre. Es la misma
            // regla que aplican las tres lecturas de una troza (ADR-326 §6).
            consumidaEn: { select: { id: true, status: true, deletedAt: true } },
          },
          orderBy: { orden: "asc" },
        },
      },
    });

    const corridaIds = [...new Set(lotes.map((l) => l.produccionEntryId).filter((x): x is string => Boolean(x)))];
    /* Lo que salió de esas corridas cierra el círculo del lote: la madera no
       muere en Producción, se despacha. Mismo criterio que el listado de
       corridas (`ForestCtpDB.list`) — sólo cuentan despachos y reprocesos
       VIVOS; uno anulado devolvió el producto al patio. */
    const [corridas, salidas, reprocesos] = await Promise.all([
      corridaIds.length
        ? prisma.forestCtpEntry.findMany({
            where: { tenantId, id: { in: corridaIds } },
            select: { id: true, lineNo: true, entryDate: true, productType: true, quantity: true, unit: true, status: true, deletedAt: true },
          })
        : [],
      corridaIds.length
        ? prisma.forestCtpDespachoOrigen.groupBy({
            by: ["produccionEntryId"],
            where: { tenantId, produccionEntryId: { in: corridaIds }, despacho: { deletedAt: null, status: "registrado" } },
            _sum: { quantity: true },
          })
        : [],
      corridaIds.length
        ? prisma.forestCtpReproceso.groupBy({
            by: ["origenEntryId"],
            where: { tenantId, origenEntryId: { in: corridaIds }, destino: { deletedAt: null, status: "registrado" } },
            _sum: { quantity: true },
          })
        : [],
    ]);
    const porCorrida = new Map(corridas.map((c) => [c.id, c]));
    const despachado = new Map(salidas.map((r) => [r.produccionEntryId, Number(r._sum.quantity ?? 0)]));
    const reprocesado = new Map(reprocesos.map((r) => [r.origenEntryId, Number(r._sum.quantity ?? 0)]));
    const num = (v: unknown) => (v == null ? null : Number(v));

    return lotes.map((l) => {
      const c = l.produccionEntryId ? porCorrida.get(l.produccionEntryId) : undefined;
      return {
        ...l,
        trozas: l.trozas.map(({ consumidaEn, ...t }) => ({
          ...t,
          volumenM3: num(t.volumenM3),
          largoM: num(t.largoM),
          d1Cm: num(t.d1Cm),
          d2Cm: num(t.d2Cm),
          diametroCm: num(t.diametroCm),
          consumidaEnId:
            consumidaEn && consumidaEn.deletedAt == null && consumidaEn.status !== "anulado"
              ? consumidaEn.id
              : null,
        })),
        produccion: c
          ? {
              id: c.id,
              lineNo: c.lineNo,
              entryDate: c.entryDate,
              productType: c.productType,
              quantity: num(c.quantity),
              unit: c.unit,
              status: c.status,
              viva: c.deletedAt == null && c.status !== "anulado",
              despachadoQty: despachado.get(c.id) ?? 0,
              reprocesadoQty: reprocesado.get(c.id) ?? 0,
            }
          : null,
        piezas: l.trozas.length,
        volumenM3: Math.round(l.trozas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
      };
    });
  }

  /** Abre un lote vacío para una especie. */
  static async create(tenantId: string, input: LoteAserrioInput) {
    if (!tenantId) throw new Error("tenantId is required");
    const especie = input.speciesCommon.trim();
    if (!especie) throw new CtpInvariantError("El lote necesita una especie.", "LOTE_SIN_ESPECIE");

    const code = await ForestLoteAserrioDB.siguienteCode(tenantId);
    const lote = await prisma.forestLoteAserrio.create({
      data: {
        tenantId,
        code,
        speciesCommon: especie,
        speciesScientific: input.speciesScientific?.trim() || null,
        notes: input.notes?.trim() || null,
        ordenProduccion: input.ordenProduccion?.trim() || null,
        tipoProductoConsumir: input.tipoProductoConsumir?.trim() || null,
        inicioProceso: input.inicioProceso ?? null,
        finProceso: input.finProceso ?? null,
        createdBy: input.createdBy,
      },
    });
    auditCtp({
      tenantId,
      action: "ctp_lote_aserrio_create",
      entity: "ForestLoteAserrio",
      entityId: lote.id,
      detail: `Abrió el lote de aserrío ${lote.code} · ${especie}`,
      user: input.createdBy,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return lote;
  }

  /**
   * Guarda piezas en el lote.
   *
   * AGREGA, nunca reemplaza. Las que no se pueden se devuelven con su motivo en
   * vez de fallar entero: de 30 piezas elegidas, que 2 estén consumidas no puede
   * obligar a rehacer la selección.
   */
  static async agregarTrozas(
    tenantId: string,
    loteId: string,
    trozaIds: string[],
    user: string,
  ): Promise<{ agregadas: number; rechazadas: { id: string; codigo: string | null; motivo: string }[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (trozaIds.length === 0) return { agregadas: 0, rechazadas: [] };

    return prisma.$transaction(async (tx) => {
      const lote = await tx.forestLoteAserrio.findFirst({ where: { id: loteId, tenantId, deletedAt: null } });
      if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");
      if (lote.status !== "abierto") {
        throw new CtpInvariantError(
          `El lote ${lote.code} está ${lote.status}: ya no se le agregan piezas.`,
          "LOTE_NO_EDITABLE",
          { status: lote.status },
        );
      }

      const trozas = await tx.woodEntryTroza.findMany({
        where: { id: { in: trozaIds }, tenantId },
        include: { _count: { select: { retrozos: true } } },
      });

      const rechazadas: { id: string; codigo: string | null; motivo: string }[] = [];
      const aceptadas: string[] = [];
      for (const t of trozas) {
        const codigo = t.codificacion ?? t.codigoPlanta;
        /* L-A1: una especie por lote. Comparar normalizado — «Tornillo» y
           «tornillo » son la misma madera. */
        if ((t.especieComun ?? "").trim().toLowerCase() !== lote.speciesCommon.trim().toLowerCase()) {
          rechazadas.push({ id: t.id, codigo, motivo: `es ${t.especieComun ?? "sin especie"} y el lote es de ${lote.speciesCommon}` });
          continue;
        }
        if (t.loteAserrioId && t.loteAserrioId !== loteId) {
          rechazadas.push({ id: t.id, codigo, motivo: "ya está en otro lote" });
          continue;
        }
        const motivo = motivoNoElegible(t);
        if (motivo) {
          rechazadas.push({ id: t.id, codigo, motivo });
          continue;
        }
        if (t.loteAserrioId === loteId) continue; // ya estaba: no es un error
        aceptadas.push(t.id);
      }

      if (aceptadas.length > 0) {
        await tx.woodEntryTroza.updateMany({ where: { id: { in: aceptadas }, tenantId }, data: { loteAserrioId: loteId } });
      }

      if (aceptadas.length > 0) {
        auditCtp({
          tenantId,
          action: "ctp_lote_aserrio_trozas_add",
          entity: "ForestLoteAserrio",
          entityId: loteId,
          detail: `Guardó ${aceptadas.length} troza${aceptadas.length === 1 ? "" : "s"} en el lote ${lote.code}` +
            (rechazadas.length > 0 ? ` · ${rechazadas.length} no entraron` : ""),
          user,
        });
      }
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
      return { agregadas: aceptadas.length, rechazadas };
    });
  }

  /**
   * El lote ENTRA A LA SIERRA: sus piezas se marcan consumidas por la corrida y
   * el lote queda apuntando a ella.
   *
   * Es el paso que convierte «un montón de trozas apartadas» en consumo del
   * libro. **El consumo vive en DOS lugares y los dos se escriben acá**: las
   * piezas (`consumidaEnId`) y los m³ por guía (`ForestCtpConsumo`).
   *
   * ⚠️ Lo segundo faltaba (ADR-337). Producir desde un lote marcaba las piezas y
   * nada más: la corrida quedaba **sin materia prima atribuida**, así que no
   * aparecía en la Sección 2 del libro y su despacho no podía certificarse
   * («corrida citada sin origen»). Se detectó despachando de verdad un lote, no
   * en los gates. El reparto por guía se DERIVA de las piezas con la misma
   * función que usa el formulario cuando se eligen a mano — dos caminos, una
   * sola regla.
   */
  static async consumir(
    tenantId: string,
    loteId: string,
    corridaId: string,
    fecha: Date | undefined,
    user: string,
    /**
     * Consumir SÓLO estas piezas del lote (ADR-356). Vacío o ausente = todas.
     *
     * Un lote de veinte trozas no siempre entra entero a la sierra: el turno se
     * corta, o se asierra la mitad hoy y la mitad mañana. Las que no entran
     * **siguen apartadas** en el lote para la corrida siguiente.
     */
    soloEstas?: readonly string[],
  ): Promise<{ piezas: number; volumenM3: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.forestLoteAserrio.findFirst({
      where: { id: loteId, tenantId, deletedAt: null },
      include: { trozas: { select: { id: true, woodEntryId: true, volumenM3: true, consumidaEnId: true } } },
    });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");
    if (lote.status !== "abierto") {
      throw new CtpInvariantError(`El lote ${lote.code} ya está ${lote.status}.`, "LOTE_NO_EDITABLE", { status: lote.status });
    }
    const disponibles = lote.trozas.filter((t) => !t.consumidaEnId);
    const pedidas = soloEstas && soloEstas.length > 0 ? new Set(soloEstas) : null;
    const libres = pedidas ? disponibles.filter((t) => pedidas.has(t.id)) : disponibles;
    if (libres.length === 0) {
      throw new CtpInvariantError(
        pedidas
          ? `Ninguna de las piezas elegidas está disponible en el lote ${lote.code}.`
          : `El lote ${lote.code} no tiene piezas que consumir.`,
        "LOTE_NO_EDITABLE",
      );
    }

    /* Los m³ por guía, ANTES de marcar nada: si I1/I2 rechazan, el lote queda
       abierto y no hay medio consumo escrito. Sólo se derivan si la corrida no
       tiene ya su atribución — un operador que la declaró a mano manda. */
    const yaAtribuida = await prisma.forestCtpConsumo.count({ where: { tenantId, ctpEntryId: corridaId } });
    if (yaAtribuida === 0) {
      const porGuia = agruparPorGuia(
        libres.map((t) => ({
          id: t.id,
          woodEntryId: t.woodEntryId,
          codificacion: null,
          especieComun: lote.speciesCommon,
          volumenM3: t.volumenM3 == null ? null : Number(t.volumenM3),
        })),
      );
      await ForestCtpConsumoDB.setConsumos(
        tenantId,
        corridaId,
        porGuia.map((g) => ({ woodEntryId: g.woodEntryId, volumeM3: g.volumenM3 })),
        user,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.woodEntryTroza.updateMany({
        where: { id: { in: libres.map((t) => t.id) }, tenantId, consumidaEnId: null },
        data: { consumidaEnId: corridaId, fechaConsumo: fecha ?? new Date() },
      });
      /* El lote se cierra sólo si NO le quedó madera. Con un consumo parcial
         sigue ABIERTO: darlo por consumido escondería las piezas que todavía
         están apartadas esperando la corrida siguiente. */
      if (libres.length >= disponibles.length) {
        await tx.forestLoteAserrio.update({
          where: { id: loteId },
          data: { status: "consumido", fechaConsumo: fecha ?? new Date(), produccionEntryId: corridaId },
        });
      }
    });

    const volumenM3 = Math.round(libres.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000;
    const quedan = disponibles.length - libres.length;
    auditCtp({
      tenantId,
      action: "ctp_lote_aserrio_consumir",
      entity: "ForestLoteAserrio",
      entityId: loteId,
      detail:
        `El lote ${lote.code} entró a la sierra: ${libres.length} troza${libres.length === 1 ? "" : "s"} · ${volumenM3} m³` +
        (quedan > 0 ? ` · quedan ${quedan} apartada(s) en el lote` : ""),
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return { piezas: libres.length, volumenM3 };
  }

  /**
   * CONSUMIR EN EL PATIO (ADR-340): las trozas entran a la sierra hoy, dentro de
   * este lote, y la producción se declara después.
   *
   * Es el orden real del aserradero y el que pide el LO-CTP: el consumo
   * (Sección 2) tiene **fecha propia** y la transformación (Sección 3) la suya.
   * Hasta ahora el sistema exigía declarar las dos juntas —no había forma de
   * registrar un consumo sin decir ya cuánto salió—, así que el operador tenía
   * que esperar a terminar la corrida para anotar madera que ya había entrado.
   *
   * La corrida se abre **en proceso**: con su materia prima y sin `quantity`.
   * Eso ya era representable (la columna es nullable) y significa exactamente lo
   * que pasó: consumió madera y todavía no declaró qué salió. Mientras esté así,
   * I5 no deja despachar de ella —no se puede sacar de lo que no se declaró— y
   * el rendimiento queda en blanco, que es lo honesto.
   *
   * Si el consumo no pasa las invariantes, la corrida recién abierta se borra:
   * no queda una línea fantasma en el libro por un intento fallido.
   */
  static async consumirEnPatio(
    tenantId: string,
    input: { loteId: string; trozaIds?: string[]; fecha?: Date; observaciones?: string | null; user: string },
  ): Promise<{
    corrida: { id: string; lineNo: number };
    piezas: number;
    volumenM3: number;
    rechazadas: { id: string; codigo: string | null; motivo: string }[];
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    const { loteId, trozaIds = [], fecha, observaciones, user } = input;

    /* Primero las piezas al lote: si alguna no entra, se dice cuál y por qué
       ANTES de abrir nada en el libro. */
    const agregado = trozaIds.length > 0
      ? await ForestLoteAserrioDB.agregarTrozas(tenantId, loteId, trozaIds, user)
      : { agregadas: 0, rechazadas: [] as { id: string; codigo: string | null; motivo: string }[] };

    const lote = await prisma.forestLoteAserrio.findFirst({
      where: { id: loteId, tenantId, deletedAt: null },
      include: { trozas: { select: { id: true, volumenM3: true, consumidaEnId: true, especieCientifica: true } } },
    });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");
    /* El input de la corrida es lo que REALMENTE entra, no el lote entero: con
       un consumo parcial, declarar todo el lote como materia prima inflaría el
       denominador del rendimiento y rompería I1/I2 contra lo marcado. */
    const disponibles = lote.trozas.filter((t) => !t.consumidaEnId);
    const pedidas = trozaIds.length > 0 ? new Set(trozaIds) : null;
    const libres = pedidas ? disponibles.filter((t) => pedidas.has(t.id)) : disponibles;
    if (libres.length === 0) {
      throw new CtpInvariantError(
        `El lote ${lote.code} no tiene piezas que consumir.`,
        "LOTE_NO_EDITABLE",
      );
    }
    const volumenM3 = Math.round(libres.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000;

    const corrida = await ForestCtpDB.create(tenantId, {
      section: "produccion",
      entryDate: fecha,
      speciesCommon: lote.speciesCommon,
      speciesScientific: lote.speciesScientific ?? libres[0]?.especieCientifica ?? null,
      volumeInputM3: volumenM3,
      materiaPrimaRef: lote.code,
      /* La nota del operador MANDA sobre la frase automática: el lote ya está
         en `materiaPrimaRef` y en el casillero (10), y que falte declarar la
         producción se sabe por `quantity == null`. Concatenar las dos llenaba
         el casillero (11) de ruido justo cuando había algo real que leer. */
      observations: (observaciones ?? "").trim() || `Consumo del lote ${lote.code} · producción por declarar`,
      createdBy: user,
    });

    try {
      const r = await ForestLoteAserrioDB.consumir(tenantId, loteId, corrida.id, fecha, user, trozaIds);
      return {
        corrida: { id: corrida.id, lineNo: corrida.lineNo },
        piezas: r.piezas,
        volumenM3: r.volumenM3,
        rechazadas: agregado.rechazadas,
      };
    } catch (e) {
      /* La corrida no llegó a consumir nada: se retira. Dejarla sería una línea
         de producción que no representa ningún hecho. */
      await ForestCtpDB.softDelete(tenantId, corrida.id, user).catch((err) =>
        /* Si la retirada falla queda una línea de producción que no representa
           ningún hecho: es exactamente lo que hay que poder encontrar después. */
        logger.error("[forestal.consumirEnPatio] no se pudo retirar la corrida fallida", {
          corridaId: corrida.id,
          lineNo: corrida.lineNo,
          error: String(err),
        }),
      );
      throw e;
    }
  }

  /**
   * SUMAR PIEZAS A UNA CORRIDA ABIERTA (ADR-364).
   *
   * El turno no entra entero de una vez: se carga el carro, se corta, y a media
   * mañana entran diez trozas más del mismo lote. Eso es **la misma corrida** —
   * la misma jornada y el mismo producto que sale al final— y hasta ahora no
   * había cómo decirlo: `consumirEnPatio` siempre abre una nueva, así que la
   * jornada quedaba partida en dos asientos con dos rendimientos que nadie
   * eligió.
   *
   * Sólo sobre una corrida **que todavía no declaró** (`quantity == null`).
   * Sumarle materia prima a una ya declarada cambiaría el denominador del
   * rendimiento de un asiento cerrado: eso se corrige anulando y rehaciendo, no
   * por acá.
   *
   * El orden importa y está en el ADR: **primero el volumen, después la
   * atribución**. I1 es `Σ atribuido ≤ declarado` y se evalúa contra la fila
   * bloqueada — al revés, la atribución que estamos agregando se rechazaría a sí
   * misma. Si `setConsumos` falla, el volumen se restaura.
   */
  static async sumarACorrida(
    tenantId: string,
    input: { loteId: string; corridaId: string; trozaIds: string[]; fecha?: Date; user: string },
  ): Promise<{ piezas: number; volumenM3: number; volumenTotalM3: number; loteCerrado: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const { loteId, corridaId, trozaIds, fecha, user } = input;
    if (trozaIds.length === 0) {
      throw new CtpInvariantError("No elegiste ninguna pieza para sumar.", "LOTE_NO_EDITABLE");
    }

    const corrida = await prisma.forestCtpEntry.findFirst({
      where: { id: corridaId, tenantId, deletedAt: null },
      select: {
        id: true, lineNo: true, section: true, status: true,
        quantity: true, volumeInputM3: true, speciesCommon: true, entryDate: true,
      },
    });
    if (!corrida) throw new CtpInvariantError("Esa corrida no existe.", "LOTE_NO_ENCONTRADO");
    if (corrida.section !== "produccion" || corrida.status !== "registrado") {
      throw new CtpInvariantError(
        `La corrida N° ${corrida.lineNo} no está vigente: no se le suma madera.`,
        "LOTE_NO_EDITABLE",
      );
    }
    /* La puerta central del ADR-364: sólo la que todavía no declaró. */
    if (corrida.quantity != null) {
      throw new CtpInvariantError(
        `La corrida N° ${corrida.lineNo} ya declaró su producción: sumarle materia prima le cambiaría el rendimiento. ` +
          "Registrá la madera nueva en una corrida aparte, o anulá esta y rehacela.",
        "LOTE_NO_EDITABLE",
      );
    }

    const lote = await prisma.forestLoteAserrio.findFirst({
      where: { id: loteId, tenantId, deletedAt: null },
      include: { trozas: { select: { id: true, woodEntryId: true, volumenM3: true, consumidaEnId: true, noRecepcionada: true, descarte: true, _count: { select: { retrozos: true } } } } },
    });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");
    if (lote.status !== "abierto") {
      throw new CtpInvariantError(`El lote ${lote.code} ya está ${lote.status}.`, "LOTE_NO_EDITABLE", { status: lote.status });
    }
    /* L-A1 llevada a la corrida: un asiento es de UNA especie, o el Cuadro
       Resumen por especie deja de poder armarse. */
    if (
      corrida.speciesCommon &&
      lote.speciesCommon.trim().toLowerCase() !== corrida.speciesCommon.trim().toLowerCase()
    ) {
      throw new CtpInvariantError(
        `El lote ${lote.code} es de ${lote.speciesCommon} y la corrida N° ${corrida.lineNo} es de ${corrida.speciesCommon}.`,
        "LOTE_NO_EDITABLE",
      );
    }

    /* T1 pieza por pieza (ADR-326), con el motivo de cada una: «guardé 3 de 8»
       a secas obliga a contar a mano cuál faltó. */
    const pedidas = new Set(trozaIds);
    const candidatas = lote.trozas.filter((t) => pedidas.has(t.id));
    const libres = candidatas.filter((t) => motivoNoElegible(t) === null);
    if (libres.length === 0) {
      throw new CtpInvariantError(
        `Ninguna de las piezas elegidas está disponible en el lote ${lote.code}.`,
        "LOTE_NO_EDITABLE",
      );
    }

    const r4 = (n: number) => Math.round(n * 10000) / 10000;
    const delta = r4(libres.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
    const volumenPrevio = corrida.volumeInputM3 == null ? 0 : Number(corrida.volumeInputM3);
    const volumenTotal = r4(volumenPrevio + delta);

    // 1. El volumen primero (ver cabecera y ADR-364).
    await prisma.forestCtpEntry.update({ where: { id: corridaId }, data: { volumeInputM3: volumenTotal } });

    try {
      // 2. La atribución por guía: lo que YA tenía ⊕ lo que entra ahora.
      const previos = await prisma.forestCtpConsumo.findMany({
        where: { tenantId, ctpEntryId: corridaId },
        select: { woodEntryId: true, volumeM3: true },
      });
      const porGuia = new Map(previos.map((c) => [c.woodEntryId, Number(c.volumeM3)]));
      for (const g of agruparPorGuia(
        libres.map((t) => ({
          id: t.id,
          woodEntryId: t.woodEntryId,
          codificacion: null,
          especieComun: lote.speciesCommon,
          volumenM3: t.volumenM3 == null ? null : Number(t.volumenM3),
        })),
      )) {
        porGuia.set(g.woodEntryId, r4((porGuia.get(g.woodEntryId) ?? 0) + g.volumenM3));
      }
      /* I1/I2 los valida `setConsumos` — la regla vive una sola vez, y también
         el cierre de período y el guard de costo congelado. */
      await ForestCtpConsumoDB.setConsumos(
        tenantId,
        corridaId,
        [...porGuia.entries()].map(([woodEntryId, volumeM3]) => ({ woodEntryId, volumeM3 })),
        user,
      );
    } catch (e) {
      /* Nada entró: la corrida vuelve al volumen que tenía. Dejarla inflada por
         un intento fallido inventaría materia prima. */
      await prisma.forestCtpEntry
        .update({ where: { id: corridaId }, data: { volumeInputM3: volumenPrevio } })
        /* Si ni siquiera se pudo restaurar, la corrida queda inflada sin
           atribución: se ve como «materia prima sin origen» en la ficha, pero
           hay que poder rastrear por qué. Silenciarlo lo volvería un misterio. */
        .catch((err) =>
          logger.error("[forestal.sumarACorrida] no se pudo restaurar volumeInputM3", {
            corridaId,
            volumenPrevio,
            error: String(err),
          }),
        );
      throw e;
    }

    // 3. Las piezas, y el lote se cierra sólo si se quedó sin madera.
    const disponibles = lote.trozas.filter((t) => !t.consumidaEnId);
    const seVacia = libres.length >= disponibles.length;
    await prisma.$transaction(async (tx) => {
      await tx.woodEntryTroza.updateMany({
        where: { id: { in: libres.map((t) => t.id) }, tenantId, consumidaEnId: null },
        data: { consumidaEnId: corridaId, fechaConsumo: fecha ?? new Date() },
      });
      if (seVacia) {
        await tx.forestLoteAserrio.update({
          where: { id: loteId },
          data: { status: "consumido", fechaConsumo: fecha ?? new Date(), produccionEntryId: corridaId },
        });
      }
    });

    auditCtp({
      tenantId,
      action: "ctp_corrida_sumar_piezas",
      entity: "ForestCtpEntry",
      entityId: corridaId,
      detail:
        `Sumó ${libres.length} troza${libres.length === 1 ? "" : "s"} del lote ${lote.code} a la corrida N° ${corrida.lineNo}: ` +
        `${delta} m³ más (de ${volumenPrevio} a ${volumenTotal} m³)` +
        (seVacia ? ` · el lote quedó consumido` : ""),
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }

    return { piezas: libres.length, volumenM3: delta, volumenTotalM3: volumenTotal, loteCerrado: seVacia };
  }

  /** Saca una pieza del lote (mientras esté abierto). */
  static async quitarTroza(tenantId: string, loteId: string, trozaId: string, user: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.forestLoteAserrio.findFirst({ where: { id: loteId, tenantId, deletedAt: null } });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");
    if (lote.status !== "abierto") {
      throw new CtpInvariantError(`El lote ${lote.code} está ${lote.status}: sus piezas ya no se mueven.`, "LOTE_NO_EDITABLE");
    }
    await prisma.woodEntryTroza.updateMany({ where: { id: trozaId, tenantId, loteAserrioId: loteId }, data: { loteAserrioId: null } });
    auditCtp({
      tenantId, action: "ctp_lote_aserrio_trozas_remove", entity: "ForestLoteAserrio", entityId: loteId,
      detail: `Sacó una troza del lote ${lote.code}`, user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
  }

  /** Renombra la especie / notas de un lote abierto. */
  static async update(tenantId: string, loteId: string, cambios: { notes?: string | null }, user: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.forestLoteAserrio.findFirst({ where: { id: loteId, tenantId, deletedAt: null } });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");
    const actualizado = await prisma.forestLoteAserrio.update({
      where: { id: loteId },
      data: { notes: cambios.notes?.trim() || null },
    });
    auditCtp({ tenantId, action: "ctp_lote_aserrio_update", entity: "ForestLoteAserrio", entityId: loteId, detail: `Editó el lote ${lote.code}`, user });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return actualizado;
  }

  /**
   * Borra un lote VACÍO o suelta sus piezas.
   *
   * Un lote consumido no se borra: es parte del libro.
   */
  static async softDelete(tenantId: string, loteId: string, user: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.forestLoteAserrio.findFirst({ where: { id: loteId, tenantId, deletedAt: null } });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");

    /**
     * Un lote consumido está en el libro y no se toca… salvo que la corrida que
     * se lo comió YA NO EXISTA (se anuló o se borró). Ahí esa madera volvió al
     * patio y el lote es un puntero a algo muerto: es la misma regla que el
     * resto del libro aplica a las trozas —mirar el ESTADO de la corrida, no el
     * id pelado— y sin esto el lote quedaba trabado para siempre.
     */
    let corridaViva = false;
    if (lote.status !== "abierto" && lote.produccionEntryId) {
      corridaViva =
        (await prisma.forestCtpEntry.count({
          where: { id: lote.produccionEntryId, tenantId, deletedAt: null, status: { not: "anulado" } },
        })) > 0;
    }
    if (lote.status !== "abierto" && corridaViva) {
      throw new CtpInvariantError(
        `El lote ${lote.code} ya se consumió en una corrida viva: anulá la corrida primero.`,
        "LOTE_NO_EDITABLE",
      );
    }

    await prisma.$transaction(async (tx) => {
      /* Las piezas vuelven al patio: la madera no desaparece con el lote. Si el
         lote estaba consumido por una corrida muerta, además se liberan. */
      await tx.woodEntryTroza.updateMany({
        where: { tenantId, loteAserrioId: loteId },
        data: { loteAserrioId: null, ...(lote.status !== "abierto" ? { consumidaEnId: null, fechaConsumo: null } : {}) },
      });
      await tx.forestLoteAserrio.update({ where: { id: loteId }, data: { deletedAt: new Date() } });
    });
    auditCtp({
      tenantId, action: "ctp_lote_aserrio_delete", entity: "ForestLoteAserrio", entityId: loteId,
      detail: `Deshizo el lote ${lote.code} · sus piezas volvieron al patio${lote.status !== "abierto" ? " (su corrida ya no existía)" : ""}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
  }
}
