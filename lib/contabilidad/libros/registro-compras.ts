/**
 * Formato 8.1 «Registro de Compras» — libro de trabajo del mes.
 *
 * Filas: las compras RECIBIDAS completas (orden de compra en `recibido`; la `parcial` se
 * cuenta en «Notas» y entra al completarse) y los gastos
 * (no las plantillas de gasto fijo) que tienen comprobante del proveedor. Lo que no tiene
 * comprobante no entra: se cuenta en «Notas» con su monto.
 *
 * Lo que el sistema NO guarda y por eso va vacío:
 *   · la fecha IMPRESA en el comprobante del proveedor → va la fecha anotada en el sistema
 *     en su propia columna, al final;
 *   · el IGV de la orden de compra (la orden guarda el costo, no la factura): base e IGV
 *     vacíos, solo el importe total;
 *   · a qué operaciones se destina la compra (col. 13-16): se usa la col. 11-12
 *     («destinadas a operaciones gravadas»); la prorrata la decide el contador.
 */
import {
  AVISO_DE_TRABAJO,
  aSoles,
  aCentimos,
  fechaDia,
  fechaLima,
  formatoSoles,
  partirSerieNumero,
  numerarYCompletar,
  sumarColumnas,
  textoSeguro,
  tipoComprobanteTabla10,
  tipoDocIdentidad,
  TITULO_FORMATO,
  type ColumnaLibro,
  type FilaLibro,
  type LibroContador,
} from "./comun";

export interface CompraRecibida {
  id: string;
  /** Cuándo llegó (receivedDate) o, si no se anotó, cuándo se creó la orden. */
  fechaSistema: Date;
  proveedorNombre: string;
  proveedorDoc: string | null;
  proveedorTipoDoc: string | null;
  /** factura | boleta | guia | ninguno | null */
  tipoComprobante: string | null;
  numeroComprobante: string | null;
  total: number;
  estado: string;
}

export interface GastoDelMes {
  id: string;
  /** Día del gasto (medianoche UTC). */
  fecha: Date;
  categoria: string;
  descripcion: string;
  proveedorNombre: string | null;
  proveedorDoc: string | null;
  /** boleta | factura | recibo | ticket | sin_comprobante | null */
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  monto: number;
  igv: number | null;
}

export interface EntradaRegistroCompras {
  periodo: string;
  compras: CompraRecibida[];
  gastos: GastoDelMes[];
}

const MONTOS = ["bi1", "igv1", "bi2", "igv2", "bi3", "igv3", "noGravadas", "isc", "otros", "total"] as const;

