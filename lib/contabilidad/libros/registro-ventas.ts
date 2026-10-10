/**
 * Formato 14.1 «Registro de Ventas e Ingresos» — libro de trabajo del mes.
 *
 * De dónde sale cada fila:
 *   · comprobante electrónico emitido (`SunatInvoice`): serie, número, IGV y total guardados;
 *   · venta del POS (`Sale`): el ticket interno NO es comprobante SUNAT → tipo/serie vacíos
 *     salvo que la venta tenga número de boleta/factura anotado;
 *   · pedido online ENTREGADO sin comprobante electrónico (con comprobante ya sale arriba);
 *   · nota de crédito interna EMITIDA, en negativo.
 *
 * Lo que NO resta y por eso se avisa en «Notas»: la devolución del POS o de un pedido que
 * no tiene nota de crédito (`Return`): el resumen de caja la descuenta, el libro no, porque
 * sin nota de crédito no hay comprobante que reste.
 *
 * Base/exonerada/inafecta/IGV de lo que no tiene comprobante: la MISMA regla que arma la
 * boleta electrónica (`armarLineasComprobante`: afectación de cada producto + total cobrado).
 * Es un derivado y la hoja «Notas» lo dice.
 */
import { armarLineasComprobante, TASA_IGV, type LineaDeVenta } from "@/lib/sunat/lineas-comprobante";
import {
  AVISO_DE_TRABAJO,
  aCentimos,
  aSoles,
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

export interface LineaVendida {
  nombre: string;
  cantidad: number;
  precio: number;
  taxType: string | null;
}

export interface ComprobanteEmitido {
  id: string;
  /** boleta | factura | nota_credito | baja */
  tipo: string;
  serie: string;
  numero: number;
  clienteDoc: string | null;
  clienteNombre: string;
  subtotal: number;
  igv: number;
  total: number;
  /** pending | accepted | rejected | voided */
  estado: string;
  emitidoEn: Date;
  pedidoId: string | null;
}

export interface VentaPos {
  id: string;
  fecha: Date;
  total: number;
  comprobanteTipo: string | null;
  comprobanteNumero: string | null;
  comprobanteDoc: string | null;
  clienteNombre: string | null;
  clienteDoc: string | null;
  clienteTipoDoc: string | null;
  lineas: LineaVendida[];
}

export interface PedidoEntregado {
  id: string;
  fecha: Date;
  total: number;
  clienteNombre: string;
  clienteDoc: string | null;
  clienteTipoDoc: string | null;
  lineas: LineaVendida[];
}

export interface NotaCreditoInterna {
  id: string;
  numero: string;
  fecha: Date;
  igv: number;
  total: number;
  motivo: string;
  /** La venta o el pedido que corrige, si se encontró. */
  referencia: { fecha: Date; tipo: string | null; serie: string | null; numero: string | null } | null;
}

/** Devolución (POS o pedido) del mes. `conNotaCredito` = la venta o el pedido tiene una nota EMITIDA. */
export interface DevolucionDelMes {
  id: string;
  origen: "pos" | "pedido";
  total: number;
  conNotaCredito: boolean;
}

export interface EntradaRegistroVentas {
  periodo: string;
  comprobantes: ComprobanteEmitido[];
  ventasPos: VentaPos[];
  pedidos: PedidoEntregado[];
  notasCredito: NotaCreditoInterna[];
  /** Pedidos del mes que no cuentan todavía (pendiente, en camino…). Solo para la nota. */
  pedidosSinEntregar: number;
  /**
   * Pedidos de `pedidos` que tienen boleta/factura válida emitida EN CUALQUIER MES: la del
   * mismo mes ya sale en `comprobantes`; la de otro mes entra en el libro de ese mes.
   */
  pedidosConComprobante: string[];
  devoluciones: DevolucionDelMes[];
}

const MONTOS = ["exportacion", "baseGravada", "exonerada", "inafecta", "isc", "igv", "otros", "total", "sinDesglose"] as const;

export const COLUMNAS_VENTAS: ColumnaLibro[] = [
  { clave: "correlativo", rotulo: "Número correlativo del registro o código único de la operación", numero: 1 },
  { clave: "fechaEmision", rotulo: "Fecha de emisión del comprobante de pago o documento", numero: 2 },
  { clave: "fechaVencimiento", rotulo: "Fecha de vencimiento y/o pago", numero: 3 },
  { clave: "tipo", rotulo: "Comprobante: tipo (Tabla 10)", numero: 4 },
  { clave: "serie", rotulo: "Comprobante: N° serie o N° de serie de la máquina registradora", numero: 5 },
  { clave: "numero", rotulo: "Comprobante: número", numero: 6 },
  { clave: "clienteTipoDoc", rotulo: "Cliente: documento de identidad, tipo (Tabla 2)", numero: 7 },
  { clave: "clienteDoc", rotulo: "Cliente: documento de identidad, número", numero: 8 },
  { clave: "clienteNombre", rotulo: "Cliente: apellidos y nombres, denominación o razón social", numero: 9 },
  { clave: "exportacion", rotulo: "Valor facturado de la exportación", numero: 10, soles: true },
  { clave: "baseGravada", rotulo: "Base imponible de la operación gravada", numero: 11, soles: true },
  { clave: "exonerada", rotulo: "Importe total de la operación exonerada", numero: 12, soles: true },
  { clave: "inafecta", rotulo: "Importe total de la operación inafecta", numero: 13, soles: true },
  { clave: "isc", rotulo: "ISC", numero: 14, soles: true },
  { clave: "igv", rotulo: "IGV y/o IPM", numero: 15, soles: true },
  { clave: "otros", rotulo: "Otros tributos y cargos que no forman parte de la base imponible", numero: 16, soles: true },
  { clave: "total", rotulo: "Importe total del comprobante de pago", numero: 17, soles: true },
  { clave: "tipoCambio", rotulo: "Tipo de cambio", numero: 18 },
  { clave: "refFecha", rotulo: "Referencia: fecha del comprobante que se modifica", numero: 19 },
  { clave: "refTipo", rotulo: "Referencia: tipo (Tabla 10)", numero: 20 },
  { clave: "refSerie", rotulo: "Referencia: serie", numero: 21 },
  { clave: "refNumero", rotulo: "Referencia: N° del comprobante", numero: 22 },
  { clave: "sinDesglose", rotulo: "Valor sin IGV sin desglosar (sistema)", soles: true },
  { clave: "origen", rotulo: "Origen en el sistema" },
  { clave: "estado", rotulo: "Estado en el sistema" },
  { clave: "idSistema", rotulo: "Código en el sistema" },
];

type Montos = Partial<Record<(typeof MONTOS)[number], number | null>>;

const lineasDeVenta = (lineas: readonly LineaVendida[]): LineaDeVenta[] =>
  lineas.map((l) => ({ name: l.nombre, quantity: l.cantidad, price: l.precio, taxType: l.taxType }));

/**
 * Montos de una venta sin comprobante, con la regla de la boleta. Sin líneas
 * (venta libre) no hay con qué separar gravado de exonerado: va «sin desglose».
 */
export function desglosarVenta(lineas: readonly LineaVendida[], total: number): Montos {
  if (lineas.length === 0) return { total, sinDesglose: total };
  const t = armarLineasComprobante(lineasDeVenta(lineas), { totalCobrado: total }).totales;
  return {
    baseGravada: t.gravada || null,
    exonerada: t.exonerada || null,
    inafecta: t.inafecta || null,
    igv: t.igv,
    otros: t.otrosCargos || null,
    total: t.total,
  };
}

/**
 * Montos de un comprobante emitido: IGV y total son los GUARDADOS. Si todo el
 * valor es gravado (IGV = 18 % del subtotal, ±1 céntimo) va a la base gravada;
 * si no, el valor queda «sin desglose» para que lo separe el contador.
 */
export function montosDeComprobante(c: Pick<ComprobanteEmitido, "subtotal" | "igv" | "total">): Montos {
  const todoGravado = c.igv > 0 && Math.abs(aCentimos(c.subtotal * TASA_IGV) - aCentimos(c.igv)) <= 1;
  return todoGravado
    ? { baseGravada: c.subtotal, igv: c.igv, total: c.total }
    : { igv: c.igv, total: c.total, sinDesglose: c.subtotal };
}

const negar = (m: Montos): Montos =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === "number" ? -v : v])) as Montos;

