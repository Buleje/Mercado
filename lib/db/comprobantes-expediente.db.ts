/**
 * lib/db/comprobantes-expediente.db.ts
 *
 * Expediente de la operación (N03): de un pedido o una venta del mostrador,
 * todos sus papeles y cobros. Sólo lectura y siempre dentro del negocio:
 * cada consulta lleva `tenantId`, así un enlace `?expediente=<id>` de otro
 * negocio no encuentra nada (criterio de N03: no revelar datos de otro).
 *
 * Se abre por el id de cualquiera de sus papeles (pedido, venta, comprobante,
 * nota, guía, cotización) o por lo que la persona escribe: «#a1b2c3»,
 * «B001-12», «NC-0003», «GRR-0001», «…-COT-0004».
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { interpretarBusqueda } from "@/lib/comprobantes/busqueda";
import { armarExpediente, type EntradaExpediente, type Expediente, type OperacionCruda } from "@/lib/comprobantes/expediente";

type Operacion = { clase: "pedido" | "venta"; id: string };
type Destino =
  | { tipo: "operacion"; op: Operacion }
  | { tipo: "suelto"; clase: "comprobante" | "nota" | "guia" | "cotizacion"; id: string };

export type ResultadoExpediente = { ok: true; expediente: Expediente } | { ok: false; motivo: "no-encontrado" | "ambiguo" };

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const POS_RE = /Generada automáticamente desde venta POS (\S+)/;
const COT_RE = /Convertido desde cotización (\S+)/;

async function operacionDeCotizacion(tenantId: string, numero: string, notas: string | null): Promise<Operacion | null> {
  const pedido = await prisma.order.findFirst({ where: { tenantId, notes: `Convertido desde cotización ${numero}` }, select: { id: true } });
  if (pedido) return { clase: "pedido", id: pedido.id };
  const venta = notas ? POS_RE.exec(notas)?.[1] : undefined;
  if (venta && (await prisma.sale.findFirst({ where: { tenantId, id: venta }, select: { id: true } }))) return { clase: "venta", id: venta };
  return null;
}

/** El id exacto de cualquier papel, o lo que la persona escribió. */
async function resolver(tenantId: string, ref: string): Promise<Destino | "ambiguo" | null> {
  const [pedido, venta, comp, nota, guia, cot] = await Promise.all([
    prisma.order.findFirst({ where: { tenantId, id: ref }, select: { id: true } }),
    prisma.sale.findFirst({ where: { tenantId, id: ref }, select: { id: true } }),
    prisma.sunatInvoice.findFirst({ where: { tenantId, id: ref }, select: { id: true, orderId: true } }),
    prisma.notaCredito.findFirst({ where: { tenantId, OR: [{ id: ref }, { numero: { equals: ref, mode: "insensitive" } }] }, select: { id: true, orderId: true, saleId: true } }),
    prisma.guiaRemision.findFirst({ where: { tenantId, OR: [{ id: ref }, { numero: { equals: ref, mode: "insensitive" } }] }, select: { id: true, orderId: true } }),
    prisma.cotizacion.findFirst({ where: { tenantId, OR: [{ id: ref }, { numero: { equals: ref, mode: "insensitive" } }] }, select: { id: true, numero: true, notas: true } }),
  ]);
  if (pedido) return { tipo: "operacion", op: { clase: "pedido", id: pedido.id } };
  if (venta) return { tipo: "operacion", op: { clase: "venta", id: venta.id } };
  if (comp) return comp.orderId ? { tipo: "operacion", op: { clase: "pedido", id: comp.orderId } } : { tipo: "suelto", clase: "comprobante", id: comp.id };
  if (nota) {
    if (nota.orderId) return { tipo: "operacion", op: { clase: "pedido", id: nota.orderId } };
    if (nota.saleId) return { tipo: "operacion", op: { clase: "venta", id: nota.saleId } };
    return { tipo: "suelto", clase: "nota", id: nota.id };
  }
  if (guia) return guia.orderId ? { tipo: "operacion", op: { clase: "pedido", id: guia.orderId } } : { tipo: "suelto", clase: "guia", id: guia.id };
  if (cot) {
    const op = await operacionDeCotizacion(tenantId, cot.numero, cot.notas);
    return op ? { tipo: "operacion", op } : { tipo: "suelto", clase: "cotizacion", id: cot.id };
  }

  const b = interpretarBusqueda(ref);
  if (b?.serie && b.numero != null) {
    const c = await prisma.sunatInvoice.findFirst({ where: { tenantId, series: b.serie, number: b.numero }, select: { id: true, orderId: true } });
    if (c) return c.orderId ? { tipo: "operacion", op: { clase: "pedido", id: c.orderId } } : { tipo: "suelto", clase: "comprobante", id: c.id };
  }
  const codigo = /^#?([a-z0-9-]{4,30})$/i.exec(ref)?.[1]?.toLowerCase();
  if (codigo) {
    const [pedidos, ventas] = await Promise.all([
      prisma.order.findMany({ where: { tenantId, id: { endsWith: codigo } }, select: { id: true }, take: 2 }),
      prisma.sale.findMany({ where: { tenantId, id: { endsWith: codigo } }, select: { id: true }, take: 2 }),
    ]);
    const todos = [...pedidos.map((p) => ({ clase: "pedido" as const, id: p.id })), ...ventas.map((v) => ({ clase: "venta" as const, id: v.id }))];
    if (todos.length > 1) return "ambiguo";
    if (todos.length === 1) return { tipo: "operacion", op: todos[0] };
  }
  return null;
}

