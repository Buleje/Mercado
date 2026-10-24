/**
 * lib/db/comprobantes-seguimiento.db.ts
 *
 * Lecturas de Comprobantes que cruzan papeles (sólo lectura, nada se escribe):
 *  - `listar`: Facturas y boletas con período, búsqueda global y filtros, más
 *    sus cifras contadas en la base con el MISMO filtro (F34/F36/F38).
 *  - `pendientes`: la bandeja de Seguimiento (N02 + F56/M58).
 *  - `conciliacion`: Análisis y conciliación documental (N08).
 *
 * tenantId siempre primer parámetro; la lógica de negocio vive en
 * `lib/comprobantes/*` (pura y con tests).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import type { Prisma } from "@/lib/generated/prisma/client";
import { limitesDelRango, type Rango } from "@/lib/comprobantes/periodo";
import type { CriteriosBusqueda } from "@/lib/comprobantes/busqueda";
import { resumenDesdeGrupos, type ResumenComprobantes } from "@/lib/comprobantes/resumen";
import { armarPendientes, DIAS_POR_VENCER, type Pendiente } from "@/lib/comprobantes/pendientes";
import { conciliar, type Conciliacion } from "@/lib/comprobantes/conciliacion";

export type OrigenComprobante = "pedido" | "sin-pedido";

export interface FiltrosLista {
  rango: Rango;
  busqueda: CriteriosBusqueda | null;
  tipos: string[];
  estados: string[];
  origen: OrigenComprobante | null;
  limite: number;
}

const VIVOS = ["accepted", "pending", "retrying"];
const DIA_MS = 86_400_000;
/** Pedidos entregados en estos días que se revisan por si les falta comprobante. */
export const DIAS_PEDIDOS_SIN_COMPROBANTE = 30;
/** Filas por consulta en la conciliación: si se llega, la respuesta lo dice. */
const TOPE_CONCILIACION = 5000;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function filtroDeBusqueda(b: CriteriosBusqueda): Prisma.SunatInvoiceWhereInput {
  if (b.serie && b.numero != null) return { series: b.serie, number: b.numero };
  const o: Prisma.SunatInvoiceWhereInput[] = [];
  if (b.serie) o.push({ series: b.serie });
  if (b.numero != null) o.push({ number: b.numero });
  if (b.importe != null) o.push({ total: b.importe });
  if (b.pedido) o.push({ orderId: { endsWith: b.pedido, mode: "insensitive" } });
  if (b.estados) o.push({ sunatStatus: { in: b.estados } });
  if (b.tipos) o.push({ type: { in: b.tipos } });
  const soloImporte = b.importe != null && b.numero == null;
  if (!b.pedido && !soloImporte) {
    o.push({ customerName: { contains: b.texto, mode: "insensitive" } }, { customerRuc: { contains: b.texto } });
    if (b.texto.length >= 4) o.push({ orderId: { contains: b.texto, mode: "insensitive" } });
  }
  return { OR: o };
}

function whereLista(tenantId: string, f: Omit<FiltrosLista, "limite">): Prisma.SunatInvoiceWhereInput {
  const and: Prisma.SunatInvoiceWhereInput[] = [];
  const fechas = limitesDelRango(f.rango);
  if (fechas.gte || fechas.lte) and.push({ createdAt: fechas });
  if (f.tipos.length > 0) and.push({ type: { in: f.tipos } });
  if (f.estados.length > 0) and.push({ sunatStatus: { in: f.estados } });
  if (f.origen === "pedido") and.push({ orderId: { not: null } });
  if (f.origen === "sin-pedido") and.push({ orderId: null });
  if (f.busqueda) and.push(filtroDeBusqueda(f.busqueda));
  return { tenantId, AND: and };
}

const COLUMNAS_LISTA = {
  id: true, orderId: true, type: true, series: true, number: true, customerName: true, customerRuc: true,
  subtotal: true, igv: true, total: true, sunatStatus: true, pdfUrl: true, errorMessage: true,
  sentAt: true, acceptedAt: true, createdAt: true,
} satisfies Prisma.SunatInvoiceSelect;

