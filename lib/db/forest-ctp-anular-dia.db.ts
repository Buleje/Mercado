import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import {
  AnularDiaError,
  bloqueosDe,
  corridasBloqueadas,
  motivoDeLaLinea,
  renglonesDeBloqueo,
  resumenParaConfirmar,
  type AnularDiaInput,
  type HechosDeCorrida,
  type PreviaAnularDia,
  type RespuestaAnularDia,
} from "@/lib/forestal/anular-dia-produccion";
import { CTP_TX_OPTS } from "./forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { ForestCtpDB } from "./forest-ctp.db";

/**
 * ForestCtpAnularDiaDB — anular TODAS las corridas de producción de un día, en
 * una transacción (Brandon, 2026-09-23: «eliminar esa cubicación de ese día»).
 *
 * Reglas y redacción en `lib/forestal/anular-dia-produccion.ts`. Acá:
 *
 *  1. `previa` junta lo que se va a anular (con los MISMOS números que el
 *     casillero: salen de `ForestCtpDB.jornadasDeProduccion`) y lo que lo
 *     impide, para decirlo ANTES de pedir confirmación.
 *  2. `anular` repite todo dentro de la transacción, con las corridas del día
 *     bloqueadas (`FOR UPDATE`, ordenadas por id): si entre la previa y el clic
 *     alguien cobró el aserrío o agregó una corrida, eso se ve acá y no se anula
 *     nada. Cada línea se anula con `ForestCtpDB.anularLineaEn`, la misma
 *     escritura que el botón «Anular» de una fila.
 */

const CACHE_LIBRO = "forest-ctp";

type Cliente = Pick<
  Prisma.TransactionClient,
  "forestCtpEntry" | "forestLoteAserrio" | "forestCuentaMov"
>;

/** El día `YYYY-MM-DD` como rango UTC de `entryDate` (las fechas del libro son date-only). */
function rangoDelDia(dia: string): { gte: Date; lt: Date } {
  const gte = new Date(`${dia}T00:00:00.000Z`);
  return { gte, lt: new Date(gte.getTime() + 86_400_000) };
}

const DONDE_VIVA = { section: "produccion", status: "registrado", deletedAt: null } as const;

/** Lo que cuelga de cada corrida, con el cliente que se pase (la tx o `prisma`). */
async function hechosDe(
  db: Cliente,
  tenantId: string,
  ids: readonly string[],
): Promise<HechosDeCorrida[]> {
  if (ids.length === 0) return [];
  const [filas, lotes, cargos] = await Promise.all([
    db.forestCtpEntry.findMany({
      where: { tenantId, id: { in: [...ids] } },
      select: {
        id: true,
        lineNo: true,
        speciesCommon: true,
        consumos: { select: { volumeM3: true, congeladoAt: true } },
        _count: { select: { trozasConsumidas: true, reprocesosEntrada: true } },
        /* Sólo lo VIVO del otro lado: un despacho o un reproceso anulado ya no
           tiene esta madera (los guards miran el estado, no el id pelado). */
        reprocesosSalida: {
          where: { destino: { deletedAt: null, status: "registrado" } },
          select: { destino: { select: { lineNo: true } } },
        },
        salidas: {
          where: { despacho: { deletedAt: null, status: "registrado" } },
          select: { despacho: { select: { lineNo: true, gtfNumber: true } } },
        },
        loteMiembros: { where: { lote: { deletedAt: null } }, select: { id: true } },
        apartados: { where: { liberadoAt: null }, select: { para: true } },
      },
      orderBy: { lineNo: "asc" },
    }),
    db.forestLoteAserrio.findMany({
      where: { tenantId, produccionEntryId: { in: [...ids] }, deletedAt: null },
      select: { produccionEntryId: true, code: true },
    }),
    db.forestCuentaMov.findMany({
      where: { tenantId, ctpEntryId: { in: [...ids] }, deletedAt: null },
      select: { ctpEntryId: true, monto: true, parteNombre: true },
    }),
  ]);
  return filas.map((f) => {
    const cargo = cargos.find((c) => c.ctpEntryId === f.id);
    return {
      id: f.id,
      lineNo: f.lineNo,
      especie: f.speciesCommon,
      consumoM3: f.consumos.reduce((a, c) => a + Number(c.volumeM3), 0),
      consumoCongelado: f.consumos.some((c) => c.congeladoAt != null),
      trozas: f._count.trozasConsumidas,
      reprocesosEntrada: f._count.reprocesosEntrada,
      reprocesadaEn: f.reprocesosSalida.map((r) => r.destino.lineNo),
      despachos: f.salidas.map((s) => ({ lineNo: s.despacho.lineNo, gtf: s.despacho.gtfNumber })),
      lotesComerciales: f.loteMiembros.length,
      lotesAserrio: lotes.filter((l) => l.produccionEntryId === f.id).map((l) => l.code),
      apartados: f.apartados.map((a) => a.para),
      cargoAserrio: cargo
        ? { monto: Number(cargo.monto), parte: cargo.parteNombre || "un tercero" }
        : null,
    };
  });
}

