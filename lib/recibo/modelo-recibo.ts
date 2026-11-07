/**
 * lib/recibo/modelo-recibo.ts — UN modelo del recibo de una venta del POS para
 * todos sus dibujos: la vista previa del modal «¡Venta completada!», la hoja
 * que se imprime (ticket 80 mm, 58 mm o A4), la página /venta/[id]/recibo y el
 * ticket térmico ESC/POS.
 *
 * Reglas que sigue (Perú, SUNAT):
 *  - Cada tipo con su nombre: TICKET DE VENTA (no es comprobante de pago),
 *    BOLETA DE VENTA ELECTRÓNICA, FACTURA ELECTRÓNICA, COTIZACIÓN y PROFORMA
 *    (las dos últimas sin valor tributario y con validez).
 *  - Los montos son los de la venta GUARDADA (servidor). El desglose de la
 *    boleta/factura (op. gravada, exonerada, IGV) sale de la misma función con
 *    que se emite (`armarLineasComprobante`): no hay una segunda regla del IGV.
 *  - Boleta o factura NO emitida: sin hash, sin QR y sin la leyenda de
 *    «Representación impresa»; dice que está pendiente de emisión. Una venta
 *    del POS hoy no viaja a la SUNAT (sólo los pedidos se emiten), así que
 *    `emision` sólo llega cuando exista el comprobante electrónico.
 *
 * Puro: sin React ni fetch (lo prueban los tests y lo usa el servidor si hace falta).
 */

import { armarLineasComprobante, TASA_IGV } from "@/lib/sunat/lineas-comprobante";
import { TOPE_BOLETA_SIN_DNI } from "@/lib/sunat/boleta-dni";
import { montoEnLetras } from "@/lib/adelantos/comprobante";
import { formatDateNumeric, formatTime } from "@/lib/format";
import { formatearCelularPe } from "@/lib/tienda-cliente/celular";

export type TipoRecibo = "ticket" | "boleta" | "factura" | "cotizacion" | "proforma";
export type FormatoRecibo = "ticket80" | "ticket58" | "a4";

export const FORMATOS_RECIBO: { id: FormatoRecibo; etiqueta: string; corto: string }[] = [
  { id: "ticket80", etiqueta: "Ticket 80 mm", corto: "80 mm" },
  { id: "ticket58", etiqueta: "Ticket 58 mm", corto: "58 mm" },
  { id: "a4", etiqueta: "A4", corto: "A4" },
];

/** Días que vale una cotización o proforma: los mismos con que la ruta de ventas crea la cotización. */
export const DIAS_DE_VALIDEZ = 15;

/** Dónde se valida un comprobante electrónico si el emisor no dio otra dirección. */
export const CONSULTA_SUNAT = "https://e-consulta.sunat.gob.pe/ol-ti-itconsvalicpe/ConsValiCpe.htm";

const NOMBRE: Record<TipoRecibo, { titulo: string; corto: string }> = {
  ticket: { titulo: "TICKET DE VENTA", corto: "Ticket" },
  boleta: { titulo: "BOLETA DE VENTA ELECTRÓNICA", corto: "Boleta" },
  factura: { titulo: "FACTURA ELECTRÓNICA", corto: "Factura" },
  cotizacion: { titulo: "COTIZACIÓN", corto: "Cotización" },
  proforma: { titulo: "PROFORMA", corto: "Proforma" },
};

const PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  fiado: "Fiado (a crédito)",
  mixto: "Pago mixto",
  trueque: "Trueque",
  transferencia: "Transferencia",
};

export function tipoDeRecibo(t: string | null | undefined): TipoRecibo {
  return t === "boleta" || t === "factura" || t === "cotizacion" || t === "proforma" ? t : "ticket";
}

export function nombreDelTipo(t: string | null | undefined): { titulo: string; corto: string } {
  return NOMBRE[tipoDeRecibo(t)];
}

