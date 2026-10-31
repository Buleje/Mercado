/**
 * Las cifras de Facturas y boletas con su base (F38): salen del MISMO filtro
 * que la tabla y el Excel (F36), contadas en la base y no en los 100 que trae
 * la lista. Puro: la clase de la base agrupa, esto suma y nombra.
 *
 * Emitido ≠ aceptado ≠ cobrado: «emitido» es lo que se mandó a SUNAT sin los
 * anulados; «aceptado», lo que SUNAT confirmó; lo cobrado vive en Caja y acá
 * no se suma.
 */

export interface GrupoComprobantes {
  type: string;
  sunatStatus: string;
  cantidad: number;
  total: number;
  igv: number;
}

export interface ResumenComprobantes {
  /** Documentos que entran en el filtro (todos los estados). */
  documentos: number;
  /** Total sin anulados ni rechazados: lo que vale como emitido. */
  emitido: number;
  emitidoCantidad: number;
  igv: number;
  aceptado: number;
  aceptadoCantidad: number;
  /** pending + retrying: SUNAT todavía no respondió. */
  pendientes: number;
  rechazados: number;
  anulados: number;
  boletas: number;
  facturas: number;
  notas: number;
  /** Notas emitidas en soles: restan del emitido para el neto. */
  notasImporte: number;
  neto: number;
  /** aceptados ÷ (aceptados + rechazados); `null` = sin muestra («Sin datos»). */
  tasaAceptacion: number | null;
}

const VIVOS = new Set(["accepted", "pending", "retrying"]);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumenDesdeGrupos(grupos: readonly GrupoComprobantes[]): ResumenComprobantes {
  const out: ResumenComprobantes = {
    documentos: 0, emitido: 0, emitidoCantidad: 0, igv: 0, aceptado: 0, aceptadoCantidad: 0,
    pendientes: 0, rechazados: 0, anulados: 0, boletas: 0, facturas: 0, notas: 0,
    notasImporte: 0, neto: 0, tasaAceptacion: null,
  };
  for (const g of grupos) {
    out.documentos += g.cantidad;
    if (g.type === "boleta") out.boletas += g.cantidad;
    else if (g.type === "factura") out.facturas += g.cantidad;
    else if (g.type === "nota_credito" || g.type === "nota_debito") out.notas += g.cantidad;

    if (g.sunatStatus === "pending" || g.sunatStatus === "retrying") out.pendientes += g.cantidad;
    else if (g.sunatStatus === "rejected") out.rechazados += g.cantidad;
    else if (g.sunatStatus === "voided") out.anulados += g.cantidad;

    if (!VIVOS.has(g.sunatStatus)) continue;
    if (g.type === "nota_credito") {
      out.notasImporte += g.total;
      continue;
    }
    if (g.type === "baja") continue;
    out.emitido += g.total;
    out.emitidoCantidad += g.cantidad;
    out.igv += g.igv;
    if (g.sunatStatus === "accepted") {
      out.aceptado += g.total;
      out.aceptadoCantidad += g.cantidad;
    }
  }
  const aceptadosTodos = grupos.filter((g) => g.sunatStatus === "accepted").reduce((s, g) => s + g.cantidad, 0);
  const muestra = aceptadosTodos + out.rechazados;
  out.tasaAceptacion = muestra > 0 ? aceptadosTodos / muestra : null;
  out.emitido = r2(out.emitido);
  out.igv = r2(out.igv);
  out.aceptado = r2(out.aceptado);
  out.notasImporte = r2(out.notasImporte);
  out.neto = r2(out.emitido - out.notasImporte);
  return out;
}
