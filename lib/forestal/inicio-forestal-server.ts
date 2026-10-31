/**
 * inicio-forestal-server.ts — junta, para la pestaña «Forestal» del Inicio, lo
 * que cada pantalla del libro ya publica. SÓLO LECTURA.
 *
 * Cada pieza llama a la MISMA función que usa su pantalla, con los mismos
 * parámetros (ver `inicio-forestal.ts`). Si una cifra del Inicio no coincide
 * con la de su pantalla para el mismo período, el error está acá: este archivo
 * no puede tener fórmulas propias.
 *
 * Sin `"use cache"` adentro a propósito: el caché lo pone la ruta, y así este
 * agregador se puede correr desde un script contra la base real para cruzar
 * las cifras con un SELECT.
 */

import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { guiasDeDespachos, resumirGuias, type FilaDespachoGuia } from "./guias-emitidas";
import {
  FILTRO_DISPONIBLES_VACIO,
  filtrarDisponibles,
  resumenDisponibles,
  trozasDisponibles,
} from "./trozas-disponibles";
import { cascadaDelPlan } from "./loth-saldo-cascada";
import {
  guiasLothDelPeriodo,
  permisoInicio,
  serieSemanal,
  type InicioForestal,
  type InicioForestalCtp,
  type InicioForestalLoth,
} from "./inicio-forestal";

export interface OpcionesInicioForestal {
  /** Instantes ISO del período, como los manda el selector de fechas del Inicio. */
  from: string;
  to: string;
  ctp: boolean;
  loth: boolean;
  /** Sólo para quien ve plata (la ruta lo decide por rol). */
  adelantos: boolean;
}

/** Tope de `ForestCtpDB.list` y de `ForestGtfDB.list`: llegar a él es «puede faltar». */
const TOPE_LISTA_CTP = 500;
const TOPE_LISTA_GTF = 200;

async function piezaCtp(tenantId: string, fromDate: Date, toDate: Date): Promise<InicioForestalCtp> {
  const [mov, despachos, patio] = await Promise.all([
    /* El Tablero del Libro CTP: los tres números y su serie salen de acá. */
    ForestCtpDB.movimientoDelLibro(tenantId, { fromDate, toDate }),
    /* Guías emitidas: la misma lectura que `/ctp/guias-emitidas` (anuladas
       incluidas: la pantalla las cuenta en su total). */
    ForestCtpDB.list(tenantId, { section: "despacho", includeAnnulled: true, fromDate, toDate }),
    /* Volumen disponible: el patio de HOY, sin período (es una foto). */
    leerPatio(tenantId),
  ]);

  const filas: FilaDespachoGuia[] = despachos.entries.map((d) => ({
    id: d.id,
    lineNo: d.lineNo,
    entryDate: d.entryDate.toISOString(),
    gtfNumber: d.gtfNumber,
    docType: d.docType,
    destino: d.destino,
    productType: d.productType,
    speciesCommon: d.speciesCommon,
    quantity: d.quantity == null ? null : Number(d.quantity),
    unit: d.unit,
    status: d.status,
    gtfDatos: d.gtfDatos,
    serforNumeroRegistro: d.serforNumeroRegistro,
    serforVerificadoEn: d.serforVerificadoEn ? d.serforVerificadoEn.toISOString() : null,
    atribuidoQty: (d as { atribuidoQty?: number }).atribuidoQty,
  }));
  const guias = resumirGuias(guiasDeDespachos(filas));

  return {
    ingresoM3: mov.totales.ingresoM3,
    consumoM3: mov.totales.consumoM3,
    producido: mov.totales.producido,
    despachado: mov.totales.despachado,
    rendimiento: mov.totales.rendimiento,
    corridasOtraUnidad: mov.totales.corridasOtraUnidad,
    unidadProducido: mov.totales.unidadProducido,
    unidadDespachado: mov.totales.unidadDespachado,
    serie: serieSemanal(mov),
    serieTruncada: mov.truncado,
    guias: { total: guias.total, anuladas: guias.anuladas, truncado: despachos.entries.length >= TOPE_LISTA_CTP },
    patio,
  };
}

/**
 * «En el patio» de Volumen disponible: libres + en lote, sin las de guías por
 * recepcionar. Mismo camino que la pantalla: `trozasComoConsumibles` (el GET
 * `/trozas/patio`) → `trozasDisponibles` → filtro vacío → `resumenDisponibles`.
 */
async function leerPatio(tenantId: string): Promise<InicioForestalCtp["patio"]> {
  try {
    const [todas, total] = await Promise.all([
      WoodEntriesDB.trozasComoConsumibles(tenantId),
      WoodEntriesDB.contarTrozasDelPatio(tenantId),
    ]);
    const ahora = new Date();
    const vivas = filtrarDisponibles(trozasDisponibles(todas), FILTRO_DISPONIBLES_VACIO, ahora);
    const { enPatio } = resumenDisponibles(vivas, ahora);
    return { trozas: enPatio.trozas, m3: enPatio.m3, pt: enPatio.pt, truncado: todas.length < total };
  } catch (err) {
    logger.error("[inicio-forestal] patio failed", { tenantId, error: String(err) });
    return null;
  }
}

async function piezaLoth(tenantId: string, desdeKey: string, hastaKey: string): Promise<InicioForestalLoth> {
  const [gtfs, planes] = await Promise.all([ForestGtfDB.list(tenantId), ForestPlanDB.listPlans(tenantId)]);
  /* «Activo» = el mismo predicado que `getActivePlan` (isActive), en su mismo
     orden (el más nuevo primero). Un negocio puede tener varios a la vez. */
  const activos = planes.filter((p) => p.isActive);
  const balances = await Promise.all(activos.map((p) => ForestPlanDB.balanceExtraccion(tenantId, p.id)));
  return {
    guias: { ...guiasLothDelPeriodo(gtfs, desdeKey, hastaKey), truncado: gtfs.length >= TOPE_LISTA_GTF },
    permisos: activos.map((p, i) =>
      permisoInicio(p, cascadaDelPlan(balances[i].rows).total, balances[i].sinRegistrar),
    ),
  };
}

async function piezaAdelantos(tenantId: string): Promise<InicioForestal["adelantos"]> {
  try {
    const r = await AdelantosDB.resumen(tenantId);
    return r.porMoneda.map((m) => ({ moneda: m.moneda, saldoPendiente: m.saldoPendiente, abiertos: m.adelantosAbiertos }));
  } catch (err) {
    logger.error("[inicio-forestal] adelantos failed", { tenantId, error: String(err) });
    return null;
  }
}

export async function leerInicioForestal(tenantId: string, o: OpcionesInicioForestal): Promise<InicioForestal> {
  if (!tenantId) throw new Error("tenantId is required");
  const fromDate = new Date(o.from);
  const toDate = new Date(o.to);
  const desde = limaDateKey(fromDate);
  const hasta = limaDateKey(toDate);
  const [ctp, loth, adelantos] = await Promise.all([
    o.ctp ? piezaCtp(tenantId, fromDate, toDate) : Promise.resolve(null),
    o.loth ? piezaLoth(tenantId, desde, hasta) : Promise.resolve(null),
    o.adelantos ? piezaAdelantos(tenantId) : Promise.resolve(null),
  ]);
  return { desde, hasta, ctp, loth, adelantos };
}