export function etiquetaDePago(metodo: string | null | undefined): string {
  const m = (metodo ?? "").trim().toLowerCase();
  return PAGO[m] ?? (m ? m.charAt(0).toUpperCase() + m.slice(1) : "—");
}

// ── Entrada ─────────────────────────────────────────────────────────────────

export interface NegocioRecibo {
  nombre?: string | null;
  razonSocial?: string | null;
  ruc?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  correo?: string | null;
  logoUrl?: string | null;
  pie?: string | null;
}

export interface LineaRecibo {
  nombre: string;
  cantidad: number;
  /** Precio unitario COBRADO (neto del descuento por ítem, con IGV): el que guardó el servidor. */
  precio: number;
  unidad?: string | null;
  /** `Product.taxType`; vacío = gravado (igual que al emitir). */
  taxType?: string | null;
}

export interface EmisionRecibo {
  hash: string;
  /** QR ya dibujado (data URL) con el texto que pide la SUNAT. */
  qrDataUrl?: string | null;
  consultaUrl?: string | null;
}

export interface EntradaRecibo {
  ventaId: string;
  tipo: string | null | undefined;
  /** `Sale.comprobanteNumero` (B001-00000001, F001-…, COT-…, PRO-…). El ticket no tiene. */
  numero?: string | null;
  fecha: string | Date;
  negocio: NegocioRecibo | null | undefined;
  lineas: LineaRecibo[];
  /** `Sale.total`: lo cobrado. Nunca se recalcula acá. */
  total: number;
  /** `Sale.descuentoMonto`: descuento global sobre la venta. */
  descuento?: number | null;
  pago: { metodo: string | null | undefined; recibido?: number | null; vuelto?: number | null; detalle?: string | null };
  cliente?: { nombre?: string | null; telefono?: string | null; documento?: string | null } | null;
  atendio?: string | null;
  emision?: EmisionRecibo | null;
  /** Venta guardada sin conexión: los montos son del POS hasta que el servidor la confirme. */
  provisional?: boolean;
}

// ── Salida ──────────────────────────────────────────────────────────────────

export interface ModeloRecibo {
  tipo: TipoRecibo;
  titulo: string;
  nombreCorto: string;
  numero: string;
  esComprobanteDePago: boolean;
  esElectronico: boolean;
  emitido: boolean;
  pendienteDeEmision: boolean;
  negocio: Required<{ [K in keyof NegocioRecibo]: string | null }>;
  fecha: string;
  hora: string;
  validoHasta: string | null;
  atendio: string | null;
  cliente: { etiquetaDoc: "DNI" | "RUC" | "Doc." | null; documento: string | null; nombre: string | null; telefono: string | null } | null;
  lineas: { cantidad: number; nombre: string; unidad: string | null; precio: number; importe: number; valorUnitario: number }[];
  totales: {
    subtotal: number | null;
    descuento: number | null;
    gravada: number;
    exonerada: number;
    inafecta: number;
    igv: number;
    tasaIgvPct: number;
    total: number;
    enLetras: string;
  };
  pago: { metodo: string; detalle: { metodo: string; monto: number }[]; recibido: number | null; vuelto: number | null };
  leyendas: string[];
  emision: EmisionRecibo | null;
  /** Lo que falta cargar para que este tipo salga completo (se muestra en el panel, no en la hoja). */
  faltantes: string[];
  provisional: boolean;
}

const limpio = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const centimos = (n: number) => Math.round(n * 100) / 100;

function detalleDePago(detalle: string | null | undefined): { metodo: string; monto: number }[] {
  if (!detalle) return [];
  try {
    const arr: unknown = JSON.parse(detalle);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p) => (p && typeof p === "object" ? (p as { method?: unknown; amount?: unknown }) : null))
      .filter((p): p is { method?: unknown; amount?: unknown } => !!p && typeof p.amount === "number")
      .map((p) => ({ metodo: etiquetaDePago(typeof p.method === "string" ? p.method : ""), monto: p.amount as number }));
  } catch {
    return [];
  }
}