export const COLUMNAS_COMPRAS: ColumnaLibro[] = [
  { clave: "correlativo", rotulo: "Número correlativo del registro o código único de la operación", numero: 1 },
  { clave: "fechaEmision", rotulo: "Fecha de emisión del comprobante de pago o documento", numero: 2 },
  { clave: "fechaVencimiento", rotulo: "Fecha de vencimiento o fecha de pago", numero: 3 },
  { clave: "tipo", rotulo: "Comprobante: tipo (Tabla 10)", numero: 4 },
  { clave: "serie", rotulo: "Comprobante: serie o código de la dependencia aduanera (Tabla 11)", numero: 5 },
  { clave: "anioDua", rotulo: "Año de emisión de la DUA o DSI", numero: 6 },
  { clave: "numero", rotulo: "N° del comprobante de pago, documento, DUA, DSI o liquidación", numero: 7 },
  { clave: "provTipoDoc", rotulo: "Proveedor: documento de identidad, tipo (Tabla 2)", numero: 8 },
  { clave: "provDoc", rotulo: "Proveedor: documento de identidad, número", numero: 9 },
  { clave: "provNombre", rotulo: "Proveedor: apellidos y nombres, denominación o razón social", numero: 10 },
  { clave: "bi1", rotulo: "Adq. gravadas destinadas a op. gravadas y/o de exportación: base imponible", numero: 11, soles: true },
  { clave: "igv1", rotulo: "Adq. gravadas destinadas a op. gravadas y/o de exportación: IGV", numero: 12, soles: true },
  { clave: "bi2", rotulo: "Adq. gravadas destinadas a op. gravadas y/o exportación y a op. no gravadas: base imponible", numero: 13, soles: true },
  { clave: "igv2", rotulo: "Adq. gravadas destinadas a op. gravadas y/o exportación y a op. no gravadas: IGV", numero: 14, soles: true },
  { clave: "bi3", rotulo: "Adq. gravadas destinadas a op. no gravadas: base imponible", numero: 15, soles: true },
  { clave: "igv3", rotulo: "Adq. gravadas destinadas a op. no gravadas: IGV", numero: 16, soles: true },
  { clave: "noGravadas", rotulo: "Valor de las adquisiciones no gravadas", numero: 17, soles: true },
  { clave: "isc", rotulo: "ISC", numero: 18, soles: true },
  { clave: "otros", rotulo: "Otros tributos y cargos", numero: 19, soles: true },
  { clave: "total", rotulo: "Importe total", numero: 20, soles: true },
  { clave: "noDomiciliado", rotulo: "N° de comprobante de pago emitido por sujeto no domiciliado", numero: 21 },
  { clave: "detraccionNumero", rotulo: "Constancia de depósito de detracción: número", numero: 22 },
  { clave: "detraccionFecha", rotulo: "Constancia de depósito de detracción: fecha de emisión", numero: 23 },
  { clave: "tipoCambio", rotulo: "Tipo de cambio", numero: 24 },
  { clave: "refFecha", rotulo: "Referencia: fecha del comprobante que se modifica", numero: 25 },
  { clave: "refTipo", rotulo: "Referencia: tipo (Tabla 10)", numero: 26 },
  { clave: "refSerie", rotulo: "Referencia: serie", numero: 27 },
  { clave: "refNumero", rotulo: "Referencia: N° del comprobante", numero: 28 },
  { clave: "fechaSistema", rotulo: "Fecha anotada en el sistema" },
  { clave: "tipoSistema", rotulo: "Tipo de comprobante anotado en el sistema" },
  { clave: "origen", rotulo: "Origen en el sistema" },
  { clave: "detalle", rotulo: "Detalle" },
  { clave: "idSistema", rotulo: "Código en el sistema" },
];

/** Tipos que el sistema anota y que NO son comprobantes de pago. */
const SIN_COMPROBANTE = new Set(["guia", "ninguno", "sin_comprobante"]);

function tieneComprobante(tipo: string | null, numero: string | null): boolean {
  const t = (tipo ?? "").trim().toLowerCase();
  if (SIN_COMPROBANTE.has(t)) return false;
  return Boolean(t) || Boolean(numero?.trim());
}

function vacios(): FilaLibro {
  return Object.fromEntries(MONTOS.map((k) => [k, null]));
}