async function entradaDePedido(tenantId: string, id: string): Promise<EntradaExpediente | null> {
  const o = await prisma.order.findFirst({
    where: { tenantId, id },
    select: {
      id: true, customerName: true, customerPhone: true, createdAt: true, status: true, total: true, notes: true,
      paymentMethod: true, yapeOperationNumber: true, deuda: true, cancelReason: true, cancelledAt: true, paymentApprovalId: true,
      items: { select: { name: true, quantity: true, unit: true, price: true } },
      statusHistory: { orderBy: { createdAt: "asc" }, select: { fromStatus: true, toStatus: true, changedBy: true, note: true, createdAt: true } },
    },
  });
  if (!o) return null;
  const numeroCot = o.notes ? COT_RE.exec(o.notes)?.[1] : undefined;
  const [comprobantes, notas, guias, aprobacion, cuotas, cotizaciones] = await Promise.all([
    prisma.sunatInvoice.findMany({ where: { tenantId, orderId: id }, orderBy: { createdAt: "asc" } }),
    prisma.notaCredito.findMany({ where: { tenantId, orderId: id }, orderBy: { createdAt: "asc" } }),
    prisma.guiaRemision.findMany({ where: { tenantId, orderId: id }, orderBy: { createdAt: "asc" } }),
    o.paymentApprovalId ? prisma.paymentApproval.findFirst({ where: { tenantId, id: o.paymentApprovalId }, select: { status: true, expectedAmount: true, detectedAmount: true } }) : null,
    prisma.creditInstallment.findMany({ where: { tenantId, orderId: id }, select: { totalAmount: true, paidAmount: true, status: true } }),
    numeroCot ? prisma.cotizacion.findMany({ where: { tenantId, numero: numeroCot }, take: 1 }) : [],
  ]);
  const operacion: OperacionCruda = {
    clase: "pedido",
    id: o.id,
    cliente: o.customerName,
    telefono: o.customerPhone,
    fecha: o.createdAt.toISOString(),
    estado: String(o.status),
    total: toNumOrZero(o.total),
    lineas: o.items.map((i) => ({ nombre: i.name, cantidad: i.quantity, unidad: i.unit, precio: toNumOrZero(i.price) })),
    cobro: {
      medio: o.paymentMethod,
      operacionYape: o.yapeOperationNumber,
      fiado: !!o.deuda,
      aprobacion: aprobacion ? { estado: aprobacion.status, esperado: toNumOrZero(aprobacion.expectedAmount), detectado: aprobacion.detectedAmount == null ? null : toNumOrZero(aprobacion.detectedAmount) } : null,
      cuotas: cuotas.map((c) => ({ total: toNumOrZero(c.totalAmount), pagado: toNumOrZero(c.paidAmount), estado: c.status })),
      pagado: null,
      vuelto: null,
      caja: [],
    },
    cancelacion: o.status === "cancelado" ? { motivo: o.cancelReason, fecha: iso(o.cancelledAt) } : null,
    documentoInterno: null,
  };
  return {
    operacion,
    comprobantes: comprobantes.map(aComprobante),
    notas: notas.map(aNota),
    guias: guias.map(aGuia),
    cotizaciones: cotizaciones.map(aCotizacion),
    historial: o.statusHistory.map((h) => ({ fromStatus: h.fromStatus ? String(h.fromStatus) : null, toStatus: String(h.toStatus), changedBy: h.changedBy, note: h.note, createdAt: h.createdAt.toISOString() })),
  };
}

