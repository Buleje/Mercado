/**
 * corregir-comprobante — qué se guarda del papel de un gasto YA registrado
 * cuando alguien lo corrige (`PUT /api/expenses/[id]`).
 *
 * Pura. El alta pasa por `revisarComprobante`; la corrección también, pero
 * mezclando lo que llega con lo que ya estaba: el formulario manda SÓLO lo que
 * cambió, y revisar «número nuevo» sin el RUC de siempre dejaría pasar una
 * factura con un RUC que ya no se mira.
 *
 * DOS DECISIONES QUE NO SON OBVIAS
 *
 * 1. **Sólo cambia el monto de una factura con IGV → `igvAlCambiarMonto`.** El
 *    IGV guardado era de otro total. Si era el IGV completo (18/118 de su total,
 *    al céntimo), se recalcula del total nuevo: escalar un IGV ya redondeado
 *    multiplica el redondeo (S/ 10.06 con IGV 1.53 corregido a S/ 1 006 daba
 *    153.00 en vez de 153.46). Si era menor (factura que mezcla ítems
 *    exonerados), se escala con el total: conserva esa proporción y nunca pasa
 *    del máximo. Y no se re-revisa el resto del papel: un gasto viejo con un RUC
 *    mal tipeado no tiene por qué bloquear que le corrijan el monto.
 *
 * 2. **Si cambia el tipo, el «cobra IGV» o el monto, el IGV guardado deja de
 *    valer** (salvo que llegue escrito): se vuelve a calcular del total, como en
 *    el alta.
 */
import {
  igvIncluido,
  revisarComprobante,
  type ComprobanteEntrada,
  type RevisionComprobante,
} from "./comprobante-del-gasto";

/** Los campos del papel que una corrección puede tocar. */
export const CAMPOS_COMPROBANTE = ["documentType", "documentNumber", "supplierRuc", "igvAmount", "afectoIgv"] as const;

/** Lo que el gasto tiene guardado hoy. */
export interface ComprobanteActual {
  amount: number;
  documentType?: string | null;
  documentNumber?: string | null;
  supplierRuc?: string | null;
  igvAmount?: number | null;
  afectoIgv?: boolean;
}

/** Lo que llega en el PUT (todo opcional: `undefined` = no se tocó). */
export interface CorreccionComprobante extends ComprobanteEntrada {
  amount?: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const cent = (v: number) => Math.round(v * 100);

/**
 * El IGV de una factura YA guardada cuando sólo cambia su total. Lo usan el
 * PUT y la vista previa del modal (`use-gasto-editar`), para que digan lo mismo.
 */
export function igvAlCambiarMonto(montoAnterior: number, igvGuardado: number, montoNuevo: number): number {
  const maximo = igvIncluido(montoNuevo);
  // IGV completo (al céntimo, en soles: no en el epsilon del float) → del total nuevo.
  if (!(montoAnterior > 0) || Math.abs(cent(igvGuardado) - cent(igvIncluido(montoAnterior))) <= 1) return maximo;
  // Factura mixta → se escala con el total, sin pasar del máximo.
  return Math.min(r2((igvGuardado * montoNuevo) / montoAnterior), maximo);
}

/**
 * `null` = la corrección no toca el papel (nada que revisar ni escribir).
 * Si devuelve `ok: true`, `datos` son las cinco columnas a escribir.
 */
export function corregirComprobante(actual: ComprobanteActual, patch: CorreccionComprobante): RevisionComprobante | null {
  const tocaPapel = CAMPOS_COMPROBANTE.some((k) => patch[k] !== undefined);
  const montoNuevo = patch.amount !== undefined ? r2(patch.amount) : null;
  const cambiaMonto = montoNuevo != null && montoNuevo !== r2(actual.amount);
  const igvGuardado = actual.igvAmount == null ? null : Number(actual.igvAmount);
  const facturaConIgv = actual.documentType === "factura" && actual.afectoIgv === true && igvGuardado != null;

  if (!tocaPapel) {
    if (!cambiaMonto || !facturaConIgv || montoNuevo == null) return null;
    return {
      ok: true,
      datos: {
        documentType: "factura",
        documentNumber: actual.documentNumber ?? null,
        supplierRuc: actual.supplierRuc ?? null,
        afectoIgv: true,
        igvAmount: igvAlCambiarMonto(actual.amount, igvGuardado, montoNuevo),
      },
    };
  }

  // Factura sin IGV anotado = nadie eligió todavía (no es «exonerada»).
  const afectoActual = actual.documentType === "factura" && igvGuardado != null ? actual.afectoIgv === true : null;
  const igvSigueValiendo = !cambiaMonto && patch.documentType === undefined && patch.afectoIgv === undefined;
  const pick = <K extends keyof ComprobanteEntrada>(k: K, guardado: ComprobanteEntrada[K]): ComprobanteEntrada[K] =>
    patch[k] !== undefined ? patch[k] : guardado;

  return revisarComprobante(montoNuevo ?? actual.amount, {
    documentType: pick("documentType", actual.documentType ?? null),
    documentNumber: pick("documentNumber", actual.documentNumber ?? null),
    supplierRuc: pick("supplierRuc", actual.supplierRuc ?? null),
    afectoIgv: pick("afectoIgv", afectoActual),
    igvAmount: pick("igvAmount", igvSigueValiendo ? igvGuardado : null),
  });
}