export function armarRegistroCompras(e: EntradaRegistroCompras): LibroContador {
  const filas: { orden: number; fila: FilaLibro }[] = [];
  const fuera = { compras: 0, comprasMonto: 0, gastos: 0, gastosMonto: 0, parciales: 0, parcialesMonto: 0 };
  let gastosSinIgv = 0;

  for (const c of e.compras) {
    // Recibida en parte: `receivedDate` se anota recién al completarla, así que entra UNA vez,
    // en el mes en que se completa (con su fecha). Antes saldría también en el mes de la orden.
    if (c.estado === "parcial") {
      fuera.parciales++;
      fuera.parcialesMonto += aCentimos(c.total);
      continue;
    }
    if (!tieneComprobante(c.tipoComprobante, c.numeroComprobante)) {
      fuera.compras++;
      fuera.comprasMonto += aCentimos(c.total);
      continue;
    }
    const { serie, numero } = partirSerieNumero(c.numeroComprobante);
    filas.push({
      orden: c.fechaSistema.getTime(),
      fila: {
        ...vacios(),
        tipo: tipoComprobanteTabla10(c.tipoComprobante),
        serie,
        numero,
        provTipoDoc: tipoDocIdentidad(c.proveedorDoc, c.proveedorTipoDoc),
        provDoc: textoSeguro(c.proveedorDoc),
        provNombre: textoSeguro(c.proveedorNombre),
        total: c.total,
        fechaSistema: fechaLima(c.fechaSistema),
        tipoSistema: c.tipoComprobante,
        origen: "Compra recibida",
        idSistema: c.id,
      },
    });
  }

  for (const g of e.gastos) {
    if (!tieneComprobante(g.tipoDocumento, g.numeroDocumento)) {
      fuera.gastos++;
      fuera.gastosMonto += aCentimos(g.monto);
      continue;
    }
    const { serie, numero } = partirSerieNumero(g.numeroDocumento);
    const igv = g.igv != null && g.igv > 0 ? g.igv : null;
    if (igv === null) gastosSinIgv++;
    filas.push({
      orden: g.fecha.getTime(),
      fila: {
        ...vacios(),
        tipo: tipoComprobanteTabla10(g.tipoDocumento),
        serie,
        numero,
        provTipoDoc: tipoDocIdentidad(g.proveedorDoc),
        provDoc: textoSeguro(g.proveedorDoc),
        provNombre: textoSeguro(g.proveedorNombre),
        bi1: igv === null ? null : aSoles(aCentimos(g.monto) - aCentimos(igv)),
        igv1: igv,
        total: g.monto,
        fechaSistema: fechaDia(g.fecha),
        tipoSistema: g.tipoDocumento,
        origen: "Gasto",
        detalle: textoSeguro([g.categoria, g.descripcion].filter(Boolean).join(" · ")),
        idSistema: g.id,
      },
    });
  }

  const ordenadas = numerarYCompletar(filas, COLUMNAS_COMPRAS);

  const notas = [
    AVISO_DE_TRABAJO,
    "Fecha de emisión (col. 2) vacía: el sistema no guarda la fecha impresa en el comprobante del proveedor. La fecha que se anotó (llegada de la compra o día del gasto) va en «Fecha anotada en el sistema».",
    "Las compras salen con el importe total; base imponible e IGV van vacíos porque la orden de compra guarda el costo de la mercadería, no el IGV de la factura.",
    "Los gastos con IGV anotado van en las columnas 11 y 12 (adquisiciones destinadas a operaciones gravadas). Si el negocio también vende exonerado o inafecto, la prorrata la decide tu contador.",
    "Tipo de comprobante (col. 4): solo factura (01), boleta (03) y notas (07/08) se pasan a la Tabla 10; «recibo» y «ticket» quedan vacíos porque pueden ser varios tipos. El tipo anotado va al final.",
  ];
  if (gastosSinIgv > 0) notas.push(`${gastosSinIgv} gastos con comprobante no tienen el IGV anotado: van solo con el importe total.`);
  if (fuera.compras > 0)
    notas.push(`${fuera.compras} compras recibidas sin comprobante (o con guía) no entran: suman S/ ${formatoSoles(aSoles(fuera.comprasMonto))}.`);
  if (fuera.parciales > 0)
    notas.push(
      `${fuera.parciales} compras recibidas en parte (S/ ${formatoSoles(aSoles(fuera.parcialesMonto))}, el total de la orden) todavía no entran: entran en el libro del mes en que se completan, con esa fecha.`,
    );
  if (fuera.gastos > 0)
    notas.push(`${fuera.gastos} gastos sin comprobante no entran: suman S/ ${formatoSoles(aSoles(fuera.gastosMonto))}.`);
  notas.push("Columnas 3, 6, 13-19 y 21-28 van vacías: el sistema no registra importaciones, detracciones, ISC ni notas de proveedores.");

  return {
    libro: "compras",
    ...TITULO_FORMATO.compras,
    periodo: e.periodo,
    columnas: COLUMNAS_COMPRAS,
    filas: ordenadas,
    totales: sumarColumnas(ordenadas, MONTOS),
    notas,
  };
}
