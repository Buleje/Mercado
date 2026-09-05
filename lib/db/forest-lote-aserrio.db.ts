import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { CtpInvariantError, ForestCtpConsumoDB } from "./forest-ctp-consumo.db";
import { ForestCtpDB } from "./forest-ctp.db";
import { agruparPorGuia } from "@/lib/forestal/consumo-trozas";
import { invalidateByPrefix } from "@/lib/cache";
import { vivaLinea } from "./wood-entries.db";
import { Prisma } from "@/lib/generated/prisma/client";
import { ORIGEN_LOTE_INVENTARIO } from "@/lib/forestal/lotes-aserrio";

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
  /**
   * Código elegido a mano (Brandon, 2026-08-31): sin esto se asigna el
   * correlativo `LA-2026-00N` de siempre. `@@unique[tenantId, code]` es lo que
   * de verdad impide el duplicado; acá se chequea ANTES para devolver un
   * mensaje legible en vez del error crudo de Postgres.
   */
  code?: string | null;
  createdBy: string;
}

/**
 * Lo que se puede corregir de un lote ya creado (Brandon, 2026-08-31): antes
 * sólo la nota. `undefined` = no tocar ese campo; `null` en los opcionales =
 * borrarlo. El código es la excepción: una cadena vacía/`null` significa "no
 * pedí cambiarlo", no "borralo" — un lote siempre necesita uno.
 */
export interface LoteEditInput {
  code?: string | null;
  speciesCommon?: string;
  speciesScientific?: string | null;
  notes?: string | null;
  ordenProduccion?: string | null;
  tipoProductoConsumir?: string | null;
  inicioProceso?: Date | null;
  finProceso?: Date | null;
}

/** Un paquete de producción declarado directo, sin pasar por el patio (ADR-349). */
export interface PaqueteInventarioInput {
  codigo: string;
  productType?: string | null;
  presentacion?: string | null;
  cantidad: number;
  volumenM3: number;
  espesorCm?: number | null;
  anchoCm?: number | null;
  largoM?: number | null;
  observations?: string | null;
}

/**
 * Un lote declarado como INVENTARIO: existencia previa al sistema de la que se
 * conoce cuánto se consumió en trozas y qué salió aserrado, pero no la pieza por
 * pieza. Ver `ORIGEN_LOTE_INVENTARIO`.
 */
export interface LoteInventarioInput {
  speciesCommon: string;
  speciesScientific?: string | null;
  /** Lo que entró a la sierra, declarado de una vez — no la suma de trozas reales. */
  volumenConsumidoM3: number;
  fecha?: Date;
  /** Cierre de la ventana del proceso (ADR-342). Sin fecha = sigue abierta. */
  finProceso?: Date | null;
  notes?: string | null;
  paquetes: PaqueteInventarioInput[];
  /** Código elegido a mano; sin esto, correlativo automático. */
  code?: string | null;
  createdBy: string;
}

/**
 * Lo que hace que una pieza NO se pueda meter en un lote (ni sumarse a una
 * corrida ya abierta desde uno). `despachadaEn`/`entry` son opcionales para
 * no romper a los llamadores que todavía no los traen del query — pero
 * cuando SÍ vienen, se aplican: una troza que ya salió despachada en rollo,
 * o cuya guía de ingreso se anuló/rechazó, no es materia prima disponible
 * aunque nadie la haya marcado "consumida" todavía (auditoría 2026-08-25 —
 * espejo del mismo chequeo que ya hace T2 al despachar).
 */