export const ComprobantesSeguimientoDB = {
  /** La lista filtrada + sus cifras con el mismo filtro (la tabla, los indicadores y el Excel dicen lo mismo). */
  async listar(tenantId: string, f: FiltrosLista) {
    const where = whereLista(tenantId, f);
    const [filas, total, grupos] = await Promise.all([
      prisma.sunatInvoice.findMany({ where, orderBy: { createdAt: "desc" }, take: f.limite, select: COLUMNAS_LISTA }),
      prisma.sunatInvoice.count({ where }),
      prisma.sunatInvoice.groupBy({ by: ["type", "sunatStatus"], where, _count: { _all: true }, _sum: { total: true, igv: true } }),
    ]);
    const resumen: ResumenComprobantes = resumenDesdeGrupos(
      grupos.map((g) => ({
        type: g.type,
        sunatStatus: g.sunatStatus,
        cantidad: g._count._all,
        total: toNumOrZero(g._sum.total),
        igv: toNumOrZero(g._sum.igv),
      })),
    );
    const data = filas.map((r) => ({
      ...r,
      subtotal: toNumOrZero(r.subtotal),
      igv: toNumOrZero(r.igv),
      total: toNumOrZero(r.total),
      sentAt: iso(r.sentAt),
      acceptedAt: iso(r.acceptedAt),
      createdAt: r.createdAt.toISOString(),
      numero: `${r.series}-${String(r.number).padStart(8, "0")}`,
    }));
    return { data, total, resumen };
  },

  /**
   * La bandeja. `soloComprobantes` = el cajero: ve lo de SUNAT, no las notas,
   * guías ni cotizaciones (esas pantallas son del administrador).
   */
  async pendientes(tenantId: string, opts: { ahora: number; soloComprobantes: boolean }): Promise<Pendiente[]> {
    const { ahora, soloComprobantes } = opts;
    const comprobantes = await prisma.sunatInvoice.findMany({
      where: { tenantId, sunatStatus: { in: ["pending", "retrying", "rejected"] } },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, orderId: true, type: true, series: true, number: true, customerName: true, total: true, sunatStatus: true, errorMessage: true, sentAt: true, createdAt: true },
    });
    // Un rechazo se cierra con evidencia: si su pedido ya tiene otro comprobante vivo, ya se resolvió.
    const pedidosRechazados = [...new Set(comprobantes.filter((c) => c.sunatStatus === "rejected" && c.orderId).map((c) => c.orderId as string))];
    const resueltos = pedidosRechazados.length
      ? new Set((await prisma.sunatInvoice.findMany({
          where: { tenantId, orderId: { in: pedidosRechazados }, sunatStatus: { in: VIVOS } },
          select: { orderId: true },
        })).map((r) => r.orderId))
      : new Set<string | null>();
    const filasComprobantes = comprobantes
      .filter((c) => !(c.sunatStatus === "rejected" && c.orderId && resueltos.has(c.orderId)))
      .map((c) => ({ ...c, total: toNumOrZero(c.total), sentAt: iso(c.sentAt), createdAt: c.createdAt.toISOString() }));

    if (soloComprobantes) {
      return armarPendientes({ ahora, comprobantes: filasComprobantes, notas: [], guias: [], cotizaciones: [], pedidosSinComprobante: null });
    }

    const desdeVigencia = new Date(ahora - DIA_MS);
    const hastaVigencia = new Date(ahora + (DIAS_POR_VENCER + 1) * DIA_MS);
    const desdePedidos = new Date(ahora - DIAS_PEDIDOS_SIN_COMPROBANTE * DIA_MS);
    const [notas, guias, cotizaciones, entregados] = await Promise.all([
      prisma.notaCredito.findMany({
        where: { tenantId, OR: [{ status: "BORRADOR" }, { status: "EMITIDA", orderId: null, saleId: null }] },
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true, numero: true, orderId: true, saleId: true, status: true, total: true, motivoDesc: true, createdBy: true, createdAt: true },
      }),
      prisma.guiaRemision.findMany({
        where: { tenantId, status: "BORRADOR" },
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true, numero: true, orderId: true, destinatarioNombre: true, fechaTraslado: true, createdBy: true, createdAt: true },
      }),
      prisma.cotizacion.findMany({
        where: {
          tenantId,
          OR: [
            { status: { in: ["BORRADOR", "ENVIADA"] }, validoHasta: { gte: desdeVigencia, lte: hastaVigencia } },
            { status: "ACEPTADA" },
          ],
        },
        orderBy: { validoHasta: "asc" },
        take: 100,
        select: { id: true, numero: true, clienteNombre: true, total: true, status: true, validoHasta: true, createdBy: true, createdAt: true },
      }),
      prisma.order.findMany({
        where: { tenantId, deletedAt: null, status: "entregado", createdAt: { gte: desdePedidos } },
        orderBy: { createdAt: "asc" },
        take: 1000,
        select: { id: true, total: true, createdAt: true },
      }),
    ]);
    const conComprobante = entregados.length
      ? new Set((await prisma.sunatInvoice.findMany({
          where: { tenantId, orderId: { in: entregados.map((p) => p.id) }, sunatStatus: { in: VIVOS }, type: { in: ["boleta", "factura"] } },
          select: { orderId: true },
        })).map((r) => r.orderId))
      : new Set<string | null>();
    const sinComprobante = entregados.filter((p) => !conComprobante.has(p.id));

    return armarPendientes({
      ahora,
      comprobantes: filasComprobantes,
      notas: notas.map((n) => ({ ...n, status: String(n.status), total: toNumOrZero(n.total), createdAt: n.createdAt.toISOString() })),
      guias: guias.map((g) => ({ ...g, fechaTraslado: g.fechaTraslado.toISOString(), createdAt: g.createdAt.toISOString() })),
      cotizaciones: cotizaciones.map((c) => ({ ...c, status: String(c.status), total: toNumOrZero(c.total), validoHasta: c.validoHasta.toISOString(), createdAt: c.createdAt.toISOString() })),
      pedidosSinComprobante: {
        cantidad: sinComprobante.length,
        importe: Math.round(sinComprobante.reduce((s, p) => s + toNumOrZero(p.total), 0) * 100) / 100,
        desde: sinComprobante[0]?.createdAt.toISOString() ?? null,
      },
    });
  },

  /** El cruce del período: comprobantes, notas, pedidos y ventas del mostrador. */
  async conciliacion(tenantId: string, rango: Rango): Promise<Conciliacion & { truncado: boolean }> {
    const fechas = limitesDelRango(rango);
    const creado = fechas.gte || fechas.lte ? { createdAt: fechas } : {};
    const [comprobantes, notas, pedidos, mostrador] = await Promise.all([
      prisma.sunatInvoice.findMany({
        where: { tenantId, ...creado },
        orderBy: { createdAt: "desc" },
        take: TOPE_CONCILIACION,
        select: { id: true, orderId: true, type: true, series: true, number: true, customerName: true, total: true, sunatStatus: true, createdAt: true },
      }),
      prisma.notaCredito.findMany({
        where: { tenantId, ...creado },
        take: TOPE_CONCILIACION,
        select: { id: true, numero: true, orderId: true, saleId: true, status: true, motivoCodigo: true, motivoDesc: true, total: true },
      }),
      prisma.order.findMany({
        where: { tenantId, deletedAt: null, ...creado },
        orderBy: { createdAt: "desc" },
        take: TOPE_CONCILIACION,
        select: { id: true, customerName: true, total: true, status: true, deuda: true, createdAt: true },
      }),
      prisma.sale.groupBy({ by: ["comprobanteTipo"], where: { tenantId, ...creado }, _count: { _all: true }, _sum: { total: true } }),
    ]);

    const idsPedidos = pedidos.map((p) => p.id);
    const idsDeComprobantes = [...new Set(comprobantes.map((c) => c.orderId).filter((x): x is string => !!x))];
    const [vivosDePedidos, pedidosRef, notasDePedidos] = await Promise.all([
      idsPedidos.length
        ? prisma.sunatInvoice.findMany({
            where: { tenantId, orderId: { in: idsPedidos }, sunatStatus: { in: VIVOS }, type: { in: ["boleta", "factura"] } },
            select: { orderId: true },
          })
        : Promise.resolve([] as { orderId: string | null }[]),
      idsDeComprobantes.length
        ? prisma.order.findMany({ where: { tenantId, deletedAt: null, id: { in: idsDeComprobantes } }, select: { id: true, total: true, status: true, customerName: true } })
        : Promise.resolve([] as { id: string; total: Prisma.Decimal; status: string; customerName: string }[]),
      idsDeComprobantes.length
        ? prisma.notaCredito.findMany({ where: { tenantId, status: "EMITIDA", orderId: { in: idsDeComprobantes } }, select: { orderId: true } })
        : Promise.resolve([] as { orderId: string | null }[]),
    ]);

    const resultado = conciliar({
      rango,
      comprobantes: comprobantes.map((c) => ({ ...c, total: toNumOrZero(c.total), createdAt: c.createdAt.toISOString() })),
      notas: notas.map((n) => ({ ...n, status: String(n.status), total: toNumOrZero(n.total) })),
      pedidos: pedidos.map((p) => ({ ...p, status: String(p.status), total: toNumOrZero(p.total), deuda: !!p.deuda, createdAt: p.createdAt.toISOString() })),
      pedidosConComprobante: new Set(vivosDePedidos.map((r) => r.orderId).filter((x): x is string => !!x)),
      pedidosDeComprobantes: new Map(pedidosRef.map((p) => [p.id, { total: toNumOrZero(p.total), status: String(p.status), customerName: p.customerName }])),
      pedidosConNota: new Set(notasDePedidos.map((r) => r.orderId).filter((x): x is string => !!x)),
      ventasMostrador: mostrador.map((m) => ({ tipo: m.comprobanteTipo, cantidad: m._count._all, total: toNumOrZero(m._sum.total) })),
    });
    const truncado = [comprobantes, notas, pedidos].some((l) => l.length >= TOPE_CONCILIACION);
    return { ...resultado, truncado };
  },
};
