import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { limaDateKey } from "@/lib/utils";
import { ingresoDeLaTroza } from "@/lib/forestal/recepcion-antes-de-la-sierra";
import type { FilaLoteExcel } from "@/lib/forestal/lote-desde-excel";
import {
  cruzarLote,
  fechaFueraDeRango,
  type CandidataLote,
  type CruceLote,
  type LoteExistente,
  type ResultadoImportarLote,
} from "@/lib/forestal/lote-desde-excel-cruce";
import type { CambioMedidaTroza } from "@/lib/forestal/medidas-troza";
import { CtpInvariantError } from "./forest-ctp-consumo.db";
import { ForestContratoDB } from "./forest-contrato.db";
import { ForestLoteAserrioDB, motivoNoElegible } from "./forest-lote-aserrio.db";
import { WoodEntriesDB } from "./wood-entries.db";

/**
 * Un lote de aserrío importado del Excel del SNIFFS, ya consumido (Brandon
 * 27-10). Dos pasos con el MISMO cruce (`cruzarLote`):
 *
 *  · `cruzar` — la vista previa: qué troza del libro es cada fila y si entra;
 *  · `importar` — vuelve a cruzar (la pantalla no decide nada), abre el lote
 *    (o suma al que ya estaba programado con ese N°) y lo consume con
 *    `consumirEnPatio`, que mira todo de nuevo bajo lock: T1, una especie,
 *    un permiso, T3, mes cerrado. Todo o nada (`exigirTodas`): si una troza no
 *    entra, no se consume ninguna y el lote recién abierto se retira.
 *
 * Después, los D1/D2 que el libro no tenía se completan con los del Excel
 * (`guardarMedidasTrozas` con `fuente: "archivo"`: sólo puntas vacías, nunca
 * se pisa un dato). Eso no frena el consumo: si no se guardan, se dice.
 */

