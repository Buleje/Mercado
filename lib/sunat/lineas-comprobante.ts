/**
 * lib/sunat/lineas-comprobante.ts
 *
 * Arma las líneas de un comprobante (boleta, factura, nota de crédito) con la
 * afectación del IGV de CADA producto (`Product.taxType`) y saca los totales
 * SUMANDO esas líneas, para que gravada + exonerada + inafecta + IGV cuadren
 * siempre con el total.
 *
 * Por qué importa: en la Amazonía (Ley 27037, Pucallpa) muchos productos van
 * exonerados. Antes todo se mandaba gravado al 18 % y el IGV del mes salía
 * inflado.
 *
 * Formato: JSON de Nubefact (ejemplos oficiales «BOLETA 2 EXONERADA»,
 * «BOLETA 3 INAFECTAS», «BOLETA 8 DESCUENTO POR ITEM»):
 *  - exonerado/inafecto: valor_unitario = precio_unitario, igv 0.
 *  - descuento por ítem: `descuento` va SIN IGV y `subtotal` = valor × cantidad − descuento;
 *    `total_descuento` = suma de esos descuentos.
 *  - el `descuento_global` de Nubefact solo rebaja `total_gravada`; con una
 *    venta mixta no sirve, por eso el descuento de la venta se PRORRATEA en las
 *    líneas (cada una con su base y su IGV ya rebajados).
 *
 * Todo se cuenta en céntimos enteros para que el redondeo no se coma un sol.
 */

import type { NubefactItem } from "./nubefact-client";

// ── Afectación del IGV ───────────────────────────────────────────────────────

export type AfectacionIgv = "gravado" | "exonerado" | "inafecto";

/** Tasa del IGV (incluye IPM). */
export const TASA_IGV = 0.18;

/**
 * Catálogo 07 de SUNAT (tipo de afectación del IGV) y el código que usa el
 * JSON de Nubefact en `tipo_de_igv` para la operación onerosa.
 */
export const AFECTACION_IGV: Record<
  AfectacionIgv,
  { catalogoSunat: "10" | "20" | "30"; tipoDeIgvNubefact: 1 | 8 | 9; tasa: number }
> = {
  gravado: { catalogoSunat: "10", tipoDeIgvNubefact: 1, tasa: TASA_IGV },
  exonerado: { catalogoSunat: "20", tipoDeIgvNubefact: 8, tasa: 0 },
  inafecto: { catalogoSunat: "30", tipoDeIgvNubefact: 9, tasa: 0 },
};

/**
 * Lee el `taxType` del producto. Sin dato o con un valor que no se reconoce,
 * la línea va gravada (como siempre fue): ante la duda se paga IGV, no se omite.
 */
export function afectacionDe(taxType: string | null | undefined): AfectacionIgv {
  const t = (taxType ?? "").trim().toLowerCase();
  if (t.startsWith("exoner")) return "exonerado";
  if (t.startsWith("inafect")) return "inafecto";
  return "gravado";
}

// ── Entrada y salida ─────────────────────────────────────────────────────────

export interface LineaDeVenta {
  name: string;
  quantity: number;
  /** Precio unitario cobrado al público (con IGV si es gravado). */
  price: number;
  productCode?: string;
  /** `Product.taxType`: gravado | exonerado | inafecto. Vacío = gravado. */
  taxType?: string | null;
}

export interface TotalesComprobante {
  gravada: number;
  exonerada: number;
  inafecta: number;
  igv: number;
  /** Suma de los descuentos de las líneas, sin IGV (`total_descuento`). */
  descuento: number;
  /** Lo cobrado por encima de los productos (`total_otros_cargos`). */
  otrosCargos: number;
  total: number;
}

export interface LineasComprobante {
  items: NubefactItem[];
  totales: TotalesComprobante;
}

export interface OpcionesLineas {
  /**
   * Total que de verdad se cobró (Order.total). Si es menor que la suma de
   * los productos, la diferencia es un descuento que se prorratea en las
   * líneas; si es mayor, va como otros cargos. Sin dato = suma de las líneas.
   */
  totalCobrado?: number | null;
}

// ── Cálculo ──────────────────────────────────────────────────────────────────

