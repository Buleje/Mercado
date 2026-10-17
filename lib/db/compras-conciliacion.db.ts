import "server-only";

/**
 * Lo que se lee para la conciliación de documentos (N04): órdenes del período
 * con sus ítems, sus recepciones y sus cuentas con los pagos anotados, más las
 * cuentas y recepciones SIN orden. Las órdenes de los 60 días anteriores
 * también vienen: pueden ser el origen de una cuenta o una recepción suelta del
 * período (la propuesta de vínculo). Sólo lectura, sin caché: el cruce se hace
 * en `lib/compras/conciliacion.ts`.
 */
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDayRange } from "@/lib/utils";
import { conciliar, DIAS_PARA_PROPONER, type Conciliacion, type FiltrosConciliacion } from "@/lib/compras/conciliacion";

/** Tope de órdenes leídas: un año de una bodega son ~400; más que esto pide acotar el período. */
const TOPE_ORDENES = 1500;
const UN_DIA_MS = 86_400_000;

export const ComprasConciliacionDB = {
  async conciliacion(tenantId: string, filtros: FiltrosConciliacion): Promise<Conciliacion & { recortado: boolean }> {
    const inicio = new Date(limaDayRange(filtros.desde).start.getTime() - DIAS_PARA_PROPONER * UN_DIA_MS);
    const fin = limaDayRange(filtros.hasta).end;
    const ventana = { gte: inicio, lt: fin };

    const ordenesRaw = await prisma.purchaseOrder.findMany({
      where: { tenantId, createdAt: ventana },
      select: {
        id: true, supplierId: true, supplierName: true, total: true, status: true, invoiceType: true, invoiceNumber: true,
        paymentMethod: true, createdAt: true,
        items: { select: { productId: true, name: true, quantity: true, unitCost: true, unit: true } },
      },
      orderBy: { createdAt: "desc" },
      take: TOPE_ORDENES,
    });
    const ids = ordenesRaw.map((o) => o.id);

    const [recepcionesRaw, cuentasRaw] = await Promise.all([
      prisma.goodsReceipt.findMany({
        where: { tenantId, OR: [{ purchaseOrderId: { in: ids } }, { purchaseOrderId: null, createdAt: ventana }] },
        select: { id: true, ref: true, purchaseOrderId: true, supplierId: true, supplierName: true, status: true, receivedDate: true, createdAt: true, itemsJson: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.payable.findMany({
        where: { tenantId, OR: [{ purchaseOrderId: { in: ids } }, { purchaseOrderId: null, createdAt: ventana }] },
        select: {
          id: true, supplierId: true, supplierName: true, purchaseOrderId: true, description: true, amount: true, paidAmount: true,
          status: true, createdAt: true, payments: { select: { amount: true } },
        },
      }),
    ]);

    const resultado = conciliar(
      {
        ordenes: ordenesRaw.map((o) => ({
          id: o.id, supplierId: o.supplierId, supplierName: o.supplierName, total: toNumOrZero(o.total), status: o.status,
          invoiceType: o.invoiceType, invoiceNumber: o.invoiceNumber, paymentMethod: o.paymentMethod, createdAt: o.createdAt.toISOString(),
          items: o.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: toNumOrZero(i.unitCost), unit: i.unit })),
        })),
        recepciones: recepcionesRaw.map((r) => ({
          ...r, receivedDate: r.receivedDate?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
        })),
        cuentas: cuentasRaw.map((c) => ({
          id: c.id, supplierId: c.supplierId, supplierName: c.supplierName, purchaseOrderId: c.purchaseOrderId, description: c.description,
          amount: toNumOrZero(c.amount), paidAmount: toNumOrZero(c.paidAmount), status: c.status, createdAt: c.createdAt.toISOString(),
          pagosAnotados: c.payments.reduce((s, p) => s + toNumOrZero(p.amount), 0),
        })),
      },
      filtros,
    );
    return { ...resultado, recortado: ordenesRaw.length >= TOPE_ORDENES };
  },
};