function etiquetaDocumento(doc: string | null): "DNI" | "RUC" | "Doc." | null {
  if (!doc) return null;
  if (/^\d{8}$/.test(doc)) return "DNI";
  if (/^\d{11}$/.test(doc)) return "RUC";
  return "Doc.";
}

/** Arma el recibo. Los montos llegan del servidor; acá sólo se ordenan y se nombran. */
export function armarRecibo(e: EntradaRecibo): ModeloRecibo {
  const tipo = tipoDeRecibo(e.tipo);
  const { titulo, corto } = NOMBRE[tipo];
  const esElectronico = tipo === "boleta" || tipo === "factura";
  const emitido = esElectronico && !!limpio(e.emision?.hash);
  const fecha = new Date(e.fecha);

  const negocio = {
    nombre: limpio(e.negocio?.nombre),
    razonSocial: limpio(e.negocio?.razonSocial),
    ruc: limpio(e.negocio?.ruc),
    direccion: limpio(e.negocio?.direccion),
    telefono: limpio(formatearCelularPe(e.negocio?.telefono)), // «51921585006» → «921 585 006»
    correo: limpio(e.negocio?.correo),
    logoUrl: limpio(e.negocio?.logoUrl),
    pie: limpio(e.negocio?.pie),
  };

  const documento = limpio(e.cliente?.documento);
  const nombreCliente = limpio(e.cliente?.nombre);
  const telefono = limpio(formatearCelularPe(e.cliente?.telefono));
  const cliente = documento || nombreCliente || telefono
    ? { etiquetaDoc: etiquetaDocumento(documento), documento, nombre: nombreCliente, telefono }
    : null;

  // Desglose con la regla de la emisión (afectación por producto, descuento prorrateado).
  const { items, totales } = armarLineasComprobante(
    e.lineas.map((l) => ({ name: l.nombre, quantity: l.cantidad, price: l.precio, taxType: l.taxType })),
    { totalCobrado: e.total },
  );
  const descuento = e.descuento != null && e.descuento > 0 ? centimos(e.descuento) : null;

  const lineas = e.lineas.map((l, i) => ({
    cantidad: l.cantidad,
    nombre: l.nombre,
    unidad: limpio(l.unidad),
    precio: l.precio,
    importe: centimos(l.precio * l.cantidad),
    valorUnitario: items[i]?.valor_unitario ?? l.precio,
  }));

  const metodo = (e.pago.metodo ?? "").trim().toLowerCase();
  const detalle = detalleDePago(e.pago.detalle);
  const recibido = e.pago.recibido != null && e.pago.recibido > 0 ? centimos(e.pago.recibido) : null;
  const vuelto = e.pago.vuelto != null && e.pago.vuelto > 0 ? centimos(e.pago.vuelto) : null;
  const muestraRecibido = metodo === "efectivo" || (recibido != null && recibido > e.total);

  const validoHasta =
    tipo === "cotizacion" || tipo === "proforma"
      ? formatDateNumeric(new Date(fecha.getTime() + DIAS_DE_VALIDEZ * 86_400_000))
      : null;

  const leyendas: string[] = [];
  if (tipo === "ticket") leyendas.push("Este ticket no es un comprobante de pago. Si necesitas boleta o factura, pídela en caja.");
  if (tipo === "cotizacion" || tipo === "proforma") {
    leyendas.push(`Documento sin valor tributario. Precios válidos hasta el ${validoHasta}.`);
  }
  if (esElectronico && emitido) leyendas.push(`Representación impresa de la ${tipo === "boleta" ? "Boleta de Venta Electrónica" : "Factura Electrónica"}.`);
  if (esElectronico && !emitido) {
    leyendas.push("Pendiente de emisión: aún no se envió a la SUNAT. La representación impresa con su código QR sale al emitirla.");
  }

  const faltantes: string[] = [];
  if (!negocio.nombre && !negocio.razonSocial) faltantes.push("el nombre del negocio");
  if (esElectronico) {
    if (!negocio.ruc) faltantes.push("el RUC del negocio");
    if (!negocio.razonSocial) faltantes.push("la razón social del negocio");
    if (!negocio.direccion) faltantes.push("la dirección fiscal del negocio");
  }
  if (tipo === "factura") {
    if (!documento || etiquetaDocumento(documento) !== "RUC") faltantes.push("el RUC del cliente");
    if (!nombreCliente) faltantes.push("la razón social del cliente");
  }
  if (tipo === "boleta" && e.total > TOPE_BOLETA_SIN_DNI && etiquetaDocumento(documento) !== "DNI") {
    faltantes.push(`el DNI del cliente (boleta de más de S/ ${TOPE_BOLETA_SIN_DNI})`);
  }

  // Ticket sin correlativo: el final del id (el principio de un cuid es la hora y se repite entre ventas).
  const numero = limpio(e.numero) ?? (tipo === "ticket" ? e.ventaId.slice(-8).toUpperCase() : "por asignar");
  if (!limpio(e.numero) && tipo !== "ticket") faltantes.push("el número del comprobante");

  return {
    tipo,
    titulo,
    nombreCorto: corto,
    numero,
    esComprobanteDePago: esElectronico,
    esElectronico,
    emitido,
    pendienteDeEmision: esElectronico && !emitido,
    negocio,
    fecha: formatDateNumeric(fecha),
    hora: formatTime(fecha),
    validoHasta,
    atendio: limpio(e.atendio),
    cliente,
    lineas,
    totales: {
      subtotal: descuento != null ? centimos(e.total + descuento) : null,
      descuento,
      gravada: totales.gravada,
      exonerada: totales.exonerada,
      inafecta: totales.inafecta,
      igv: totales.igv,
      tasaIgvPct: Math.round(TASA_IGV * 100),
      total: centimos(e.total),
      enLetras: `${montoEnLetras(e.total)} soles`.toUpperCase(),
    },
    pago: {
      metodo: etiquetaDePago(metodo),
      detalle,
      recibido: muestraRecibido ? recibido : null,
      vuelto: muestraRecibido ? vuelto : null,
    },
    leyendas,
    emision: emitido && e.emision ? { hash: e.emision.hash, qrDataUrl: e.emision.qrDataUrl ?? null, consultaUrl: e.emision.consultaUrl ?? CONSULTA_SUNAT } : null,
    faltantes,
    provisional: !!e.provisional,
  };
}

/** El mismo recibo para la impresora térmica por ESC/POS (`lib/thermal-printer.ts`). */
export function datosTermicos(m: ModeloRecibo, ventaId: string, fecha: Date): {
  businessName: string; businessAddress?: string; businessPhone?: string; footerText?: string;
  ticketId: string; date: Date; items: { name: string; quantity: number; price: number; unit: string }[];
  total: number; payment: string; amountPaid?: number; change?: number;
} {
  return {
    businessName: m.negocio.nombre ?? m.negocio.razonSocial ?? "",
    businessAddress: m.negocio.direccion ?? undefined,
    businessPhone: m.negocio.telefono ?? undefined,
    footerText: m.negocio.pie ?? undefined,
    ticketId: m.tipo === "ticket" ? ventaId : m.numero,
    date: fecha,
    items: m.lineas.map((l) => ({ name: l.nombre, quantity: l.cantidad, price: l.precio, unit: l.unidad ?? "" })),
    total: m.totales.total,
    payment: m.pago.metodo.toLowerCase() === "efectivo" ? "efectivo" : m.pago.metodo,
    amountPaid: m.pago.recibido ?? undefined,
    change: m.pago.vuelto ?? undefined,
  };
}
