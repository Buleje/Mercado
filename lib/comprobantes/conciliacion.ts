/**
 * Análisis y conciliación documental (N08): en un período, qué se vendió y qué
 * papel salió de cada venta. Emitido, aceptado y cobrado se dicen por separado;
 * lo fiado no se presenta como plata disponible; cada total trae su detalle
 * (las diferencias, fila por fila).
 *
 * Puro: la clase de la base trae las filas del período, esto las cruza.
 */
import { formatNumber } from "@/lib/format";
import type { Rango } from "./periodo";

export interface ConciliacionComprobante {
  id: string;
  orderId: string | null;
  type: string;
  series: string;
  number: number;
  customerName: string;
  total: number;
  sunatStatus: string;
  createdAt: string;
}

export interface ConciliacionNota {
  id: string;
  numero: string;
  orderId: string | null;
  saleId: string | null;
  status: string;
  motivoCodigo: string;
  motivoDesc: string;
  total: number;
}

export interface ConciliacionPedido {
  id: string;
  customerName: string;
  total: number;
  status: string;
  deuda: boolean;
  createdAt: string;
}

export interface EntradaConciliacion {
  rango: Rango;
  comprobantes: readonly ConciliacionComprobante[];
  notas: readonly ConciliacionNota[];
  /** Pedidos del período (sin borrados). */
  pedidos: readonly ConciliacionPedido[];
  /** Pedidos del período que tienen un comprobante vivo (de cualquier fecha). */
  pedidosConComprobante: ReadonlySet<string>;
  /** Pedidos a los que apuntan los comprobantes del período (de cualquier fecha). */
  pedidosDeComprobantes: ReadonlyMap<string, { total: number; status: string; customerName: string }>;
  /** Pedidos con una nota de crédito emitida (de cualquier fecha). */
  pedidosConNota: ReadonlySet<string>;
  /** Ventas del mostrador agrupadas por el papel que eligió el cajero. */
  ventasMostrador: readonly { tipo: string | null; cantidad: number; total: number }[];
}

export type TipoDiferencia =
  | "pedido-sin-comprobante"
  | "comprobante-sin-operacion"
  | "pedido-inexistente"
  | "cancelado-con-comprobante"
  | "importe-distinto";

export interface Diferencia {
  id: string;
  tipo: TipoDiferencia;
  documento: string | null;
  operacion: string | null;
  cliente: string;
  importeDocumento: number | null;
  importeOperacion: number | null;
  fecha: string;
  explicacion: string;
}

export interface Cifra {
  cantidad: number;
  importe: number;
}

export interface Conciliacion {
  rango: Rango;
  comprobantes: { emitido: Cifra; aceptado: Cifra; pendiente: Cifra; rechazado: Cifra; anulado: Cifra };
  notas: { emitidas: Cifra; borradores: Cifra; anuladas: Cifra; porMotivo: (Cifra & { codigo: string; descripcion: string })[] };
  /** Emitido − notas emitidas. */
  neto: number;
  pedidos: { todos: Cifra; entregados: Cifra; conComprobante: Cifra; sinComprobante: Cifra; enCurso: Cifra; cancelados: Cifra; fiados: Cifra };
  mostrador: { tipo: string; rotulo: string; cantidad: number; importe: number }[];
  diferencias: Diferencia[];
  totalDiferencias: number;
  porTipoDiferencia: Partial<Record<TipoDiferencia, number>>;
}

/** Diferencia de importe que ya no es redondeo (en soles). */
export const TOLERANCIA_SOLES = 0.05;
/** Filas de detalle que viajan al panel; el conteo dice cuántas hay en total. */
export const TOPE_DIFERENCIAS = 200;

const VIVOS = new Set(["accepted", "pending", "retrying"]);
const VENTA = new Set(["boleta", "factura"]);
const EN_CURSO = new Set(["pendiente", "confirmado", "preparando", "en_camino"]);
const r2 = (n: number) => Math.round(n * 100) / 100;
const cero = (): Cifra => ({ cantidad: 0, importe: 0 });
const sumar = (c: Cifra, importe: number) => { c.cantidad += 1; c.importe = r2(c.importe + importe); };
const codigo = (id: string) => `#${id.slice(-6)}`;

const ROTULO_MOSTRADOR: Record<string, string> = {
  ticket: "Ticket (sin comprobante)",
  boleta: "Boleta interna (no electrónica)",
  factura: "Factura interna (no electrónica)",
  cotizacion: "Cotización",
};

/** Sin tipo = ticket (las ventas viejas no lo guardaban). */
function mostradorPorTipo(filas: EntradaConciliacion["ventasMostrador"]): Conciliacion["mostrador"] {
  const porTipo = new Map<string, { cantidad: number; importe: number }>();
  for (const v of filas) {
    const tipo = v.tipo || "ticket";
    const acum = porTipo.get(tipo) ?? { cantidad: 0, importe: 0 };
    acum.cantidad += v.cantidad;
    acum.importe = r2(acum.importe + v.total);
    porTipo.set(tipo, acum);
  }
  return [...porTipo.entries()]
    .map(([tipo, c]) => ({ tipo, rotulo: ROTULO_MOSTRADOR[tipo] ?? tipo, ...c }))
    .sort((a, b) => b.importe - a.importe);
}

