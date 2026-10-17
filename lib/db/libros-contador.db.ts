import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrZero } from "@/lib/decimal-utils";
import { SettingsDB } from "@/lib/db/settings.db";
import { partirSerieNumero, tipoComprobanteTabla10, type RangoPeriodo } from "@/lib/contabilidad/libros/comun";
import type { EntradaRegistroVentas, LineaVendida, NotaCreditoInterna } from "@/lib/contabilidad/libros/registro-ventas";
import type { EntradaRegistroCompras } from "@/lib/contabilidad/libros/registro-compras";
import type { EntradaKardex } from "@/lib/contabilidad/libros/kardex-valorizado";

/**
 * LibrosContadorDB — lecturas del mes para los libros del contador (14.1, 8.1, 13.1).
 *
 * Solo lectura y SIN caché a propósito: el contador baja el libro después de
 * corregir una venta o un gasto, y una copia de hace 2 minutos le haría cuadrar
 * contra un número viejo. Todas las consultas filtran por `tenantId` en el WHERE
 * (también las relaciones: `Customer.phone` todavía es único GLOBAL, así que el
 * cliente se busca aparte con el tenant, nunca por la relación de la venta).
 */

/** Tope por consulta: un mes de 20.000 ventas ya es otro tamaño de negocio. */
const TOPE = 20_000;

type LineaConProducto = { name: string; quantity: number; price: Parameters<typeof toNumOrZero>[0]; product: { taxType: string | null } | null };

const lineas = (items: LineaConProducto[]): LineaVendida[] =>
  items.map((i) => ({ nombre: i.name, cantidad: i.quantity, precio: toNumOrZero(i.price), taxType: i.product?.taxType ?? null }));

const ITEMS_SELECT = { select: { name: true, quantity: true, price: true, product: { select: { taxType: true } } } } as const;

/** Las devoluciones/compras anotan la orden como `OC-<id>` (recepción) o `<id>` (recibir desde la orden). */
const idDeOrden = (ref: string): string => (ref.startsWith("OC-") ? ref.slice(3) : ref);