function fila(base: FilaLibro, montos: Montos): FilaLibro {
  const out: FilaLibro = { ...base };
  for (const k of MONTOS) out[k] = montos[k] ?? null;
  return out;
}

export function armarRegistroVentas(e: EntradaRegistroVentas): LibroContador {
  const notas: string[] = [AVISO_DE_TRABAJO];
  const filas: { orden: number; fila: FilaLibro }[] = [];
  const pedidosConComprobante = new Set<string>();
  const comprobanteEnOtroMes = new Set(e.pedidosConComprobante);
  let rechazados = 0;
  let anulados = 0;

  for (const c of e.comprobantes) {
    if (c.tipo === "baja") continue; // comunicación de baja: no es un comprobante
    if (c.estado === "rejected") {
      rechazados++;
      continue;
    }
    if (c.pedidoId) pedidosConComprobante.add(c.pedidoId);
    const anulado = c.estado === "voided";
    if (anulado) anulados++;
    filas.push({
      orden: c.emitidoEn.getTime(),
      fila: fila(
        {
          fechaEmision: fechaLima(c.emitidoEn),
          tipo: tipoComprobanteTabla10(c.tipo),
          serie: c.serie,
          numero: String(c.numero),
          clienteTipoDoc: tipoDocIdentidad(c.clienteDoc),
          clienteDoc: textoSeguro(c.clienteDoc),
          clienteNombre: textoSeguro(c.clienteNombre),
          origen: "Comprobante electrónico",
          estado: anulado ? "anulado" : c.estado === "accepted" ? "aceptado por SUNAT" : "pendiente en SUNAT",
          idSistema: c.id,
        },
        // La nota de crédito resta: se guarda en positivo, en el registro va en negativo.
        anulado ? { total: 0, igv: 0, baseGravada: 0 } : c.tipo === "nota_credito" ? negar(montosDeComprobante(c)) : montosDeComprobante(c),
      ),
    });
  }

  let posSinComprobante = 0;
  for (const v of e.ventasPos) {
    const conNumero = Boolean(v.comprobanteNumero?.trim());
    const tipo = conNumero ? tipoComprobanteTabla10(v.comprobanteTipo) : null;
    if (!tipo) posSinComprobante++;
    const { serie, numero } = tipo ? partirSerieNumero(v.comprobanteNumero) : { serie: null, numero: null };
    const doc = v.comprobanteDoc?.trim() || v.clienteDoc;
    filas.push({
      orden: v.fecha.getTime(),
      fila: fila(
        {
          fechaEmision: fechaLima(v.fecha),
          tipo,
          serie,
          numero,
          clienteTipoDoc: tipoDocIdentidad(doc, v.comprobanteDoc?.trim() ? null : v.clienteTipoDoc),
          clienteDoc: textoSeguro(doc),
          clienteNombre: textoSeguro(v.clienteNombre),
          origen: "Venta POS",
          estado: tipo ? `${v.comprobanteTipo} anotada en la venta` : "ticket interno, sin comprobante electrónico",
          idSistema: v.id,
        },
        desglosarVenta(v.lineas, v.total),
      ),
    });
  }

  let pedidosSinComprobante = 0;
  let pedidosConComprobanteFuera = 0;
  for (const p of e.pedidos) {
    if (pedidosConComprobante.has(p.id)) continue;
    // Su boleta/factura es de otro mes: entra en ese libro, con el comprobante (no dos veces).
    if (comprobanteEnOtroMes.has(p.id)) {
      pedidosConComprobanteFuera++;
      continue;
    }
    pedidosSinComprobante++;
    filas.push({
      orden: p.fecha.getTime(),
      fila: fila(
        {
          fechaEmision: fechaLima(p.fecha),
          clienteTipoDoc: tipoDocIdentidad(p.clienteDoc, p.clienteTipoDoc),
          clienteDoc: textoSeguro(p.clienteDoc),
          clienteNombre: textoSeguro(p.clienteNombre),
          origen: "Pedido online entregado",
          estado: "sin comprobante electrónico",
          idSistema: p.id,
        },
        desglosarVenta(p.lineas, p.total),
      ),
    });
  }

  for (const n of e.notasCredito) {
    const montos =
      n.igv > 0 ? { baseGravada: aSoles(aCentimos(n.total) - aCentimos(n.igv)), igv: n.igv, total: n.total } : { total: n.total, sinDesglose: n.total };
    filas.push({
      orden: n.fecha.getTime(),
      fila: fila(
        {
          fechaEmision: fechaLima(n.fecha),
          tipo: "07",
          numero: textoSeguro(n.numero),
          refFecha: fechaLima(n.referencia?.fecha),
          refTipo: n.referencia?.tipo ?? null,
          refSerie: n.referencia?.serie ?? null,
          refNumero: n.referencia?.numero ?? null,
          origen: "Nota de crédito interna",
          estado: textoSeguro(n.motivo) ?? "emitida",
          idSistema: n.id,
        },
        negar(montos),
      ),
    });
  }

  const ordenadas = numerarYCompletar(filas, COLUMNAS_VENTAS);

  if (posSinComprobante > 0)
    notas.push(
      `${posSinComprobante} ventas del POS salen sin tipo, serie ni número: el ticket interno no es un comprobante de pago de SUNAT. Tu contador decide cómo las declara (por ejemplo, en el resumen diario de boletas).`,
    );
  if (pedidosSinComprobante > 0)
    notas.push(`${pedidosSinComprobante} pedidos online entregados no tienen comprobante electrónico emitido desde el sistema.`);
  if (pedidosConComprobanteFuera > 0)
    notas.push(
      `${pedidosConComprobanteFuera} pedidos entregados de este mes tienen su boleta o factura emitida en otro mes: entran en el libro de ese mes, con el comprobante.`,
    );
  if (e.pedidosSinEntregar > 0)
    notas.push(
      `${e.pedidosSinEntregar} pedidos de este mes todavía no están entregados ni cancelados y no salen. Cuando se entreguen entran en ESTE mes (el del pedido): si ya le pasaste el libro a tu contador, bájalo de nuevo.`,
    );
  for (const origen of ["pos", "pedido"] as const) {
    const sin = e.devoluciones.filter((d) => d.origen === origen && !d.conNotaCredito);
    if (sin.length === 0) continue;
    const monto = aSoles(sin.reduce((c, d) => c + aCentimos(d.total), 0));
    notas.push(
      `${sin.length} devoluciones ${origen === "pos" ? "del POS" : "de pedidos"} por S/ ${formatoSoles(monto)} no tienen nota de crédito: la venta sigue entera en este libro (el resumen de caja sí las resta). Para que resten aquí, emite la nota de crédito.`,
    );
  }
  notas.push(
    "Base imponible, exonerado, inafecto e IGV de las ventas sin comprobante: calculados por el sistema con la misma regla que arma la boleta electrónica (afectación de cada producto, IGV 18 %, descuento prorrateado). Es un cálculo, no un dato del papel.",
  );
  if (anulados > 0) notas.push(`${anulados} comprobantes anulados van con importes en cero y estado «anulado».`);
  if (rechazados > 0) notas.push(`${rechazados} comprobantes rechazados por SUNAT no entran: no son comprobantes válidos.`);
  if (ordenadas.some((f) => typeof f.sinDesglose === "number"))
    notas.push("«Valor sin IGV sin desglosar»: el sistema no sabe qué parte es gravada, exonerada o inafecta; sepáralo con el comprobante.");
  notas.push(
    "Fecha de vencimiento (col. 3), exportación (10), ISC (14) y tipo de cambio (18) van vacíos: el negocio vende en soles, en el país y no los registra.",
  );

  return {
    libro: "ventas",
    ...TITULO_FORMATO.ventas,
    periodo: e.periodo,
    columnas: COLUMNAS_VENTAS,
    filas: ordenadas,
    totales: sumarColumnas(ordenadas, MONTOS),
    notas,
  };
}