async function entradaDeVenta(tenantId: string, id: string): Promise<EntradaExpediente | null> {
  const s = await prisma.sale.findFirst({
    where: { tenantId, id },
    select: {
      id: true, total: true, payment: true, amountPaid: true, change: true, customerPhone: true, createdAt: true,
      comprobanteTipo: true, comprobanteNumero: true,
      customer: { select: { name: true } },
      items: { select: { name: true, quantity: true, unit: true, price: true } },
    },
  });
  if (!s) return null;
  const [notas, caja, cotizaciones] = await Promise.all([
    prisma.notaCredito.findMany({ where: { tenantId, saleId: id }, orderBy: { createdAt: "asc" } }),
    prisma.cashMovement.findMany({ where: { saleId: id, cashRegister: { tenantId } }, orderBy: { createdAt: "asc" }, select: { type: true, amount: true, method: true, createdAt: true } }),
    prisma.cotizacion.findMany({ where: { tenantId, notas: `Generada automáticamente desde venta POS ${id}` }, take: 1 }),
  ]);
  return {
    operacion: {
      clase: "venta",
      id: s.id,
      cliente: s.customer?.name ?? "Cliente de mostrador",
      telefono: s.customerPhone,
      fecha: s.createdAt.toISOString(),
      estado: null,
      total: toNumOrZero(s.total),
      lineas: s.items.map((i) => ({ nombre: i.name, cantidad: i.quantity, unidad: i.unit, precio: toNumOrZero(i.price) })),
      cobro: {
        medio: s.payment, operacionYape: null, fiado: false, aprobacion: null, cuotas: [],
        pagado: toNumOrZero(s.amountPaid), vuelto: toNumOrZero(s.change),
        caja: caja.map((m) => ({ tipo: m.type, monto: toNumOrZero(m.amount), medio: m.method, fecha: m.createdAt.toISOString() })),
      },
      cancelacion: null,
      documentoInterno: s.comprobanteTipo ? { tipo: s.comprobanteTipo, numero: s.comprobanteNumero } : null,
    },
    comprobantes: [],
    notas: notas.map(aNota),
    guias: [],
    cotizaciones: cotizaciones.map(aCotizacion),
    historial: [],
  };
}

type FilaComprobante = Awaited<ReturnType<typeof prisma.sunatInvoice.findMany>>[number];
type FilaNota = Awaited<ReturnType<typeof prisma.notaCredito.findMany>>[number];
type FilaGuia = Awaited<ReturnType<typeof prisma.guiaRemision.findMany>>[number];
type FilaCotizacion = Awaited<ReturnType<typeof prisma.cotizacion.findMany>>[number];

function aComprobante(c: FilaComprobante): EntradaExpediente["comprobantes"][number] {
  return {
    id: c.id, type: c.type, series: c.series, number: c.number, customerName: c.customerName, customerRuc: c.customerRuc,
    total: toNumOrZero(c.total), sunatStatus: c.sunatStatus, errorMessage: c.errorMessage, pdfUrl: c.pdfUrl,
    acceptedAt: iso(c.acceptedAt), createdAt: c.createdAt.toISOString(),
  };
}
function aNota(n: FilaNota): EntradaExpediente["notas"][number] {
  return { id: n.id, numero: n.numero, status: String(n.status), motivoDesc: n.motivoDesc, total: toNumOrZero(n.total), createdBy: n.createdBy, createdAt: n.createdAt.toISOString() };
}
function aGuia(g: FilaGuia): EntradaExpediente["guias"][number] {
  return { id: g.id, numero: g.numero, status: String(g.status), destinatarioNombre: g.destinatarioNombre, fechaTraslado: g.fechaTraslado.toISOString(), createdBy: g.createdBy, createdAt: g.createdAt.toISOString() };
}
function aCotizacion(c: FilaCotizacion): EntradaExpediente["cotizaciones"][number] {
  return { id: c.id, numero: c.numero, status: String(c.status), total: toNumOrZero(c.total), createdBy: c.createdBy, createdAt: c.createdAt.toISOString() };
}

async function entradaSuelta(tenantId: string, clase: "comprobante" | "nota" | "guia" | "cotizacion", id: string): Promise<EntradaExpediente | null> {
  const vacio: EntradaExpediente = { operacion: null, comprobantes: [], notas: [], guias: [], cotizaciones: [], historial: [] };
  if (clase === "comprobante") {
    const c = await prisma.sunatInvoice.findFirst({ where: { tenantId, id } });
    return c ? { ...vacio, comprobantes: [aComprobante(c)] } : null;
  }
  if (clase === "nota") {
    const n = await prisma.notaCredito.findFirst({ where: { tenantId, id } });
    return n ? { ...vacio, notas: [aNota(n)] } : null;
  }
  if (clase === "guia") {
    const g = await prisma.guiaRemision.findFirst({ where: { tenantId, id } });
    return g ? { ...vacio, guias: [aGuia(g)] } : null;
  }
  const k = await prisma.cotizacion.findFirst({ where: { tenantId, id } });
  return k ? { ...vacio, cotizaciones: [aCotizacion(k)] } : null;
}

export const ComprobantesExpedienteDB = {
  async armar(tenantId: string, ref: string): Promise<ResultadoExpediente> {
    const destino = await resolver(tenantId, ref.trim());
    if (destino === "ambiguo") return { ok: false, motivo: "ambiguo" };
    if (!destino) return { ok: false, motivo: "no-encontrado" };
    const entrada =
      destino.tipo === "suelto"
        ? await entradaSuelta(tenantId, destino.clase, destino.id)
        : destino.op.clase === "pedido"
          ? await entradaDePedido(tenantId, destino.op.id)
          : await entradaDeVenta(tenantId, destino.op.id);
    if (!entrada) return { ok: false, motivo: "no-encontrado" };
    return { ok: true, expediente: armarExpediente(entrada) };
  },
};
