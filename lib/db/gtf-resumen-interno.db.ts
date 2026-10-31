/**
 * GtfResumenInternoDB — lo que lee el «Resumen interno» de una GTF del Libro TH
 * (Brandon 08-10), en el SERVIDOR (regla 6: las cifras no las arma el
 * navegador). La ruta `GET /api/admin/forestal/gtf/resumen-interno` calcula
 * R1-R4 con esto (`resumenInterno`).
 *
 *   1 · La guía, también dada de baja (el resumen se imprime desde «Anuladas y
 *       otras»).
 *   2 · SUS líneas de Despacho (trozas y productos): las vivas del mismo N°
 *       (`colaDeGtf` + `mismoNumeroGtf`) filtradas con la regla de anular la
 *       guía (`lineasPropiasDeLaGuia`). Una anulada no tiene ninguna.
 *   3 · Las del permiso (R4) y el autorizado de su balance (`?solo=1`).
 *   4 · Lo que el Libro CTP sabe de cada troza (R3), si el negocio lo lleva.
 *
 * Sólo lectura; `tenantId` va en cada WHERE. Lo que no se pudo leer del
 * permiso o del CTP no frena la hoja: sale «sin dato» y se dice en `avisos`.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { colaDeGtf, mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { TOPE_PIEZAS_ASERRADERO, piezaDeFilaCtp, type PiezaCtp } from "@/lib/forestal/loth-trace-aserradero";
import {
  declaradoDeLaGuia,
  lineaDelResumen,
  lineasPropiasDeLaGuia,
  pasosCtp,
  permisoDeLaGuia,
  piezasDelResumen,
  type DatosResumenInterno,
} from "@/lib/forestal/gtf-resumen-interno-datos";
import type { PasoCtp } from "@/lib/forestal/gtf-resumen-interno";
import { ForestLothDespachoDB } from "./forest-loth-despacho.db";
import { ForestPlanDB } from "./forest-plan.db";
import { WoodEntriesDB } from "./wood-entries.db";

const SECCIONES_DESPACHO = ["despacho_troza", "despacho_producto"];

const SELECT_LINEA = {
  id: true,
  section: true,
  planId: true,
  gtfNumber: true,
  entryDate: true,
  trozaCode: true,
  treeCode: true,
  volumeM3: true,
  quantity: true,
  unit: true,
} as const;

export class GtfResumenInternoDB {
  /** `null` = la guía no es de este negocio (o no existe). */
  static async leer(tenantId: string, gtfId: string, opts: { ctp: boolean }): Promise<DatosResumenInterno | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const g = await prisma.forestGtf.findFirst({
      where: { tenantId, id: gtfId },
      select: {
        id: true,
        gtfNumber: true,
        gtfDate: true,
        planId: true,
        titularName: true,
        items: true,
        volumenTotalM3: true,
        piezasTotal: true,
        gtfDatos: true,
        status: true,
        deletedAt: true,
      },
    });
    if (!g) return null;
    const avisos: string[] = [];

    /* 1 · Sus líneas (si falla, la hoja diría «sin despacho» de todo: mejor un error). */
    const propias = await GtfResumenInternoDB.lineasPropias(tenantId, g);
    const planId = permisoDeLaGuia(g.planId, propias);

    /* 2 · El permiso: sus líneas y su autorizado, en paralelo. */
    const [delPermiso, autorizadoM3] = await Promise.all([
      planId
        ? prisma.forestLothEntry
            .findMany({
              where: { tenantId, deletedAt: null, status: "registrado", section: { in: SECCIONES_DESPACHO }, planId },
              select: SELECT_LINEA,
            })
            .catch((err: unknown) => {
              logger.warn("[gtf-resumen-interno] despacho del permiso", { error: String(err), tenantId, planId });
              avisos.push("No se pudo leer el Despacho del permiso: el saldo sale sin dato.");
              return null;
            })
        : Promise.resolve(null),
      planId ? GtfResumenInternoDB.autorizado(tenantId, planId, avisos) : Promise.resolve(null),
    ]);

    /* 3 · Cada troza con la medida de su Trozado (una consulta para las dos listas). */
    const unidas = new Map([...(delPermiso ?? []), ...propias].map((e) => [e.id, e]));
    const conMedida = new Map((await ForestLothDespachoDB.conTrozado(tenantId, [...unidas.values()])).map((e) => [e.id, e]));
    const medida = <T extends { id: string }>(e: T) => conMedida.get(e.id) ?? e;
    const propiasM = propias.map(medida);

    /* 4 · El Libro CTP. */
    const trozadoIds = propiasM.flatMap((e) => ("trozado" in e && e.trozado?.lineaId ? [e.trozado.lineaId] : []));
    const ctp = opts.ctp ? await GtfResumenInternoDB.pasosEnElCtp(tenantId, trozadoIds, avisos) : null;

    return {
      planId,
      lineaDespachoId: propias.find((e) => e.section === "despacho_troza")?.id ?? null,
      avisos,
      entrada: {
        guia: {
          gtfNumber: g.gtfNumber,
          gtfDate: g.gtfDate ? g.gtfDate.toISOString().slice(0, 10) : null,
          ...declaradoDeLaGuia(g),
        },
        piezas: piezasDelResumen(g.items),
        lineasDeLaGuia: propiasM.map(lineaDelResumen),
        lineasDelPermiso: delPermiso ? delPermiso.map(medida).map(lineaDelResumen) : null,
        autorizadoM3,
        ctp,
      },
    };
  }

  /**
   * Las líneas de Despacho vivas de la guía: las del mismo N° (de trozas y de
   * productos) y, con eso, la regla de `lineasPropiasDeLaGuia`.
   */
  private static async lineasPropias(
    tenantId: string,
    g: { id: string; gtfNumber: string; planId: string | null; titularName: string | null; items: unknown; status: string; deletedAt: Date | null },
  ) {
    const cola = colaDeGtf(g.gtfNumber);
    if (!cola || g.status === "anulada" || g.deletedAt) return [];
    const [candidatas, conLaCola] = await Promise.all([
      prisma.forestLothEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado", section: { in: SECCIONES_DESPACHO }, gtfNumber: { endsWith: cola } },
        select: SELECT_LINEA,
      }),
      prisma.forestGtf.findMany({
        where: { tenantId, deletedAt: null, id: { not: g.id }, gtfNumber: { endsWith: cola } },
        select: { gtfNumber: true },
      }),
    ]);
    const delNumero = candidatas.filter((l) => mismoNumeroGtf(l.gtfNumber, g.gtfNumber));
    const otras = conLaCola.filter((o) => mismoNumeroGtf(o.gtfNumber, g.gtfNumber)).length;
    /* El titular de cada plan sólo hace falta si el N° es de varias guías y ésta no cita plan. */
    const planIds = [...new Set(delNumero.map((l) => l.planId).filter((p): p is string => Boolean(p)))];
    const planes =
      otras > 0 && !g.planId && planIds.length
        ? await prisma.forestPlan.findMany({ where: { tenantId, id: { in: planIds } }, select: { id: true, titularName: true } })
        : [];
    const titularDe = new Map(planes.map((p) => [p.id, p.titularName]));
    return lineasPropiasDeLaGuia(g, delNumero, { otrasConElNumero: otras, titularDePlan: (id) => titularDe.get(id) ?? null });
  }

  /** Σ autorizado del plan (su balance con `soloDelPlan`, el de `?balance=&solo=1`). */
  private static async autorizado(tenantId: string, planId: string, avisos: string[]): Promise<number | null> {
    try {
      if (!(await ForestPlanDB.getPlan(tenantId, planId))) {
        avisos.push("El permiso de la guía ya no está en el libro: el saldo sale sin dato.");
        return null;
      }
      const b = await ForestPlanDB.balanceExtraccion(tenantId, planId, { soloDelPlan: true });
      return b.rows.reduce((a, r) => a + (Number(r.autorizado) || 0), 0);
    } catch (err) {
      logger.warn("[gtf-resumen-interno] autorizado del permiso", { error: String(err), tenantId, planId });
      avisos.push("No se pudo leer el autorizado del permiso.");
      return null;
    }
  }

  /** Qué pasó en el Libro CTP con la troza de cada Trozado (la misma lectura que `/loth/aserradero`). */
  private static async pasosEnElCtp(tenantId: string, trozadoIds: readonly string[], avisos: string[]): Promise<Map<string, PasoCtp[]> | null> {
    const trozados = [...new Set(trozadoIds)];
    if (trozados.length === 0) return new Map();
    try {
      const filas = await WoodEntriesDB.trozasDeTrozados(tenantId, trozados, TOPE_PIEZAS_ASERRADERO + 1);
      if (filas.length > TOPE_PIEZAS_ASERRADERO) avisos.push(`El Libro CTP tiene más de ${TOPE_PIEZAS_ASERRADERO} piezas de estas trozas: se leyeron las primeras.`);
      const piezas = filas
        .slice(0, TOPE_PIEZAS_ASERRADERO)
        .map((f) => piezaDeFilaCtp(tenantId, f))
        .filter((p): p is PiezaCtp => p !== null);
      return pasosCtp(piezas);
    } catch (err) {
      logger.warn("[gtf-resumen-interno] libro ctp", { error: String(err), tenantId });
      avisos.push("No se pudo preguntar al Libro CTP dónde están las trozas.");
      return null;
    }
  }
}