/** Tope de filas por lote: una lista del SNIFFS entera, no el patio de un año. */
export const MAX_FILAS_LOTE_EXCEL = 500;

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export class ForestLoteImportarDB {
  /** La vista previa del lote: qué troza del libro es cada fila y si puede entrar. */
  static async cruzar(
    tenantId: string,
    filas: readonly FilaLoteExcel[],
    code: string | null,
  ): Promise<CruceLote> {
    if (!tenantId) throw new Error("tenantId is required");
    const variantes = (xs: (string | null)[]) => {
      const s = new Set<string>();
      for (const x of xs) {
        const t = (x ?? "").trim();
        if (t) {
          s.add(t);
          s.add(t.toUpperCase());
        }
      }
      return [...s];
    };
    const plantas = variantes(filas.map((f) => f.codigoPlanta));
    const codigos = variantes(filas.map((f) => f.codigoTroza));
    const gtfs = variantes(filas.map((f) => f.gtf));

    const [trozas, lote] = await Promise.all([
      plantas.length === 0 && (codigos.length === 0 || gtfs.length === 0)
        ? Promise.resolve([])
        : prisma.woodEntryTroza.findMany({
            where: {
              tenantId,
              /* Las piezas de una guía anulada no son candidatas: si la guía se
                 volvió a registrar, contarlas haría «ambigua» a cada troza. */
              entry: { deletedAt: null, status: { notIn: ["anulado", "rechazado"] } },
              OR: [
                ...(plantas.length > 0 ? [{ codigoPlanta: { in: plantas } }] : []),
                ...(codigos.length > 0 && gtfs.length > 0
                  ? [{ codificacion: { in: codigos }, entry: { gtfNumber: { in: gtfs } } }]
                  : []),
              ],
            },
            select: {
              id: true,
              codigoPlanta: true,
              codificacion: true,
              especieComun: true,
              especieCientifica: true,
              volumenM3: true,
              d1Cm: true,
              d2Cm: true,
              largoM: true,
              consumidaEnId: true,
              noRecepcionada: true,
              descarte: true,
              fechaRecepcion: true,
              _count: { select: { retrozos: true } },
              despachadaEn: { select: { status: true, deletedAt: true } },
              loteMixto: { select: { code: true, status: true, deletedAt: true } },
              loteAserrio: { select: { id: true, code: true, deletedAt: true } },
              entry: {
                select: {
                  status: true,
                  deletedAt: true,
                  fechaRecepcion: true,
                  gtfNumber: true,
                  entryDate: true,
                  originCode: true,
                },
              },
            },
            take: MAX_FILAS_LOTE_EXCEL * 4,
          }),
      code?.trim()
        ? prisma.forestLoteAserrio.findFirst({
            where: { tenantId, code: code.trim(), deletedAt: null },
            select: {
              id: true,
              code: true,
              status: true,
              speciesCommon: true,
              permiso: true,
              trozas: { where: { consumidaEnId: null }, select: { id: true } },
            },
          })
        : Promise.resolve(null),
    ]);

    const candidatas: CandidataLote[] = trozas.map((t) => ({
      id: t.id,
      codigoPlanta: t.codigoPlanta,
      codificacion: t.codificacion,
      gtf: t.entry.gtfNumber,
      especieComun: t.especieComun,
      especieCientifica: t.especieCientifica,
      permiso: t.entry.originCode?.trim() || null,
      volumenM3: num(t.volumenM3),
      d1Cm: num(t.d1Cm),
      d2Cm: num(t.d2Cm),
      largoM: num(t.largoM),
      lote:
        t.loteAserrio && !t.loteAserrio.deletedAt
          ? { id: t.loteAserrio.id, code: t.loteAserrio.code }
          : null,
      motivo: motivoNoElegible(t),
      ingresoDia:
        ingresoDeLaTroza({
          id: t.id,
          codigo: t.codigoPlanta ?? t.codificacion,
          gtf: t.entry.gtfNumber,
          fechaRecepcionTroza: t.fechaRecepcion,
          fechaRecepcionGuia: t.entry.fechaRecepcion,
          fechaAsientoGuia: t.entry.entryDate,
        })?.dia ?? null,
    }));
    const existente: LoteExistente | null = lote
      ? {
          id: lote.id,
          code: lote.code,
          status: lote.status,
          especie: lote.speciesCommon,
          permiso: lote.permiso,
          libres: lote.trozas.map((t) => t.id),
        }
      : null;
    const cruce = cruzarLote(filas, candidatas, existente);
    /* Un permiso que no está cargado se guarda como texto y el lote queda fuera
       de «Solo este permiso»: se dice antes de importar. */
    if (cruce.permiso && !existente && !(await ForestContratoDB.idPorCodigo(tenantId, cruce.permiso))) {
      cruce.avisos.push(
        `El permiso ${cruce.permiso} no está en tus permisos: el lote lo guarda como texto. Créalo desde el detalle del lote para enlazarlo.`,
      );
    }
    return cruce;
  }

  /**
   * Abre (o completa) el lote y lo consume en `fecha` (`AAAA-MM-DD`, el día
   * que el SNIFFS lo pasó a consumo). La corrida queda «producción por
   * declarar», como cualquier lote consumido en el patio.
   */
  static async importar(
    tenantId: string,
    input: { code: string | null; fecha: string; filas: readonly FilaLoteExcel[]; user: string },
  ): Promise<ResultadoImportarLote> {
    if (!tenantId) throw new Error("tenantId is required");
    const { code, fecha, filas, user } = input;
    const cruce = await ForestLoteImportarDB.cruzar(tenantId, filas, code);
    if (cruce.bloqueos.length > 0 || !cruce.especie) {
      throw new CtpInvariantError(
        cruce.bloqueos[0] ?? "Las trozas no tienen especie en el libro.",
        "LOTE_NO_EDITABLE",
        {
          bloqueos: cruce.bloqueos,
        },
      );
    }
    const fuera = fechaFueraDeRango(fecha, cruce.fechaMinima, limaDateKey());
    if (fuera)
      throw new CtpInvariantError(fuera, "T3_ASERRADA_ANTES_DE_LLEGAR", {
        fechaMinima: cruce.fechaMinima,
      });

    const entran = cruce.filas.filter(
      (f) => f.trozaId && (f.estado === "entra" || f.estado === "ya-en-el-lote"),
    );
    const trozaIds = entran.map((f) => f.trozaId!);
    /* Mediodía UTC: a medianoche, Lima lo correría al día anterior. */
    const dia = new Date(`${fecha}T12:00:00.000Z`);

    const existente = cruce.existente;
    const lote = existente
      ? { id: existente.id, code: existente.code }
      : await ForestLoteAserrioDB.create(tenantId, {
          code,
          speciesCommon: cruce.especie.comun,
          speciesScientific: cruce.especie.cientifica,
          permiso: cruce.permiso,
          tipoProductoConsumir: "rolliza",
          inicioProceso: dia,
          notes: `Importado del SNIFFS (Excel): ${trozaIds.length} troza${trozaIds.length === 1 ? "" : "s"}`,
          createdBy: user,
        });

    let consumo: Awaited<ReturnType<typeof ForestLoteAserrioDB.consumirEnPatio>>;
    try {
      consumo = await ForestLoteAserrioDB.consumirEnPatio(tenantId, {
        loteId: lote.id,
        trozaIds,
        fecha: dia,
        observaciones: `Consumo del lote ${lote.code} importado del SNIFFS · producción por declarar`,
        user,
        exigirTodas: true,
      });
    } catch (e) {
      /* `consumirEnPatio` aparta las piezas en el lote ANTES de abrir la
         corrida: si después falla (mes cerrado, T3, una carrera), quedan en el
         lote sin consumir. El lote que abrió ESTE pedido se retira entero (sus
         piezas vuelven al patio); a uno que ya existía se le sacan sólo las
         que agregó este pedido — las que ya tenía siguen donde estaban. */
      if (!existente) {
        await ForestLoteAserrioDB.softDelete(tenantId, lote.id, user).catch((err) =>
          logger.error("[forestal.importarLote] no se pudo retirar el lote fallido", {
            loteId: lote.id,
            error: String(err),
          }),
        );
      } else {
        for (const f of entran.filter((x) => x.estado === "entra")) {
          await ForestLoteAserrioDB.quitarTroza(tenantId, lote.id, f.trozaId!, user).catch((err) =>
            logger.error("[forestal.importarLote] no se pudo sacar la troza del lote", {
              loteId: lote.id,
              trozaId: f.trozaId,
              error: String(err),
            }),
          );
        }
      }
      throw e;
    }

    const medidas = await ForestLoteImportarDB.completarMedidas(tenantId, entran, user);
    auditCtp({
      tenantId,
      action: "ctp_lote_importado_sniffs",
      entity: "ForestLoteAserrio",
      entityId: lote.id,
      detail:
        `${existente ? "Completó" : "Abrió"} el lote ${lote.code} desde el Excel del SNIFFS · ${consumo.piezas} trozas · ` +
        `${consumo.volumenM3} m³ consumidos el ${fecha} (corrida N° ${consumo.corrida.lineNo})` +
        (medidas.guardadas > 0 ? ` · D1/D2 de ${medidas.guardadas} trozas` : ""),
      user,
    });
    return {
      lote: { id: lote.id, code: lote.code },
      corrida: consumo.corrida,
      piezas: consumo.piezas,
      volumenM3: consumo.volumenM3,
      sumadoAExistente: Boolean(existente),
      medidas,
    };
  }

  /** Las puntas vacías que trae el Excel. No frena nada: lo que no se guarda, se cuenta. */
  private static async completarMedidas(
    tenantId: string,
    filas: readonly {
      trozaId: string | null;
      completaD1: number | null;
      completaD2: number | null;
    }[],
    user: string,
  ): Promise<{ guardadas: number; rechazadas: number }> {
    const cambios: CambioMedidaTroza[] = filas
      .filter((f) => f.trozaId && (f.completaD1 != null || f.completaD2 != null))
      .map((f) => ({
        id: f.trozaId!,
        ...(f.completaD1 != null ? { d1Cm: f.completaD1 } : {}),
        ...(f.completaD2 != null ? { d2Cm: f.completaD2 } : {}),
      }));
    if (cambios.length === 0) return { guardadas: 0, rechazadas: 0 };
    try {
      const r = await WoodEntriesDB.guardarMedidasTrozas(tenantId, cambios, user, {
        fuente: "archivo",
      });
      const rechazadas = new Set(r.rechazadas.map((x) => x.id)).size;
      return { guardadas: cambios.length - rechazadas, rechazadas };
    } catch (err) {
      logger.error("[forestal.importarLote] no se guardaron los D1/D2 del Excel", {
        error: String(err),
      });
      return { guardadas: 0, rechazadas: cambios.length };
    }
  }
}