function motivoNoElegible(t: {
  consumidaEnId: string | null;
  noRecepcionada: boolean;
  descarte: boolean;
  volumenM3: unknown;
  _count?: { retrozos: number };
  despachadaEn?: { status: string; deletedAt: Date | null } | null;
  entry?: { status: string; deletedAt: Date | null } | null;
}): string | null {
  if (t.consumidaEnId) return "ya entró a una corrida";
  if (vivaLinea(t.despachadaEn ?? null)) return "ya se despachó sin aserrar";
  if (t.entry && (Boolean(t.entry.deletedAt) || ["anulado", "rechazado"].includes(t.entry.status))) {
    return "la guía de ingreso está anulada o rechazada";
  }
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
   * El código a usar: el que se pidió a mano, validado, o el correlativo de
   * siempre si no se pidió ninguno (Brandon, 2026-08-31).
   *
   * `@@unique[tenantId, code]` no filtra por `deletedAt` —un lote borrado
   * sigue bloqueando su código para siempre, igual que ya hace
   * `siguienteCode()` al no excluirlos del cálculo—, así que el chequeo
   * tampoco lo filtra: reportar "libre" un código que la base va a rechazar
   * sería peor que el error crudo de Postgres.
   */
  private static async codigoAUsar(
    tenantId: string,
    pedido: string | null | undefined,
    excluirLoteId?: string,
  ): Promise<string> {
    const limpio = pedido?.trim();
    if (!limpio) return ForestLoteAserrioDB.siguienteCode(tenantId);
    const enUso = await prisma.forestLoteAserrio.findFirst({
      where: { tenantId, code: limpio, ...(excluirLoteId ? { id: { not: excluirLoteId } } : {}) },
      select: { id: true },
    });
    if (enUso) {
      throw new CtpInvariantError(`El código "${limpio}" ya está en uso: elegí otro.`, "LOTE_CODIGO_DUPLICADO");
    }
    return limpio;
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
            // El permiso viaja en el ingreso (`originCode`), no en la troza —
            // MISMA fuente que `TrozaConsumible.permiso` en trozas/patio
            // (Brandon, 2026-09-01: "en la columna de N° de permiso se tiene
            // que rellenar según el número de permiso de las trozas"). Sin
            // este join, un bloque sembrado desde un lote no podía saber de
            // qué título habilitante salió su rolliza.
            entry: { select: { originCode: true } },
          },
          orderBy: { orden: "asc" },
        },
      },
    });

    /**
     * Las corridas del lote son TODAS las que se comieron alguna de sus piezas,
     * no sólo la que lo cerró (ADR-365).
     *
     * `produccionEntryId` se escribe cuando el lote se consume ENTERO: un lote
     * aserrado a medias —tres trozas hoy, la cuarta el jueves— lo tiene en null y
     * sus corridas quedaban invisibles para la pantalla, que entonces no podía
     * ofrecer terminar de declarar lo que ya se aserró.
     */
    const corridaIds = [
      ...new Set([
        ...lotes.map((l) => l.produccionEntryId).filter((x): x is string => Boolean(x)),
        ...lotes.flatMap((l) =>
          l.trozas
            .map((t) => t.consumidaEn)
            .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.deletedAt == null && c!.status !== "anulado")
            .map((c) => c.id),
        ),
      ]),
    ];
    /* Lo que salió de esas corridas cierra el círculo del lote: la madera no
       muere en Producción, se despacha. Mismo criterio que el listado de
       corridas (`ForestCtpDB.list`) — sólo cuentan despachos y reprocesos
       VIVOS; uno anulado devolvió el producto al patio. */
    const [corridas, salidas, reprocesos] = await Promise.all([
      corridaIds.length
        ? prisma.forestCtpEntry.findMany({
            where: { tenantId, id: { in: corridaIds } },
            /* `volumeInputM3` es el denominador del rendimiento: sin él la
               pantalla no puede decir cuánto más se puede declarar (ADR-365). */
            select: {
              id: true, lineNo: true, entryDate: true, productType: true, quantity: true, unit: true,
              status: true, deletedAt: true, volumeInputM3: true, speciesCommon: true,
              usadoAt: true, usadoMotivo: true,
              /* El detalle de productos de la corrida (ADR-349): una corrida
                 declarada con el formulario oficial casi siempre trae más de
                 un tipo, y sin esto la Ficha del Lote sólo mostraba el total
                 (Brandon, 2026-09-01: "quiero que se vea lo que se puso"). */
              paquetes: {
                where: { deletedAt: null },
                orderBy: { createdAt: "asc" },
                select: { id: true, codigo: true, productType: true, presentacion: true, cantidad: true, volumenM3: true },
              },
            },
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

    /** Una corrida vista desde el lote, con lo que la pantalla necesita decidir. */
    const verCorrida = (c: (typeof corridas)[number]) => ({
      id: c.id,
      lineNo: c.lineNo,
      entryDate: c.entryDate,
      productType: c.productType,
      speciesCommon: c.speciesCommon,
      quantity: num(c.quantity),
      volumeInputM3: num(c.volumeInputM3),
      unit: c.unit,
      status: c.status,
      viva: c.deletedAt == null && c.status !== "anulado",
      despachadoQty: despachado.get(c.id) ?? 0,
      reprocesadoQty: reprocesado.get(c.id) ?? 0,
      paquetes: c.paquetes.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        productType: p.productType,
        presentacion: p.presentacion,
        cantidad: p.cantidad,
        volumenM3: Number(p.volumenM3),
      })),
      usadoAt: c.usadoAt ? c.usadoAt.toISOString() : null,
      usadoMotivo: c.usadoMotivo,
    });

    return lotes.map((l) => {
      const c = l.produccionEntryId ? porCorrida.get(l.produccionEntryId) : undefined;
      /* Las corridas que se comieron piezas de ESTE lote, la que lo cerró
         incluida y sin repetirla. Ordenadas por N° de línea: es el orden del
         libro y el que el operador tiene en la cabeza. */
      const suyas = [
        ...new Set([
          ...l.trozas
            .map((t) => t.consumidaEn)
            .filter((x): x is NonNullable<typeof x> => Boolean(x) && x!.deletedAt == null && x!.status !== "anulado")
            .map((x) => x.id),
          ...(l.produccionEntryId ? [l.produccionEntryId] : []),
        ]),
      ]
        .map((id) => porCorrida.get(id))
        .filter((x): x is NonNullable<typeof x> => Boolean(x) && x!.deletedAt == null && x!.status !== "anulado")
        .map(verCorrida)
        .sort((a, b) => a.lineNo - b.lineNo);
      return {
        ...l,
        corridas: suyas,
        trozas: l.trozas.map(({ consumidaEn, entry, ...t }) => ({
          ...t,
          volumenM3: num(t.volumenM3),
          largoM: num(t.largoM),
          d1Cm: num(t.d1Cm),
          d2Cm: num(t.d2Cm),
          diametroCm: num(t.diametroCm),
          permiso: entry.originCode,
          consumidaEnId:
            consumidaEn && consumidaEn.deletedAt == null && consumidaEn.status !== "anulado"
              ? consumidaEn.id
              : null,
        })),
        /* La que CERRÓ el lote, anulada incluida: `alertasDeLote` avisa
           justamente del lote que apunta a una corrida muerta. Misma forma que
           las de arriba — dos serializaciones de lo mismo divergen a la primera
           columna nueva. */
        produccion: c ? verCorrida(c) : null,
        piezas: l.trozas.length,
        /* Un lote de inventario (`crearInventario`) no tiene trozas reales: su
           volumen es el `volumeInputM3` que declaró la corrida que lo generó, NO
           cero. Es el MISMO número que ya usa `rendimientoLote()` para esa
           corrida — no un segundo volumen inventado aparte. Un lote real con
           trozas sigue sumando de ellas, sin cambios. */
        volumenM3:
          l.trozas.length > 0 || !c
            ? Math.round(l.trozas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000
            : Math.round(Number(c.volumeInputM3 ?? 0) * 10000) / 10000,
      };
    });
  }

  /** Abre un lote vacío para una especie. */
  static async create(tenantId: string, input: LoteAserrioInput) {
    if (!tenantId) throw new Error("tenantId is required");
    const especie = input.speciesCommon.trim();
    if (!especie) throw new CtpInvariantError("El lote necesita una especie.", "LOTE_SIN_ESPECIE");

    const code = await ForestLoteAserrioDB.codigoAUsar(tenantId, input.code);
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
   * Declara un lote como INVENTARIO: entra y sale en el mismo acto, sin trozas
   * reales que apartar ni sierra que esperar.
   *
   * Es la existencia previa al sistema —Brandon, 2026-08-31—: se sabe cuánto se
   * consumió en trozas y qué salió aserrado, pero no queda un registro pieza por
   * pieza de esa madera. Fabricar trozas falsas para que el lote "cuadre" sería
   * peor que no tenerlas: inventaría datos de patio que un fiscalizador podría
   * cruzar contra una guía y no encontraría nada real detrás.
   *
   * El input y la salida se declaran en la MISMA corrida, con la MISMA puerta
   * que usa el resto del libro (`ForestCtpDB.declararProduccion`): el tope del
   * 56 % y el cuadre paquetes = cantidad se validan una sola vez, no dos veces
   * con dos reglas que podrían divergir. Sin atribución a un `WoodEntry`
   * (`ForestCtpConsumo` queda vacío) — el libro admite el hueco; lo que no puede
   * es EMITIR CERTIFICADO de esta corrida, y `trazabilidadCompleta()` ya bloquea
   * eso solo.
   *
   * El lote nace `consumido` y ya queda enganchado a la corrida
   * (`produccionEntryId`): desde Producción se puede completar lo que falte del
   * margen del 56 % con la puerta que ya existe para "corridas a medio declarar"
   * (ADR-365) — no hace falta una segunda pantalla para eso.
   */
  static async crearInventario(tenantId: string, input: LoteInventarioInput) {
    if (!tenantId) throw new Error("tenantId is required");
    const especie = input.speciesCommon.trim();
    if (!especie) throw new CtpInvariantError("El lote necesita una especie.", "LOTE_SIN_ESPECIE");
    if (!(input.volumenConsumidoM3 > 0)) {
      throw new CtpInvariantError("El volumen consumido tiene que ser mayor a 0.", "LOTE_INVENTARIO_INVALIDO");
    }
    if (input.paquetes.length === 0) {
      throw new CtpInvariantError("Declará al menos un paquete de producción.", "LOTE_INVENTARIO_INVALIDO");
    }

    const code = await ForestLoteAserrioDB.codigoAUsar(tenantId, input.code);
    const piezas = input.paquetes.reduce((a, p) => a + Math.max(0, Math.round(p.cantidad)), 0);
    const volumenProducido = Math.round(input.paquetes.reduce((a, p) => a + Number(p.volumenM3 || 0), 0) * 10000) / 10000;
    const notas = [ORIGEN_LOTE_INVENTARIO, input.notes?.trim()].filter(Boolean).join(" · ");

    /* La corrida entra con su materia prima y sin declarar, igual que
       `consumirEnPatio`: si el paso siguiente falla, no queda un asiento a
       medio escribir en el libro. */
    const corrida = await ForestCtpDB.create(tenantId, {
      section: "produccion",
      entryDate: input.fecha,
      speciesCommon: especie,
      speciesScientific: input.speciesScientific?.trim() || null,
      volumeInputM3: input.volumenConsumidoM3,
      materiaPrimaRef: code,
      observations: notas,
      createdBy: input.createdBy,
    });

    try {
      const declarada = await ForestCtpDB.declararProduccion(
        tenantId,
        corrida.id,
        {
          quantity: volumenProducido,
          unit: "m3",
          pieces: piezas,
          productType: input.paquetes[0]?.productType ?? null,
          codigoProducto: input.paquetes[0]?.codigo ?? null,
          /* `declararProduccion` REEMPLAZA `observations` (no lo concatena):
             sin pasarla acá, queda en null y se pierde la marca de origen que
             `create()` recién puso — medido en vivo contra el tenant real. */
          observations: notas,
          paquetes: input.paquetes,
        },
        input.createdBy,
      );

      const lote = await prisma.forestLoteAserrio.create({
        data: {
          tenantId,
          code,
          speciesCommon: especie,
          speciesScientific: input.speciesScientific?.trim() || null,
          notes: notas.slice(0, 500),
          status: "consumido",
          fechaConsumo: input.fecha ?? new Date(),
          inicioProceso: input.fecha ?? null,
          finProceso: input.finProceso ?? null,
          produccionEntryId: corrida.id,
          createdBy: input.createdBy,
        },
      });

      auditCtp({
        tenantId,
        action: "ctp_lote_aserrio_inventario_create",
        entity: "ForestLoteAserrio",
        entityId: lote.id,
        detail:
          `Declaró el lote ${lote.code} como inventario: ${input.volumenConsumidoM3} m³ consumidos → ` +
          `${volumenProducido} m³ producidos en ${input.paquetes.length} paquete(s), sin trozas reales`,
        user: input.createdBy,
      });
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
      return { lote, corrida: declarada };
    } catch (e) {
      /* Nada quedó declarado de verdad: se retira la corrida para no dejar una
         línea fantasma en el libro por un intento fallido. */
      await ForestCtpDB.softDelete(tenantId, corrida.id, input.createdBy).catch((err) =>
        logger.error("[forestal.crearInventario] no se pudo retirar la corrida fallida", {
          corridaId: corrida.id,
          error: String(err),
        }),
      );
      throw e;
    }
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
        include: {
          _count: { select: { retrozos: true } },
          despachadaEn: { select: { status: true, deletedAt: true } },
          entry: { select: { status: true, deletedAt: true } },
        },
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
      include: {
        trozas: {
          select: {
            id: true, woodEntryId: true, volumenM3: true, consumidaEnId: true,
            noRecepcionada: true, descarte: true, _count: { select: { retrozos: true } },
            // Auditoría 2026-08-25: una troza reservada en el lote pudo salir
            // despachada en rollo (o su guía anularse) por otro camino antes
            // de que este lote entrara a la sierra — sin esto quedaba con
            // despachadaEnId Y consumidaEnId vivos a la vez, doble-contada.
            despachadaEn: { select: { status: true, deletedAt: true } },
            entry: { select: { status: true, deletedAt: true } },
          },
        },
      },
    });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");
    if (lote.status !== "abierto") {
      throw new CtpInvariantError(`El lote ${lote.code} ya está ${lote.status}.`, "LOTE_NO_EDITABLE", { status: lote.status });
    }
    const disponibles = lote.trozas.filter((t) => motivoNoElegible(t) === null);
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
      include: {
        trozas: {
          select: {
            id: true, volumenM3: true, consumidaEnId: true, especieCientifica: true,
            noRecepcionada: true, descarte: true, _count: { select: { retrozos: true } },
            despachadaEn: { select: { status: true, deletedAt: true } },
            entry: { select: { status: true, deletedAt: true } },
          },
        },
      },
    });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");
    /* El input de la corrida es lo que REALMENTE entra, no el lote entero: con
       un consumo parcial, declarar todo el lote como materia prima inflaría el
       denominador del rendimiento y rompería I1/I2 contra lo marcado. */
    const disponibles = lote.trozas.filter((t) => motivoNoElegible(t) === null);
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

    const r4 = (n: number) => Math.round(n * 10000) / 10000;

    // Todo lo que lee y después escribe `volumeInputM3` va en UNA transacción
    // con lock sobre la corrida ANTES de leerla (auditoría 2026-08-25): sin
    // esto, dos operadores sumando a la MISMA corrida a la vez calculan el
    // total sobre el mismo valor viejo y el que escribe último pisa al otro
    // — el mismo TOCTOU que `setConsumos`/`setOrigenes` ya blindaron con
    // `FOR UPDATE` cuando se reprodujo en una función hermana.
    const { corrida, lote, libres, delta, volumenPrevio, volumenTotal, seVacia } = await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          {
            id: string; lineNo: number; section: string; status: string;
            quantity: Prisma.Decimal | null; volumeInputM3: Prisma.Decimal | null;
            speciesCommon: string | null;
          }[]
        >`
          SELECT "id", "lineNo", "section", "status", "quantity", "volumeInputM3", "speciesCommon"
          FROM "ForestCtpEntry"
          WHERE "id" = ${corridaId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
          FOR UPDATE
        `;
        if (locked.length === 0) throw new CtpInvariantError("Esa corrida no existe.", "LOTE_NO_ENCONTRADO");
        const corrida = locked[0];
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

        const lote = await tx.forestLoteAserrio.findFirst({
          where: { id: loteId, tenantId, deletedAt: null },
          include: {
            trozas: {
              select: {
                id: true, woodEntryId: true, volumenM3: true, consumidaEnId: true,
                noRecepcionada: true, descarte: true, _count: { select: { retrozos: true } },
                despachadaEn: { select: { status: true, deletedAt: true } },
                entry: { select: { status: true, deletedAt: true } },
              },
            },
          },
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

        const delta = r4(libres.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
        const volumenPrevio = corrida.volumeInputM3 == null ? 0 : Number(corrida.volumeInputM3);
        const volumenTotal = r4(volumenPrevio + delta);

        // 1. El volumen primero (ver cabecera y ADR-364), todavía bajo lock.
        await tx.forestCtpEntry.update({ where: { id: corridaId }, data: { volumeInputM3: volumenTotal } });

        const disponibles = lote.trozas.filter((t) => motivoNoElegible(t) === null);
        const seVacia = libres.length >= disponibles.length;

        return { corrida, lote, libres, delta, volumenPrevio, volumenTotal, seVacia };
      },
    );

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

  /**
   * SACAR PIEZAS DE UNA CORRIDA ABIERTA (ADR-364, el reverso).
   *
   * Se marcaron seis y entraron cuatro. Hasta ahora la única salida era **anular
   * la corrida entera** —y con ella su número de línea, que en un libro no se
   * recicla— por dos piezas mal tildadas.
   *
   * El orden es el INVERSO de sumar, y por la misma razón: acá el volumen BAJA,
   * así que primero se baja la atribución (si no, `Σ atribuido ≤ declarado`
   * dejaría de valer un instante) y después el volumen.
   *
   * No se puede vaciar del todo: una corrida sin materia prima no es una
   * corrida, es una línea que había que anular.
   */
  static async quitarDeCorrida(
    tenantId: string,
    input: { corridaId: string; trozaIds: string[]; user: string },
  ): Promise<{ piezas: number; volumenM3: number; volumenTotalM3: number; lotesReabiertos: string[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const { corridaId, trozaIds, user } = input;
    if (trozaIds.length === 0) {
      throw new CtpInvariantError("No elegiste ninguna pieza para sacar.", "LOTE_NO_EDITABLE");
    }

    const r4 = (n: number) => Math.round(n * 10000) / 10000;

    // Mismo blindaje que sumarACorrida (auditoría 2026-08-25): lock + lectura
    // + escritura de volumeInputM3 en UNA transacción, antes de tocar la
    // atribución. Si `setConsumos` falla después, el catch de abajo restaura
    // el volumen — misma protección, orden invertido (acá se escribe primero
    // porque el lock tiene que cubrir la lectura Y la escritura del mismo
    // valor, no sólo una de las dos).
    const { corrida, salen, delta, volumenPrevio, volumenTotal } = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        {
          id: string; lineNo: number; section: string; status: string;
          quantity: Prisma.Decimal | null; volumeInputM3: Prisma.Decimal | null;
        }[]
      >`
        SELECT "id", "lineNo", "section", "status", "quantity", "volumeInputM3"
        FROM "ForestCtpEntry"
        WHERE "id" = ${corridaId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (locked.length === 0) throw new CtpInvariantError("Esa corrida no existe.", "LOTE_NO_ENCONTRADO");
      const corrida = locked[0];
      if (corrida.section !== "produccion" || corrida.status !== "registrado") {
        throw new CtpInvariantError(
          `La corrida N° ${corrida.lineNo} no está vigente: no se le tocan las piezas.`,
          "LOTE_NO_EDITABLE",
        );
      }
      if (corrida.quantity != null) {
        throw new CtpInvariantError(
          `La corrida N° ${corrida.lineNo} ya declaró su producción: sacarle materia prima le cambiaría el rendimiento. ` +
            "Anulala y rehacela si la carga estaba mal.",
          "LOTE_NO_EDITABLE",
        );
      }

      /* Las piezas de ESTA corrida y nada más: un id de otra sería sacar madera de
         un asiento que el operador no está mirando. */
      const suyas = await tx.woodEntryTroza.findMany({
        where: { tenantId, consumidaEnId: corridaId },
        select: { id: true, woodEntryId: true, volumenM3: true, loteAserrioId: true },
      });
      const pedidas = new Set(trozaIds);
      const salen = suyas.filter((t) => pedidas.has(t.id));
      if (salen.length === 0) {
        throw new CtpInvariantError(
          `Ninguna de esas piezas está en la corrida N° ${corrida.lineNo}.`,
          "LOTE_NO_EDITABLE",
        );
      }
      if (salen.length >= suyas.length) {
        throw new CtpInvariantError(
          `Sacarlas todas dejaría la corrida N° ${corrida.lineNo} sin materia prima. Si la carga estaba mal, anulala.`,
          "LOTE_NO_EDITABLE",
        );
      }

      const delta = r4(salen.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
      const volumenPrevio = corrida.volumeInputM3 == null ? 0 : Number(corrida.volumeInputM3);
      const volumenTotal = r4(volumenPrevio - delta);

      await tx.forestCtpEntry.update({ where: { id: corridaId }, data: { volumeInputM3: volumenTotal } });

      return { corrida, suyas, salen, delta, volumenPrevio, volumenTotal };
    });

    try {
      // 1. La atribución baja (ver cabecera) — el volumen ya está escrito arriba.
      const previos = await prisma.forestCtpConsumo.findMany({
        where: { tenantId, ctpEntryId: corridaId },
        select: { woodEntryId: true, volumeM3: true },
      });
      const porGuia = new Map(previos.map((c) => [c.woodEntryId, Number(c.volumeM3)]));
      for (const g of agruparPorGuia(
        salen.map((t) => ({
          id: t.id,
          woodEntryId: t.woodEntryId,
          codificacion: null,
          especieComun: null,
          volumenM3: t.volumenM3 == null ? null : Number(t.volumenM3),
        })),
      )) {
        porGuia.set(g.woodEntryId, r4(Math.max(0, (porGuia.get(g.woodEntryId) ?? 0) - g.volumenM3)));
      }
      const nuevos = [...porGuia.entries()]
        .filter(([, v]) => v > 0)
        .map(([woodEntryId, volumeM3]) => ({ woodEntryId, volumeM3 }));
      /**
       * La atribución podía estar puesta A MANO y no derivar de estas piezas
       * (`CtpAtribucionEditor`). Si al restar sigue pasándose del volumen que va a
       * quedar, bajar el volumen rompería I1 sin que nadie lo viera: se para acá y
       * se manda a corregir la atribución, que es donde está el desacuerdo.
       */
      const sumaNueva = r4(nuevos.reduce((a, c) => a + c.volumeM3, 0));
      if (sumaNueva > volumenTotal) {
        throw new CtpInvariantError(
          `La corrida N° ${corrida.lineNo} quedaría con ${volumenTotal} m³ y tiene ${sumaNueva} m³ atribuidos a sus guías. ` +
            "Corregí la atribución en la ficha de la corrida antes de sacar estas piezas.",
          "I1_SOBRE_ATRIBUCION",
        );
      }
      await ForestCtpConsumoDB.setConsumos(tenantId, corridaId, nuevos, user);
    } catch (e) {
      /* Nada salió de verdad: la corrida vuelve al volumen que tenía. */
      await prisma.forestCtpEntry
        .update({ where: { id: corridaId }, data: { volumeInputM3: volumenPrevio } })
        .catch((err) =>
          logger.error("[forestal.quitarDeCorrida] no se pudo restaurar volumeInputM3", {
            corridaId,
            volumenPrevio,
            error: String(err),
          }),
        );
      throw e;
    }

    // 3. Las piezas vuelven a estar libres, y su lote se reabre si se había
    //    cerrado por esta corrida: recuperó madera, así que ya no está consumido.
    const lotesTocados = [...new Set(salen.map((t) => t.loteAserrioId).filter((v): v is string => Boolean(v)))];
    const reabiertos: string[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.woodEntryTroza.updateMany({
        where: { id: { in: salen.map((t) => t.id) }, tenantId, consumidaEnId: corridaId },
        data: { consumidaEnId: null, fechaConsumo: null },
      });
      for (const loteId of lotesTocados) {
        const l = await tx.forestLoteAserrio.findFirst({
          where: { id: loteId, tenantId, deletedAt: null },
          select: { id: true, code: true, status: true, produccionEntryId: true },
        });
        if (l && l.status === "consumido" && l.produccionEntryId === corridaId) {
          await tx.forestLoteAserrio.update({
            where: { id: loteId },
            data: { status: "abierto", fechaConsumo: null, produccionEntryId: null },
          });
          reabiertos.push(l.code);
        }
      }
    });

    auditCtp({
      tenantId,
      action: "ctp_corrida_quitar_piezas",
      entity: "ForestCtpEntry",
      entityId: corridaId,
      detail:
        `Sacó ${salen.length} troza${salen.length === 1 ? "" : "s"} de la corrida N° ${corrida.lineNo}: ` +
        `${delta} m³ menos (de ${volumenPrevio} a ${volumenTotal} m³)` +
        (reabiertos.length > 0 ? ` · reabrió ${reabiertos.join(", ")}` : ""),
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }

    return { piezas: salen.length, volumenM3: delta, volumenTotalM3: volumenTotal, lotesReabiertos: reabiertos };
  }

  /**
   * CERRAR un lote que no va a terminar de aserrarse.
   *
   * Un lote parcial queda abierto esperando su corrida siguiente, y eso está
   * bien mientras la haya. Pero a veces no la hay: el resto se pudrió, se vendió
   * en rollo, o el pedido cambió y esas piezas van a otra especie de lote. Sin
   * esta puerta el lote quedaba abierto para siempre, ensuciando la lista de «lo
   * que espera la sierra» con trabajo que nadie va a hacer.
   *
   * Las piezas que quedan **vuelven al patio libres** —la madera no desaparece
   * con el lote— y el motivo queda en la auditoría: cerrar sin decir por qué es
   * exactamente lo que un fiscalizador no puede reconstruir.
   *
   * Distinto de `softDelete`, que BORRA el lote: éste lo conserva con sus
   * corridas y su historia. Un lote que ya produjo es parte del libro.
   */
  static async cerrar(
    tenantId: string,
    input: { loteId: string; motivo: string; user: string },
  ): Promise<{ code: string; liberadas: number; volumenM3: number; teniaCorridas: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const { loteId, motivo, user } = input;
    if (motivo.trim().length < 3) {
      throw new CtpInvariantError("Poné el motivo por el que se cierra el lote.", "LOTE_NO_EDITABLE");
    }

    const lote = await prisma.forestLoteAserrio.findFirst({
      where: { id: loteId, tenantId, deletedAt: null },
      include: { trozas: { select: { id: true, volumenM3: true, consumidaEnId: true } } },
    });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");
    if (lote.status !== "abierto") {
      throw new CtpInvariantError(
        `El lote ${lote.code} ya está ${lote.status}: no hay nada que cerrar.`,
        "LOTE_NO_EDITABLE",
        { status: lote.status },
      );
    }

    const libres = lote.trozas.filter((t) => !t.consumidaEnId);
    const consumidas = lote.trozas.length - libres.length;
    const volumenM3 = Math.round(libres.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000;

    await prisma.$transaction(async (tx) => {
      /* Sólo las libres: las que ya entraron a una corrida siguen atadas a ella
         —son un hecho del libro— y soltarlas negaría que se aserraron. */
      if (libres.length > 0) {
        await tx.woodEntryTroza.updateMany({
          where: { id: { in: libres.map((t) => t.id) }, tenantId, consumidaEnId: null },
          data: { loteAserrioId: null },
        });
      }
      await tx.forestLoteAserrio.update({
        where: { id: loteId },
        data: {
          status: "cerrado",
          fechaConsumo: consumidas > 0 ? (lote.fechaConsumo ?? new Date()) : lote.fechaConsumo,
          notes: [lote.notes?.trim(), `Cerrado: ${motivo.trim()}`].filter(Boolean).join(" · ").slice(0, 500),
        },
      });
    });

    auditCtp({
      tenantId,
      action: "ctp_lote_aserrio_cerrar",
      entity: "ForestLoteAserrio",
      entityId: loteId,
      detail:
        `Cerró el lote ${lote.code} con ${consumidas} pieza${consumidas === 1 ? "" : "s"} ya aserrada${consumidas === 1 ? "" : "s"}: ` +
        `${libres.length} troza${libres.length === 1 ? "" : "s"} (${volumenM3} m³) volvieron al patio · motivo: ${motivo.trim()}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }

    return { code: lote.code, liberadas: libres.length, volumenM3, teniaCorridas: consumidas > 0 };
  }

  /**
   * Vuelve a abrir un lote ya ASERRADO para seguirle cargando madera.
   *
   * Brandon, 2026-09-02: «no importa si ya se puso en trozas anteriores y se
   * consumieron o se produjeron, se podrá igual habilitar y poner más trozas a
   * ese mismo lote». Es cómo trabaja el aserradero de verdad: un lote es la
   * madera de una especie que entra a la sierra, y entra en varias tandas a lo
   * largo de la semana — no en un único acto.
   *
   * Qué NO toca, y por qué:
   *
   *  - Las piezas ya consumidas **siguen atadas a su corrida** (`consumidaEnId`
   *    intacto). Son un hecho del libro: soltarlas negaría que se aserraron y
   *    movería el rendimiento ya declarado. La corrida siguiente sólo podrá
   *    tomar las piezas nuevas, que es lo correcto.
   *  - `produccionEntryId` y `fechaConsumo` se conservan. `deshacer()` los
   *    limpia porque ahí la corrida dejó de existir; acá existe y sigue siendo
   *    de este lote ([[lote-aserrio-cerrar-deja-produccionentryid-null]]).
   *
   * Un lote **cerrado** no se reabre por acá: «cerrado» significa producido y
   * despachado, y su madera libre ya volvió al patio. Para ese caso el camino
   * es armar un lote nuevo, no revivir uno que el libro dio por terminado.
   */
  static async reabrir(
    tenantId: string,
    input: { loteId: string; user: string },
  ): Promise<{ code: string; piezasConsumidas: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const { loteId, user } = input;

    const lote = await prisma.forestLoteAserrio.findFirst({
      where: { id: loteId, tenantId, deletedAt: null },
      include: { trozas: { select: { id: true, consumidaEnId: true } } },
    });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");
    if (lote.status === "abierto") {
      throw new CtpInvariantError(
        `El lote ${lote.code} ya está abierto: se le pueden agregar piezas.`,
        "LOTE_NO_EDITABLE",
        { status: lote.status },
      );
    }
    if (lote.status === "cerrado") {
      throw new CtpInvariantError(
        `El lote ${lote.code} está cerrado: se produjo y se despachó. Armá un lote nuevo para esta madera.`,
        "LOTE_NO_EDITABLE",
        { status: lote.status },
      );
    }

    const piezasConsumidas = lote.trozas.filter((t) => t.consumidaEnId).length;
    await prisma.forestLoteAserrio.update({
      where: { id: loteId },
      data: { status: "abierto" },
    });

    auditCtp({
      tenantId,
      action: "ctp_lote_aserrio_reabrir",
      entity: "ForestLoteAserrio",
      entityId: loteId,
      detail:
        `Reabrió el lote ${lote.code} para seguir cargándolo · ` +
        `${piezasConsumidas} pieza${piezasConsumidas === 1 ? "" : "s"} ya aserrada${piezasConsumidas === 1 ? "" : "s"} siguen atadas a su corrida`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }

    return { code: lote.code, piezasConsumidas };
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

  /**
   * Edita la identidad/programación de un lote ya creado: código, especie,
   * orden de producción, tipo de producto a consumir, ventana del proceso y
   * nota (Brandon, 2026-08-31) — antes sólo se podía tocar la nota.
   *
   * La especie NO se toca si el lote ya tiene piezas adentro: L-A1 (una
   * especie por lote) está escrita contra las trozas que ya entraron, y
   * cambiarla dejaría al lote diciendo una madera distinta de la que tiene.
   */
  static async update(tenantId: string, loteId: string, cambios: LoteEditInput, user: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.forestLoteAserrio.findFirst({
      where: { id: loteId, tenantId, deletedAt: null },
      include: { _count: { select: { trozas: true } } },
    });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");

    const nuevaEspecie = cambios.speciesCommon?.trim();
    if (nuevaEspecie && nuevaEspecie.toLowerCase() !== lote.speciesCommon.trim().toLowerCase() && lote._count.trozas > 0) {
      throw new CtpInvariantError(
        `El lote ${lote.code} ya tiene ${lote._count.trozas} pieza${lote._count.trozas === 1 ? "" : "s"} de ${lote.speciesCommon}: no se le puede cambiar la especie.`,
        "LOTE_NO_EDITABLE",
      );
    }

    // Código vacío/ausente = no se pidió cambiarlo, no "borralo": un lote
    // siempre necesita uno.
    const codigoPedido = cambios.code?.trim();
    const code = codigoPedido ? await ForestLoteAserrioDB.codigoAUsar(tenantId, codigoPedido, loteId) : undefined;

    const actualizado = await prisma.forestLoteAserrio.update({
      where: { id: loteId },
      data: {
        ...(code !== undefined ? { code } : {}),
        ...(nuevaEspecie ? { speciesCommon: nuevaEspecie } : {}),
        ...(cambios.speciesScientific !== undefined ? { speciesScientific: cambios.speciesScientific?.trim() || null } : {}),
        ...(cambios.notes !== undefined ? { notes: cambios.notes?.trim() || null } : {}),
        ...(cambios.ordenProduccion !== undefined ? { ordenProduccion: cambios.ordenProduccion?.trim() || null } : {}),
        ...(cambios.tipoProductoConsumir !== undefined ? { tipoProductoConsumir: cambios.tipoProductoConsumir?.trim() || null } : {}),
        ...(cambios.inicioProceso !== undefined ? { inicioProceso: cambios.inicioProceso } : {}),
        ...(cambios.finProceso !== undefined ? { finProceso: cambios.finProceso } : {}),
      },
    });
    auditCtp({ tenantId, action: "ctp_lote_aserrio_update", entity: "ForestLoteAserrio", entityId: loteId, detail: `Editó el lote ${lote.code}`, user });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return actualizado;
  }

  /**
   * TODAS las corridas que alguna vez consumieron piezas de este lote —
   * `produccionEntryId` (la que lo cerró entero) ∪ lo que digan las piezas
   * (`consumidaEnId`), igual que la lista que arma `list()` para la ficha
   * (ADR-365).
   *
   * `cerrar()` NUNCA toca `produccionEntryId`: un lote consumido a medias
   * (`sumarACorrida` con sobras) y después cerrado con lo que quedó queda con
   * `produccionEntryId` en null PARA SIEMPRE, aunque ya tenga una corrida viva
   * comiéndole piezas. Mirar sólo `produccionEntryId` en `softDelete`/
   * `deshacerConProduccion` dejaba borrar ese lote soltando `consumidaEnId` de
   * piezas que una corrida todavía viva sigue contando como su materia prima
   * — el libro quedaba con una corrida sin origen sin que nadie lo pidiera.
   */
  private static async corridasQueConsumieron(tenantId: string, loteId: string, produccionEntryId: string | null) {
    const consumidas = await prisma.woodEntryTroza.findMany({
      where: { tenantId, loteAserrioId: loteId, consumidaEnId: { not: null } },
      select: { consumidaEnId: true },
      distinct: ["consumidaEnId"],
    });
    const ids = [
      ...new Set(
        [produccionEntryId, ...consumidas.map((t) => t.consumidaEnId)].filter((x): x is string => Boolean(x)),
      ),
    ];
    if (ids.length === 0) return [];
    return prisma.forestCtpEntry.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, lineNo: true, status: true, deletedAt: true },
    });
  }

  /**
   * DESHACER un lote consumido cuya corrida sigue viva (Brandon, 2026-08-31):
   * "eliminar el registro de producción" de un lote armado por error.
   *
   * `softDelete` ya deshace un lote cuya corrida se anuló POR OTRO LADO
   * (Producción → Anular la línea); esto hace las dos cosas en un solo paso
   * desde la propia pestaña de Lotes — pensado sobre todo para el modo
   * inventario, donde consumo y producción nacen juntos y un lote mal
   * declarado hoy no debería obligar a ir a otra pestaña a corregirlo.
   *
   * Se niega si ALGUNA de sus corridas vivas ya tiene despacho o reproceso
   * registrado: eso es madera que ya salió o se transformó de nuevo, y anular
   * la corrida debajo de un hecho posterior dejaría el libro sin poder
   * explicar de dónde salió lo que ya se fue.
   */
  static async deshacerConProduccion(
    tenantId: string,
    input: { loteId: string; motivo: string; user: string; forzar?: boolean },
  ): Promise<{ code: string; corridaAnulada: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const { loteId, motivo, user, forzar = false } = input;
    if (motivo.trim().length < 3) {
      throw new CtpInvariantError("Poné el motivo por el que se deshace el lote.", "LOTE_NO_EDITABLE");
    }
    const lote = await prisma.forestLoteAserrio.findFirst({ where: { id: loteId, tenantId, deletedAt: null } });
    if (!lote) throw new CtpInvariantError("Ese lote no existe.", "LOTE_NO_ENCONTRADO");

    const corridas = await ForestLoteAserrioDB.corridasQueConsumieron(tenantId, loteId, lote.produccionEntryId);
    const vivas = corridas.filter((c) => c.deletedAt == null && c.status !== "anulado");

    let corridaAnulada = false;
    if (vivas.length > 0) {
      const conSalida = (
        await Promise.all(
          vivas.map(async (c) => {
            const [despachado, reprocesado] = await Promise.all([
              prisma.forestCtpDespachoOrigen.aggregate({
                where: { tenantId, produccionEntryId: c.id, despacho: { deletedAt: null, status: "registrado" } },
                _sum: { quantity: true },
              }),
              prisma.forestCtpReproceso.aggregate({
                where: { tenantId, origenEntryId: c.id, destino: { deletedAt: null, status: "registrado" } },
                _sum: { quantity: true },
              }),
            ]);
            const tieneSalida = Number(despachado._sum.quantity ?? 0) > 0 || Number(reprocesado._sum.quantity ?? 0) > 0;
            return tieneSalida ? c : null;
          }),
        )
      ).filter((c): c is NonNullable<typeof c> => c !== null);

      if (conSalida.length > 0 && !forzar) {
        throw new CtpInvariantError(
          `La corrida N° ${conSalida.map((c) => c.lineNo).join(", ")} del lote ${lote.code} ya tiene despacho o reproceso registrado: confirmá "forzar" para eliminarlo igual — el despacho ya hecho queda sin corrida de origen.`,
          "LOTE_CON_SALIDA_REGISTRADA",
        );
      }
      // Misma puerta que "Anular la línea" en Producción: deja cada corrida en
      // el libro con su motivo, en vez de borrarla — es lo que un fiscalizador
      // tiene que poder encontrar después. Forzado con salida ya registrada,
      // el motivo lo dice explícito: es la diferencia entre "se corrigió a
      // tiempo" y "se borró con ventas ya hechas".
      const conSalidaIds = new Set(conSalida.map((c) => c.id));
      for (const c of vivas) {
        await ForestCtpDB.annul(
          tenantId,
          c.id,
          conSalidaIds.has(c.id) ? `${motivo.trim()} · FORZADO: la corrida ya tenía despacho/reproceso registrado` : motivo.trim(),
          user,
        );
      }
      corridaAnulada = true;
    }

    await ForestLoteAserrioDB.softDelete(tenantId, loteId, user);
    return { code: lote.code, corridaAnulada };
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
     * Un lote consumido está en el libro y no se toca… salvo que TODAS las
     * corridas que se lo comieron ya no existan (se anularon o se borraron).
     * Ahí esa madera volvió al patio y el lote es un puntero a algo muerto: es
     * la misma regla que el resto del libro aplica a las trozas —mirar el
     * ESTADO de la corrida, no el id pelado— y sin esto el lote quedaba
     * trabado para siempre.
     */
    const corridasVivas =
      lote.status !== "abierto"
        ? (await ForestLoteAserrioDB.corridasQueConsumieron(tenantId, loteId, lote.produccionEntryId)).filter(
            (c) => c.deletedAt == null && c.status !== "anulado",
          )
        : [];
    if (corridasVivas.length > 0) {
      throw new CtpInvariantError(
        `El lote ${lote.code} ya se consumió en ${corridasVivas.length === 1 ? "una corrida viva" : "corridas vivas"} (N° ${corridasVivas.map((c) => c.lineNo).join(", ")}): anulalas primero.`,
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