const aCentimos = (soles: number): number => Math.round(soles * 100);
const aSoles = (centimos: number): number => centimos / 100;

/**
 * Reparte `monto` céntimos en proporción a `pesos` sin perder ni sobrar uno
 * (método del mayor resto; los empates van al primero).
 */
function prorratear(monto: number, pesos: number[]): number[] {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (monto <= 0 || suma <= 0) return pesos.map(() => 0);
  const exactos = pesos.map((p) => (monto * p) / suma);
  const partes = exactos.map(Math.floor);
  let resto = monto - partes.reduce((a, b) => a + b, 0);
  const orden = exactos
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of orden) {
    if (resto <= 0) break;
    partes[i] += 1;
    resto -= 1;
  }
  return partes;
}

/** Arma las líneas con su afectación y los totales que salen de ellas. */
export function armarLineasComprobante(
  lineas: LineaDeVenta[],
  opciones: OpcionesLineas = {},
): LineasComprobante {
  const brutos = lineas.map((l) => Math.max(0, aCentimos(l.price * l.quantity)));
  const sumaBruta = brutos.reduce((a, b) => a + b, 0);

  const cobrado = opciones.totalCobrado;
  const ajuste =
    cobrado != null && Number.isFinite(cobrado) ? aCentimos(cobrado) - sumaBruta : 0;
  const descuentoVenta = Math.min(sumaBruta, Math.max(0, -ajuste));
  const otrosCargos = Math.max(0, ajuste);
  const rebajas = prorratear(descuentoVenta, brutos);

  const tot = { gravada: 0, exonerada: 0, inafecta: 0, igv: 0, descuento: 0, neto: 0 };

  const items = lineas.map((linea, i): NubefactItem => {
    const afectacion = afectacionDe(linea.taxType);
    const { tipoDeIgvNubefact, tasa } = AFECTACION_IGV[afectacion];
    const neto = brutos[i] - rebajas[i]; // lo cobrado por la línea, con IGV
    const base = tasa > 0 ? Math.round(neto / (1 + tasa)) : neto;
    const igv = neto - base;
    // Descuento sin IGV = valor de venta antes de rebajar − base rebajada.
    const valorBruto = tasa > 0 ? brutos[i] / (1 + tasa) : brutos[i];
    const descuento = Math.max(0, Math.round(valorBruto - base)) || 0;

    if (afectacion === "gravado") tot.gravada += base;
    else if (afectacion === "exonerado") tot.exonerada += base;
    else tot.inafecta += base;
    tot.igv += igv;
    tot.descuento += descuento;
    tot.neto += neto;

    return {
      unidad_de_medida: "NIU",
      codigo: linea.productCode ?? "",
      descripcion: linea.name,
      cantidad: linea.quantity,
      valor_unitario: +(linea.price / (1 + tasa)).toFixed(6),
      precio_unitario: +linea.price.toFixed(6),
      descuento: aSoles(descuento),
      subtotal: aSoles(base),
      tipo_de_igv: tipoDeIgvNubefact,
      igv: aSoles(igv),
      total: aSoles(neto),
      anticipo_regularizacion: false,
      anticipo_documento_serie: "",
      anticipo_documento_numero: "",
    };
  });

  return {
    items,
    totales: {
      gravada: aSoles(tot.gravada),
      exonerada: aSoles(tot.exonerada),
      inafecta: aSoles(tot.inafecta),
      igv: aSoles(tot.igv),
      descuento: aSoles(tot.descuento),
      otrosCargos: aSoles(otrosCargos),
      total: aSoles(tot.neto + otrosCargos),
    },
  };
}

/**
 * Montos para guardar en `SunatInvoice` y para el IGV del mes:
 * subtotal = valor de venta sin IGV (gravada + exonerada + inafecta + otros cargos),
 * así subtotal + igv = total siempre.
 */
export function montosParaRegistro(totales: TotalesComprobante): {
  subtotal: number;
  igv: number;
  total: number;
} {
  return {
    subtotal: aSoles(aCentimos(totales.total) - aCentimos(totales.igv)),
    igv: totales.igv,
    total: totales.total,
  };
}