export const LibrosContadorDB = {
  async cabecera(tenantId: string): Promise<{ ruc: string | null; razonSocial: string | null }> {
    const s = await SettingsDB.get(tenantId);
    const r = s as unknown as { ruc?: string | null; razonSocial?: string | null; businessName?: string | null };
    return { ruc: r.ruc?.trim() || null, razonSocial: r.razonSocial?.trim() || r.businessName?.trim() || null };
  },

  async ventas(tenantId: string, rango: RangoPeriodo): Promise<EntradaRegistroVentas> {
    const enMes = { gte: rango.desde, lt: rango.hasta };
    const [comprobantes, ventas, pedidos, pedidosSinEntregar, notas, devoluciones] = await Promise.all([
      prisma.sunatInvoice.findMany({
        where: { tenantId, createdAt: enMes },
        select: { id: true, type: true, series: true, number: true, customerRuc: true, customerName: true, subtotal: true, igv: true, total: true, sunatStatus: true, createdAt: true, orderId: true },
        orderBy: { createdAt: "asc" },
        take: TOPE,
      }),
      prisma.sale.findMany({
        where: { tenantId, createdAt: enMes },
        select: { id: true, createdAt: true, total: true, comprobanteTipo: true, comprobanteNumero: true, comprobanteRuc: true, customerPhone: true, items: ITEMS_SELECT },
        orderBy: { createdAt: "asc" },
        take: TOPE,
      }),
      prisma.order.findMany({
        where: { tenantId, deletedAt: null, status: "entregado", createdAt: enMes },
        select: { id: true, createdAt: true, total: true, customerName: true, customerPhone: true, items: ITEMS_SELECT },
        orderBy: { createdAt: "asc" },
        take: TOPE,
      }),
      prisma.order.count({ where: { tenantId, deletedAt: null, createdAt: enMes, status: { notIn: ["entregado", "cancelado"] } } }),
      prisma.notaCredito.findMany({
        where: { tenantId, status: "EMITIDA", createdAt: enMes },
        select: { id: true, numero: true, createdAt: true, igv: true, total: true, motivoDesc: true, saleId: true, orderId: true },
        take: TOPE,
      }),
      // Devoluciones del mes: el resumen de caja las resta; el libro solo si hay nota de crédito.
      prisma.return.findMany({
        where: { tenantId, createdAt: enMes, OR: [{ saleId: { not: null } }, { orderId: { not: null } }] },
        select: { id: true, saleId: true, orderId: true, total: true },
        take: TOPE,
      }),
    ]);

    const telefonos = [...new Set([...ventas, ...pedidos].map((v) => v.customerPhone).filter((t): t is string => Boolean(t)))];
    const saleIdsNc = notas.map((n) => n.saleId).filter((x): x is string => Boolean(x));
    const orderIdsNc = notas.map((n) => n.orderId).filter((x): x is string => Boolean(x));
    const pedidoIds = pedidos.map((p) => p.id);
    const devSaleIds = [...new Set(devoluciones.map((d) => d.saleId).filter((x): x is string => Boolean(x)))];
    const devOrderIds = [...new Set(devoluciones.map((d) => d.orderId).filter((x): x is string => Boolean(x)))];
    const [clientes, ventasRef, comprobantesRef, pedidosRef, comprobantesDePedidos, notasDeDevoluciones] = await Promise.all([
      telefonos.length
        ? prisma.customer.findMany({ where: { tenantId, phone: { in: telefonos } }, select: { phone: true, name: true, documento: true, tipoDocumento: true } })
        : [],
      saleIdsNc.length
        ? prisma.sale.findMany({ where: { tenantId, id: { in: saleIdsNc } }, select: { id: true, createdAt: true, comprobanteTipo: true, comprobanteNumero: true } })
        : [],
      orderIdsNc.length
        ? prisma.sunatInvoice.findMany({ where: { tenantId, orderId: { in: orderIdsNc }, type: { in: ["boleta", "factura"] } }, select: { orderId: true, type: true, series: true, number: true, createdAt: true } })
        : [],
      orderIdsNc.length ? prisma.order.findMany({ where: { tenantId, id: { in: orderIdsNc } }, select: { id: true, createdAt: true } }) : [],
      // Comprobante del pedido SIN filtro de fecha: un pedido de agosto con boleta del 1-sep
      // entra una sola vez (en setiembre, con la boleta), no también como pedido en agosto.
      pedidoIds.length
        ? prisma.sunatInvoice.findMany({
            where: { tenantId, orderId: { in: pedidoIds }, type: { in: ["boleta", "factura"] }, sunatStatus: { not: "rejected" } },
            select: { orderId: true },
          })
        : [],
      // Nota de crédito EMITIDA de la venta/pedido devuelto, de cualquier mes.
      devSaleIds.length || devOrderIds.length
        ? prisma.notaCredito.findMany({
            where: {
              tenantId,
              status: "EMITIDA",
              OR: [...(devSaleIds.length ? [{ saleId: { in: devSaleIds } }] : []), ...(devOrderIds.length ? [{ orderId: { in: devOrderIds } }] : [])],
            },
            select: { saleId: true, orderId: true },
          })
        : [],
    ]);
    const ventasConNota = new Set(notasDeDevoluciones.map((n) => n.saleId).filter(Boolean));
    const pedidosConNota = new Set(notasDeDevoluciones.map((n) => n.orderId).filter(Boolean));
    const cliente = new Map(clientes.map((c) => [c.phone, c]));
    const ventaRef = new Map(ventasRef.map((v) => [v.id, v]));
    const compRef = new Map(comprobantesRef.map((c) => [c.orderId ?? "", c]));
    const pedidoRef = new Map(pedidosRef.map((p) => [p.id, p]));

    const referencia = (saleId: string | null, orderId: string | null): NotaCreditoInterna["referencia"] => {
      if (orderId && compRef.has(orderId)) {
        const c = compRef.get(orderId)!;
        return { fecha: c.createdAt, tipo: c.type === "factura" ? "01" : "03", serie: c.series, numero: String(c.number) };
      }
      if (saleId && ventaRef.has(saleId)) {
        const v = ventaRef.get(saleId)!;
        // Misma lectura que la fila del POS: «B001-123» = serie B001, número 123.
        const tipo = v.comprobanteNumero?.trim() ? tipoComprobanteTabla10(v.comprobanteTipo) : null;
        const { serie, numero } = tipo ? partirSerieNumero(v.comprobanteNumero) : { serie: null, numero: null };
        return { fecha: v.createdAt, tipo, serie, numero };
      }
      if (orderId && pedidoRef.has(orderId)) return { fecha: pedidoRef.get(orderId)!.createdAt, tipo: null, serie: null, numero: null };
      return null;
    };

    return {
      periodo: rango.periodo,
      comprobantes: comprobantes.map((c) => ({
        id: c.id,
        tipo: c.type,
        serie: c.series,
        numero: c.number,
        clienteDoc: c.customerRuc,
        clienteNombre: c.customerName,
        subtotal: toNumOrZero(c.subtotal),
        igv: toNumOrZero(c.igv),
        total: toNumOrZero(c.total),
        estado: c.sunatStatus,
        emitidoEn: c.createdAt,
        pedidoId: c.orderId,
      })),
      ventasPos: ventas.map((v) => {
        const cli = v.customerPhone ? cliente.get(v.customerPhone) : undefined;
        return {
          id: v.id,
          fecha: v.createdAt,
          total: toNumOrZero(v.total),
          comprobanteTipo: v.comprobanteTipo,
          comprobanteNumero: v.comprobanteNumero,
          comprobanteDoc: v.comprobanteRuc,
          clienteNombre: cli?.name ?? null,
          clienteDoc: cli?.documento ?? null,
          clienteTipoDoc: cli?.tipoDocumento ?? null,
          lineas: lineas(v.items),
        };
      }),
      pedidos: pedidos.map((p) => {
        const cli = p.customerPhone ? cliente.get(p.customerPhone) : undefined;
        return {
          id: p.id,
          fecha: p.createdAt,
          total: toNumOrZero(p.total),
          clienteNombre: p.customerName,
          clienteDoc: cli?.documento ?? null,
          clienteTipoDoc: cli?.tipoDocumento ?? null,
          lineas: lineas(p.items),
        };
      }),
      notasCredito: notas.map((n) => ({
        id: n.id,
        numero: n.numero,
        fecha: n.createdAt,
        igv: toNumOrZero(n.igv),
        total: toNumOrZero(n.total),
        motivo: n.motivoDesc,
        referencia: referencia(n.saleId, n.orderId),
      })),
      pedidosSinEntregar,
      pedidosConComprobante: [...new Set(comprobantesDePedidos.map((c) => c.orderId).filter((x): x is string => Boolean(x)))],
      devoluciones: devoluciones.map((d) => ({
        id: d.id,
        origen: d.saleId ? "pos" : "pedido",
        total: toNumOrZero(d.total),
        conNotaCredito: d.saleId ? ventasConNota.has(d.saleId) : Boolean(d.orderId && pedidosConNota.has(d.orderId)),
      })),
    };
  },

  async compras(tenantId: string, rango: RangoPeriodo): Promise<EntradaRegistroCompras> {
    const enMes = { gte: rango.desde, lt: rango.hasta };
    const [ordenes, gastos] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: {
          tenantId,
          status: { in: ["recibido", "parcial"] },
          OR: [{ receivedDate: enMes }, { receivedDate: null, createdAt: enMes }],
        },
        select: {
          id: true, receivedDate: true, createdAt: true, supplierName: true, invoiceType: true, invoiceNumber: true, total: true, status: true,
          supplier: { select: { ruc: true, documento: true, tipoDocumento: true, tenantId: true } },
        },
        take: TOPE,
      }),
      // Día de Lima, igual que el «IGV del mes» (`igv-del-mes.db.ts`): el gasto con hora va por
      // su instante en Lima; el sin hora (medianoche UTC) por su día, y el del 1 del mes
      // siguiente (medianoche UTC, antes de las 05:00) se excluye aunque caiga en el rango.
      prisma.expense.findMany({
        where: {
          tenantId,
          recurring: false,
          AND: [
            { OR: [{ date: { gte: rango.desde, lt: rango.hasta } }, { date: rango.desdeDia }] },
            { NOT: { date: rango.hastaDia } },
          ],
        },
        select: { id: true, date: true, category: true, description: true, amount: true, supplierName: true, supplierRuc: true, documentType: true, documentNumber: true, igvAmount: true },
        take: TOPE,
      }),
    ]);

    return {
      periodo: rango.periodo,
      compras: ordenes.map((o) => {
        // El proveedor solo cuenta si es del mismo negocio (defensa: la FK no lleva tenant).
        const prov = o.supplier?.tenantId === tenantId ? o.supplier : null;
        return {
          id: o.id,
          fechaSistema: o.receivedDate ?? o.createdAt,
          proveedorNombre: o.supplierName,
          proveedorDoc: prov?.ruc?.trim() || prov?.documento?.trim() || null,
          proveedorTipoDoc: prov?.ruc?.trim() ? "RUC" : (prov?.tipoDocumento ?? null),
          tipoComprobante: o.invoiceType,
          numeroComprobante: o.invoiceNumber,
          total: toNumOrZero(o.total),
          estado: o.status,
        };
      }),
      gastos: gastos.map((g) => ({
        id: g.id,
        fecha: g.date,
        categoria: g.category,
        descripcion: g.description,
        proveedorNombre: g.supplierName,
        proveedorDoc: g.supplierRuc,
        tipoDocumento: g.documentType,
        numeroDocumento: g.documentNumber,
        monto: toNumOrZero(g.amount),
        igv: toNum(g.igvAmount),
      })),
    };
  },

  async kardex(tenantId: string, rango: RangoPeriodo): Promise<EntradaKardex> {
    const movs = await prisma.inventoryMovement.findMany({
      where: { tenantId, createdAt: { gte: rango.desde, lt: rango.hasta } },
      select: { id: true, productId: true, type: true, quantity: true, previousStock: true, newStock: true, reference: true, createdAt: true, warehouse: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: TOPE + 1,
    });
    const recortado = movs.length > TOPE;
    const usados = recortado ? movs.slice(0, TOPE) : movs;

    const productIds = [...new Set(usados.map((m) => m.productId))];
    // La devolución de una venta vuelve al costo con que salió: misma línea de la venta.
    const saleIds = [...new Set(usados.filter((m) => (m.type === "venta" || m.type === "devolucion") && m.reference).map((m) => m.reference as string))];
    const pedidoIds = [...new Set(usados.filter((m) => m.type === "venta_online" && m.reference).map((m) => m.reference as string))];
    const ordenIds = [...new Set(usados.filter((m) => m.type === "compra" && m.reference).map((m) => idDeOrden(m.reference as string)))];

    const [productos, costosVenta, costosCompra, costosPedido] = await Promise.all([
      productIds.length
        ? prisma.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, name: true, sku: true, barcode: true, unit: true } })
        : [],
      saleIds.length
        ? prisma.saleItem.findMany({ where: { saleId: { in: saleIds }, sale: { tenantId } }, select: { saleId: true, productId: true, costPrice: true } })
        : [],
      ordenIds.length
        ? prisma.purchaseItem.findMany({
            where: { purchaseOrderId: { in: ordenIds }, purchaseOrder: { tenantId } },
            select: { purchaseOrderId: true, productId: true, unitCost: true, purchaseOrder: { select: { igvIncluded: true } } },
          })
        : [],
      pedidoIds.length
        ? prisma.orderItem.findMany({ where: { orderId: { in: pedidoIds }, order: { tenantId } }, select: { orderId: true, productId: true, costPrice: true } })
        : [],
    ]);

    const cVenta = new Map<string, number>();
    for (const i of costosVenta) {
      const c = toNum(i.costPrice);
      if (c !== null && c > 0) cVenta.set(`${i.saleId}:${i.productId}`, c);
    }
    for (const i of costosPedido) {
      const c = toNum(i.costPrice);
      if (c !== null && c > 0 && i.productId !== null) cVenta.set(`${i.orderId}:${i.productId}`, c);
    }
    const cCompra = new Map<string, { costo: number; conIgv: boolean }>();
    for (const i of costosCompra) cCompra.set(`${i.purchaseOrderId}:${i.productId}`, { costo: toNumOrZero(i.unitCost), conIgv: i.purchaseOrder.igvIncluded });

    return {
      periodo: rango.periodo,
      recortado,
      productos: productos.map((p) => ({ id: p.id, nombre: p.name, codigo: p.sku?.trim() || p.barcode?.trim() || null, unidad: p.unit })),
      movimientos: usados.map((m) => {
        const compra = m.type === "compra" && m.reference ? cCompra.get(`${idDeOrden(m.reference)}:${m.productId}`) : undefined;
        const venta = m.type !== "compra" && m.reference ? cVenta.get(`${m.reference}:${m.productId}`) : undefined;
        return {
          id: m.id,
          productoId: m.productId,
          tipo: m.type,
          cantidad: m.quantity,
          stockAntes: m.previousStock,
          stockDespues: m.newStock,
          referencia: m.reference,
          fecha: m.createdAt,
          almacen: m.warehouse?.name ?? null,
          costoUnitario: compra ? compra.costo : (venta ?? null),
          costoConIgv: compra ? compra.conIgv : null,
        };
      }),
    };
  },
};
