/**
 * comprobante-del-gasto — qué papel respalda un gasto y cuánto IGV trae.
 *
 * Pura: la usan el formulario (vista previa mientras escribes) y la ruta
 * `POST /api/expenses` (la cifra que se guarda). La ruta manda: el cliente
 * sólo muestra.
 *
 * TRES DECISIONES QUE NO SON OBVIAS
 *
 * 1. **Sólo la factura lleva IGV que se descuenta.** El IGV de una boleta o de
 *    un recibo no es crédito fiscal: guardarlo haría que «IGV del mes ›
 *    compras» (`lib/db/igv-del-mes.db.ts`) prometa un descuento que SUNAT no
 *    acepta. Por eso a la boleta se le guarda `igvAmount = null`.
 *
 * 2. **Exonerado se guarda como 0, no como vacío.** En la Amazonía (Ley 27037)
 *    muchas facturas no cobran IGV. `0` dice «la factura no trae IGV»; `null`
 *    dice «nadie lo anotó». Son dos respuestas distintas a la misma pregunta.
 *
 * 3. **El servidor rechaza lo que está mal, no lo que falta.** Un RUC que no
 *    pasa el dígito verificador o un IGV mayor que el posible son errores; una
 *    factura sin número no (la completitud la pide el formulario).
 *
 * 4. **El IGV se calcula del TOTAL pagado** (18/118), porque lo que la persona
 *    tiene en la mano es el total. Si la factura mezcla ítems exonerados y
 *    gravados puede traer menos IGV: se acepta cualquier cifra entre 0 y el
 *    máximo posible, nunca más.
 */
import { rucValido } from "@/lib/documents/sunat-comprobante";

export type TipoComprobante = "sin_comprobante" | "boleta" | "factura" | "recibo";

export const TIPOS_COMPROBANTE: ReadonlyArray<{ valor: TipoComprobante; etiqueta: string }> = [
  { valor: "sin_comprobante", etiqueta: "Sin comprobante" },
  { valor: "boleta", etiqueta: "Boleta" },
  { valor: "factura", etiqueta: "Factura" },
  { valor: "recibo", etiqueta: "Recibo" },
];

/** Tasa general del IGV (16 % IGV + 2 % IPM). */
export const TASA_IGV = 0.18;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** El IGV que viene DENTRO de un total con IGV incluido. */
export function igvIncluido(total: number): number {
  if (!(total > 0)) return 0;
  return r2((total * TASA_IGV) / (1 + TASA_IGV));
}

/** Lo que llega del formulario (todo opcional: un gasto sin papel es válido). */
export interface ComprobanteEntrada {
  documentType?: string | null;
  documentNumber?: string | null;
  supplierRuc?: string | null;
  /** `true` = la factura cobra IGV; `false` = exonerada / inafecta. */
  afectoIgv?: boolean | null;
  /** IGV que dice la factura. Sin él y con `afectoIgv`, se calcula del total. */
  igvAmount?: number | null;
}

/** Lo que se guarda en las columnas de `Expense`. */
export interface ComprobanteGuardado {
  documentType: TipoComprobante | null;
  documentNumber: string | null;
  supplierRuc: string | null;
  afectoIgv: boolean;
  igvAmount: number | null;
}

export type RevisionComprobante =
  | { ok: true; datos: ComprobanteGuardado }
  | { ok: false; campo: "documentType" | "documentNumber" | "supplierRuc" | "afectoIgv" | "igvAmount"; error: string };

const ES_TIPO = new Set<string>(TIPOS_COMPROBANTE.map((t) => t.valor));

/** «f001 - 123» → «F001-123». */
export function normalizarNumero(numero: string | null | undefined): string {
  return String(numero ?? "").toUpperCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
}

/** Qué le falta a un RUC, en palabras. `null` = está bien (o vacío). */
export function errorDeRuc(ruc: string | null | undefined): string | null {
  const limpio = String(ruc ?? "").trim();
  if (!limpio) return null;
  if (!/^\d+$/.test(limpio)) return "El RUC lleva sólo números.";
  if (limpio.length !== 11) return `El RUC tiene 11 dígitos (escribiste ${limpio.length}).`;
  if (!rucValido(limpio)) return "Ese RUC no existe: revisa los dígitos.";
  return null;
}

/**
 * Revisa y deja listo el comprobante de un gasto de `monto` soles.
 * `ticket` (lo que mandaban clientes viejos) se guarda como boleta.
 */
export function revisarComprobante(monto: number, c: ComprobanteEntrada): RevisionComprobante {
  const crudo = String(c.documentType ?? "").trim();
  const tipo = (crudo === "ticket" ? "boleta" : crudo) as TipoComprobante | "";
  if (tipo && !ES_TIPO.has(tipo)) {
    return { ok: false, campo: "documentType", error: "Ese tipo de comprobante no existe." };
  }
  const ruc = String(c.supplierRuc ?? "").trim();
  const errRuc = errorDeRuc(ruc);
  if (errRuc) return { ok: false, campo: "supplierRuc", error: errRuc };

  if (!tipo || tipo === "sin_comprobante") {
    return {
      ok: true,
      datos: { documentType: tipo || null, documentNumber: null, supplierRuc: ruc || null, afectoIgv: false, igvAmount: null },
    };
  }

  const numero = normalizarNumero(c.documentNumber);
  if (numero.length > 30) return { ok: false, campo: "documentNumber", error: "El número es muy largo (máximo 30)." };

  if (tipo !== "factura") {
    return {
      ok: true,
      datos: { documentType: tipo, documentNumber: numero || null, supplierRuc: ruc || null, afectoIgv: false, igvAmount: null },
    };
  }

  // Lo que FALTA (RUC, número, elegir el IGV) lo pide el formulario; acá sólo
  // se rechaza lo que está MAL. Otros caminos que ya mandan facturas (Punto de
  // compra, el «deshacer» del historial que re-crea lo borrado) no tienen por
  // qué traer todo, y un 400 les rompería el guardado.
  const igvDado = c.igvAmount == null ? null : Number(c.igvAmount);
  if (c.afectoIgv == null && igvDado == null) {
    return { ok: true, datos: { documentType: "factura", documentNumber: numero || null, supplierRuc: ruc || null, afectoIgv: false, igvAmount: null } };
  }
  if (c.afectoIgv === false && !(igvDado != null && igvDado > 0)) {
    return { ok: true, datos: { documentType: "factura", documentNumber: numero || null, supplierRuc: ruc || null, afectoIgv: false, igvAmount: 0 } };
  }
  const maximo = igvIncluido(monto);
  const igv = igvDado == null ? maximo : r2(igvDado);
  if (!Number.isFinite(igv) || igv < 0) return { ok: false, campo: "igvAmount", error: "El IGV no puede ser negativo." };
  if (igv > maximo + 0.01) {
    return { ok: false, campo: "igvAmount", error: `El IGV de un total de S/ ${monto.toFixed(2)} no pasa de S/ ${maximo.toFixed(2)}.` };
  }
  return { ok: true, datos: { documentType: "factura", documentNumber: numero || null, supplierRuc: ruc || null, afectoIgv: true, igvAmount: igv } };
}