export function conciliar(e: EntradaConciliacion): Conciliacion {
  const comprobantes = { emitido: cero(), aceptado: cero(), pendiente: cero(), rechazado: cero(), anulado: cero() };
  const diferencias: Diferencia[] = [];
  const vivosPorPedido = new Map<string, { total: number; docs: string[]; fecha: string }>();

  for (const c of e.comprobantes) {
    if (c.type === "nota_credito" || c.type === "baja") continue;
    const doc = `${c.series}-${c.number}`;
    if (c.sunatStatus === "accepted") sumar(comprobantes.aceptado, c.total);
    else if (c.sunatStatus === "pending" || c.sunatStatus === "retrying") sumar(comprobantes.pendiente, c.total);
    else if (c.sunatStatus === "rejected") sumar(comprobantes.rechazado, c.total);
    else if (c.sunatStatus === "voided") sumar(comprobantes.anulado, c.total);
    if (!VIVOS.has(c.sunatStatus)) continue;
    sumar(comprobantes.emitido, c.total);
    if (!VENTA.has(c.type)) continue;

    if (!c.orderId) {
      diferencias.push({
        id: `sin-operacion:${c.id}`, tipo: "comprobante-sin-operacion", documento: doc, operacion: null,
        cliente: c.customerName, importeDocumento: c.total, importeOperacion: null, fecha: c.createdAt,
        explicacion: "Se emitió sin pedido: si fue una venta de mostrador, anótalo; si no, revisa quién lo emitió.",
      });
      continue;
    }
    const pedido = e.pedidosDeComprobantes.get(c.orderId);
    if (!pedido) {
      diferencias.push({
        id: `inexistente:${c.id}`, tipo: "pedido-inexistente", documento: doc, operacion: c.orderId,
        cliente: c.customerName, importeDocumento: c.total, importeOperacion: null, fecha: c.createdAt,
        explicacion: "Su pedido ya no está (se borró): el comprobante sigue valiendo en SUNAT.",
      });
      continue;
    }
    const acum = vivosPorPedido.get(c.orderId) ?? { total: 0, docs: [], fecha: c.createdAt };
    acum.total = r2(acum.total + c.total);
    acum.docs.push(doc);
    vivosPorPedido.set(c.orderId, acum);
  }

  for (const [orderId, v] of vivosPorPedido) {
    const pedido = e.pedidosDeComprobantes.get(orderId);
    if (!pedido) continue;
    const documento = v.docs.join(", ");
    if (pedido.status === "cancelado" && !e.pedidosConNota.has(orderId)) {
      diferencias.push({
        id: `cancelado:${orderId}`, tipo: "cancelado-con-comprobante", documento, operacion: orderId,
        cliente: pedido.customerName, importeDocumento: v.total, importeOperacion: pedido.total, fecha: v.fecha,
        explicacion: "El pedido se canceló pero su comprobante sigue vigente: corresponde una nota de crédito.",
      });
    } else if (pedido.status !== "cancelado" && Math.abs(v.total - pedido.total) > TOLERANCIA_SOLES) {
      diferencias.push({
        id: `importe:${orderId}`, tipo: "importe-distinto", documento, operacion: orderId,
        cliente: pedido.customerName, importeDocumento: v.total, importeOperacion: pedido.total, fecha: v.fecha,
        explicacion: `El comprobante suma S/ ${formatNumber(v.total, 2)} y el pedido ${codigo(orderId)} S/ ${formatNumber(pedido.total, 2)}.`,
      });
    }
  }

  const pedidos = { todos: cero(), entregados: cero(), conComprobante: cero(), sinComprobante: cero(), enCurso: cero(), cancelados: cero(), fiados: cero() };
  for (const p of e.pedidos) {
    sumar(pedidos.todos, p.total);
    if (p.status === "cancelado") { sumar(pedidos.cancelados, p.total); continue; }
    if (p.deuda) sumar(pedidos.fiados, p.total);
    if (EN_CURSO.has(p.status)) { sumar(pedidos.enCurso, p.total); continue; }
    sumar(pedidos.entregados, p.total);
    if (e.pedidosConComprobante.has(p.id)) { sumar(pedidos.conComprobante, p.total); continue; }
    sumar(pedidos.sinComprobante, p.total);
    diferencias.push({
      id: `sin-comprobante:${p.id}`, tipo: "pedido-sin-comprobante", documento: null, operacion: p.id,
      cliente: p.customerName, importeDocumento: null, importeOperacion: p.total, fecha: p.createdAt,
      explicacion: "Entregado sin boleta ni factura: emítela o deja anotado por qué no lleva.",
    });
  }

  const notas = { emitidas: cero(), borradores: cero(), anuladas: cero(), porMotivo: [] as Conciliacion["notas"]["porMotivo"] };
  const motivos = new Map<string, Cifra & { codigo: string; descripcion: string }>();
  for (const n of e.notas) {
    if (n.status === "BORRADOR") { sumar(notas.borradores, n.total); continue; }
    if (n.status === "ANULADA") { sumar(notas.anuladas, n.total); continue; }
    sumar(notas.emitidas, n.total);
    const m = motivos.get(n.motivoCodigo) ?? { codigo: n.motivoCodigo, descripcion: n.motivoDesc, cantidad: 0, importe: 0 };
    sumar(m, n.total);
    motivos.set(n.motivoCodigo, m);
  }
  notas.porMotivo = [...motivos.values()].sort((a, b) => b.importe - a.importe);

  const porTipoDiferencia: Partial<Record<TipoDiferencia, number>> = {};
  for (const d of diferencias) porTipoDiferencia[d.tipo] = (porTipoDiferencia[d.tipo] ?? 0) + 1;
  diferencias.sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));

  return {
    rango: e.rango,
    comprobantes,
    notas,
    neto: r2(comprobantes.emitido.importe - notas.emitidas.importe),
    pedidos,
    mostrador: mostradorPorTipo(e.ventasMostrador),
    diferencias: diferencias.slice(0, TOPE_DIFERENCIAS),
    totalDiferencias: diferencias.length,
    porTipoDiferencia,
  };
}