export const ForestCtpAnularDiaDB = {
  /** Qué se anularía el `dia` y qué lo impide. No escribe nada. */
  async previa(tenantId: string, dia: string): Promise<PreviaAnularDia> {
    if (!tenantId) throw new Error("tenantId is required");
    const rango = rangoDelDia(dia);
    const [vivas, jornadas] = await Promise.all([
      prisma.forestCtpEntry.findMany({
        where: { tenantId, ...DONDE_VIVA, entryDate: rango },
        select: { id: true, entryDate: true },
      }),
      ForestCtpDB.jornadasDeProduccion(tenantId, { desde: dia, hasta: dia }, "produccion"),
    ]);
    const jornada = jornadas.find((j) => j.dia === dia);
    const [hechos, cerrado] = await Promise.all([
      hechosDe(
        prisma,
        tenantId,
        vivas.map((v) => v.id),
      ),
      vivas[0]
        ? ForestCtpCierreDB.closedPeriodOf(tenantId, vivas[0].entryDate)
        : Promise.resolve(null),
    ]);
    return {
      dia,
      periodoCerrado: cerrado?.label ?? null,
      corridas: hechos.map((h) => ({
        id: h.id,
        lineNo: h.lineNo,
        especie: h.especie,
        bloqueos: bloqueosDe(h),
      })),
      total: {
        corridas: jornada?.corridas ?? 0,
        pt: jornada?.pt ?? 0,
        m3: jornada?.m3 ?? 0,
        piezas: jornada?.piezas ?? 0,
      },
      duenos: (jornada?.detalle?.duenos ?? []).map((d) => d.etiqueta),
    };
  },

  /**
   * Anula las corridas del día: todas o ninguna.
   *
   * `input.ids` son las que la pantalla mostró al confirmar; si el día tiene
   * otras (o le falta alguna), no se anula lo que nadie vio.
   */
  async anular(
    tenantId: string,
    input: AnularDiaInput,
    user = "unknown",
  ): Promise<RespuestaAnularDia> {
    if (!tenantId) throw new Error("tenantId is required");
    const usuario = user?.trim() || "unknown";
    const rango = rangoDelDia(input.dia);
    const etiqueta = etiquetaLarga(input.dia);

    /* El mes cerrado es un acta (ADR-139): antes de abrir nada. */
    const primera = await prisma.forestCtpEntry.findFirst({
      where: { tenantId, ...DONDE_VIVA, entryDate: rango },
      select: { entryDate: true },
    });
    if (!primera) {
      throw new AnularDiaError(
        "SIN_CORRIDAS",
        `El ${etiqueta} ya no tiene corridas vivas: no hay nada que anular.`,
      );
    }
    const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, primera.entryDate);
    if (cerrado) {
      throw new AnularDiaError(
        "PERIODO_CERRADO",
        `El período ${cerrado.label} está cerrado: no se anulan líneas de un mes cerrado. Reábrelo en Cierre para corregir.`,
        { periodKey: cerrado.periodKey },
      );
    }

    /* Los números del resumen, antes de anular: después el día ya no los tiene. */
    const [jornada] = await ForestCtpDB.jornadasDeProduccion(
      tenantId,
      { desde: input.dia, hasta: input.dia },
      "produccion",
    );

    const anuladas = await prisma.$transaction(async (tx) => {
      /* 1 · Las corridas vivas del día, bloqueadas y en orden de id: dos pedidos
         a la vez (o un cobro de aserrío, que también bloquea la corrida) esperan
         su turno en el mismo orden y no se abrazan. Placeholders, nunca
         interpolación (regla 11). */
      const vivas = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "ForestCtpEntry"
        WHERE "tenantId" = ${tenantId} AND "section" = 'produccion' AND "status" = 'registrado'
          AND "deletedAt" IS NULL AND "entryDate" >= ${rango.gte} AND "entryDate" < ${rango.lt}
        ORDER BY "id"
        FOR UPDATE
      `;
      const hoy = new Set(vivas.map((v) => v.id));
      const pedidas = new Set(input.ids);
      if (hoy.size !== pedidas.size || [...pedidas].some((id) => !hoy.has(id))) {
        throw new AnularDiaError(
          "DIA_CAMBIO",
          `El ${etiqueta} cambió desde que lo abriste (ahora tiene ${hoy.size} ${hoy.size === 1 ? "corrida" : "corridas"}, confirmaste ${pedidas.size}). Vuelve a mirarlo antes de anular.`,
          { ahora: hoy.size, confirmadas: pedidas.size },
        );
      }

      /* 2 · Lo que cuelga, releído con las filas ya bloqueadas. */
      const hechos = await hechosDe(tx, tenantId, [...hoy]);
      const bloqueadas = corridasBloqueadas({
        corridas: hechos.map((h) => ({
          id: h.id,
          lineNo: h.lineNo,
          especie: h.especie,
          bloqueos: bloqueosDe(h),
        })),
      });
      if (bloqueadas.length > 0) {
        throw new AnularDiaError(
          "CON_MOVIMIENTOS",
          `No se anuló nada del ${etiqueta}. ${bloqueadas.length === 1 ? "Una corrida tiene" : `${bloqueadas.length} corridas tienen`} movimientos que no se deshacen en bloque:\n` +
            renglonesDeBloqueo(bloqueadas).join("\n"),
          { corridas: bloqueadas },
        );
      }

      /* 3 · La misma escritura que anular una fila, una por una, en la tx. */
      const motivo = motivoDeLaLinea(input.motivo, etiqueta, hoy.size);
      const hechas: RespuestaAnularDia["anuladas"] = [];
      for (const h of [...hechos].sort((a, b) => a.id.localeCompare(b.id))) {
        const e = await ForestCtpDB.anularLineaEn(tx, tenantId, h.id, motivo);
        hechas.push({ id: e.id, lineNo: e.lineNo, especie: e.speciesCommon });
      }
      return hechas.sort((a, b) => a.lineNo - b.lineNo);
    }, CTP_TX_OPTS);

    const total = {
      corridas: jornada?.corridas ?? anuladas.length,
      pt: jornada?.pt ?? 0,
      m3: jornada?.m3 ?? 0,
      piezas: jornada?.piezas ?? 0,
    };
    const resumen = resumenParaConfirmar({
      total,
      duenos: (jornada?.detalle?.duenos ?? []).map((d) => d.etiqueta),
    });
    /* Una entrada por línea —como anular de a una: el fiscalizador busca por
       corrida— con el día y el total, para que se lea como un solo acto. */
    for (const a of anuladas) {
      auditCtp({
        tenantId,
        action: "ctp_linea_annul",
        entity: "ForestCtpEntry",
        entityId: a.id,
        detail: `Anuló la línea #${a.lineNo} de produccion (${a.especie ?? "sin especie"}) junto con el resto del ${etiqueta} · ${resumen} · motivo: ${input.motivo.trim()}`,
        user: usuario,
      });
    }
    try {
      invalidateByPrefix(`${CACHE_LIBRO}:${tenantId}`);
    } catch (err) {
      logger.error("[ctp.anular-dia] no se pudo invalidar la caché del libro", {
        error: String(err),
        tenantId,
      });
    }
    return { dia: input.dia, anuladas, total };
  },
};
