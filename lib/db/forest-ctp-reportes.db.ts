/**
 * ForestCtpReportesDB — lo que lee el apartado «Reportes» del Libro CTP.
 *
 * Sólo lectura. Trae las corridas de producción de un rango y las traduce a la
 * forma que entiende `armarReporte` (pura y probada, en
 * `lib/forestal/reportes-produccion.ts`): la cuenta NO vive acá, para que el
 * reporte, la tira de días y el resumen de jornadas sumen igual.
 *
 * Mismos predicados que la tira (`ForestCtpDB.jornadasDeProduccion`):
 * sección `produccion`, `status: registrado`, `deletedAt: null`, rango con
 * `lt` del día siguiente (un asiento a las 00:00 de Lima es 05:00 UTC).
 *
 * Sin caché de servidor a propósito: las rutas vecinas del tablero
 * (`/ctp/movimiento`) tampoco lo tienen, y los escritores del libro no
 * invalidan un prefijo común a todos — un reporte que no ve la corrida recién
 * anotada se lee como «no se guardó». El navegador ya deduplica con `ctpGet`.
 */

import { prisma } from "@/lib/prisma";
import { SIN_DUENO, piezasDeLaCorrida } from "@/lib/forestal/detalle-de-jornada";
import { esDuenoMadera, etiquetaDeDueno } from "@/lib/forestal/dueno-de-la-madera";
import {
  armarReporte,
  rangoALeer,
  resolverPeriodo,
  type AgrupacionReporte,
  type CorridaDelReporte,
  type FiltrosReporte,
  type PeriodoReporte,
  type ReporteDeProduccion,
} from "@/lib/forestal/reportes-produccion";

/** Dos años de una planta que asierra todos los días entran de sobra. */
const TOPE_CORRIDAS = 6000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface ConsultaDeReporte {
  periodo: PeriodoReporte;
  agrupacion: AgrupacionReporte;
  filtros: FiltrosReporte;
}

export class ForestCtpReportesDB {
  /**
   * Las corridas de producción de `[desde, hasta]`, ya traducidas.
   *
   * Si pasan del tope se quedan las MÁS NUEVAS (se leen al revés y se dan
   * vuelta): cortar lo reciente escondería justo la semana que se mira.
   */
  static async corridasDeProduccion(
    tenantId: string,
    rango: { desde: string; hasta: string },
  ): Promise<{ corridas: CorridaDelReporte[]; truncado: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!ISO.test(rango.desde) || !ISO.test(rango.hasta)) return { corridas: [], truncado: false };
    const gte = new Date(`${rango.desde}T00:00:00.000Z`);
    const lt = new Date(new Date(`${rango.hasta}T00:00:00.000Z`).getTime() + 86_400_000);
    if (!Number.isFinite(gte.getTime()) || !Number.isFinite(lt.getTime()) || lt <= gte) {
      return { corridas: [], truncado: false };
    }

    const filas = await prisma.forestCtpEntry.findMany({
      where: {
        tenantId,
        section: "produccion",
        status: "registrado",
        deletedAt: null,
        entryDate: { gte, lt },
      },
      select: {
        entryDate: true,
        lineNo: true,
        speciesCommon: true,
        duenoMadera: true,
        titularNombre: true,
        originCode: true,
        quantity: true,
        unit: true,
        pieces: true,
        volumeInputM3: true,
        paquetes: { where: { deletedAt: null }, select: { cantidad: true } },
      },
      orderBy: [{ entryDate: "desc" }, { lineNo: "desc" }],
      take: TOPE_CORRIDAS + 1,
    });

    const truncado = filas.length > TOPE_CORRIDAS;
    const corridas = filas
      .slice(0, TOPE_CORRIDAS)
      .reverse()
      .map((f): CorridaDelReporte => {
        const enM3 = !f.unit || f.unit === "m3";
        const entrada = Number(f.volumeInputM3 ?? 0);
        return {
          dia: f.entryDate.toISOString().slice(0, 10),
          lineNo: f.lineNo,
          especie: f.speciesCommon,
          /* La misma etiqueta que la tira y el resumen de jornadas: con ella se
             eligen los dueños, tiene que coincidir letra a letra. */
          dueno:
            etiquetaDeDueno({
              dueno: esDuenoMadera(f.duenoMadera) ? f.duenoMadera : null,
              titularNombre: f.titularNombre,
            }) ?? SIN_DUENO,
          permiso: f.originCode,
          m3: enM3 ? Number(f.quantity ?? 0) || 0 : 0,
          otraUnidad: !enM3,
          piezas: piezasDeLaCorrida(f.paquetes, f.pieces),
          entradaM3: Number.isFinite(entrada) && entrada > 0 ? entrada : 0,
        };
      });
    return { corridas, truncado };
  }

  /** El reporte entero de un período, con sus filtros. */
  static async reporteDeProduccion(
    tenantId: string,
    consulta: ConsultaDeReporte,
    /** Hoy en Lima (`limaDateKey()`); se pasa para poder probarlo. */
    hoy: string,
  ): Promise<ReporteDeProduccion> {
    if (!tenantId) throw new Error("tenantId is required");
    const periodo = resolverPeriodo(consulta.periodo, hoy);
    const { corridas, truncado } = await ForestCtpReportesDB.corridasDeProduccion(tenantId, rangoALeer(periodo));
    return armarReporte({
      corridas,
      periodo,
      agrupacion: consulta.agrupacion,
      filtros: consulta.filtros,
      hoy,
      truncado,
    });
  }
}
