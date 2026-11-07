import "server-only";

/**
 * Lo que se lee de UN proveedor para su ficha de consulta (C33/C39), su
 * evaluación (C36) y el cruce de duplicados al guardar (C34). Sólo lectura:
 * las escrituras siguen en `SuppliersDB` (purchases.db.ts).
 */
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDateKey } from "@/lib/utils";
import { SuppliersDB } from "./purchases.db";
import { coincidenciasDeProveedor, type Coincidencia, type ProveedorParaCruce } from "@/lib/compras/proveedor-identidad";
import { evaluarProveedor, inicioDelPeriodo, type EvaluacionProveedor } from "@/lib/compras/evaluacion-proveedor";
import { comprobanteDeOrden, resumirFicha, type FichaDeProveedor } from "@/lib/compras/ficha-proveedor";

/** Tope de filas por lista: la ficha muestra lo reciente; lo viejo vive en su pestaña. */
const TOPE = 200;

export const ProveedorFichaDB = {
  /** Proveedores ya guardados que se parecen al candidato (C34). */
  async coincidencias(
    tenantId: string,
    candidato: Omit<ProveedorParaCruce, "id">,
    excluirId?: string,
  ): Promise<Coincidencia[]> {
    const todos = await SuppliersDB.getAll(tenantId);
    return coincidenciasDeProveedor(candidato, todos, excluirId);
  },

  /** `null` si el proveedor no es de este negocio. */
  async ficha(tenantId: string, supplierId: string): Promise<FichaDeProveedor | null> {
    const existe = await prisma.supplier.findFirst({ where: { tenantId, id: supplierId }, select: { id: true } });
    if (!existe) return null;

    const [ordenes, cuentas, devoluciones] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: { tenantId, supplierId },
        select: {
          id: true, status: true, total: true, createdAt: true, deliveryDate: true, receivedDate: true,
          invoiceNumber: true, invoiceType: true,
        },
        orderBy: { createdAt: "desc" },
        take: TOPE,
      }),
      prisma.payable.findMany({
        where: { tenantId, supplierId },
        select: { id: true, purchaseOrderId: true, description: true, amount: true, paidAmount: true, status: true, dueDate: true },
        orderBy: { dueDate: "asc" },
        take: TOPE,
      }),
      prisma.supplierReturn.findMany({
        where: { tenantId, proveedorId: supplierId },
        select: { id: true, motivo: true, estado: true, createdAt: true, items: { select: { cantidad: true, precioUnitario: true } } },
        orderBy: { createdAt: "desc" },
        take: TOPE,
      }),
    ]);

    const idsOrdenes = ordenes.map((o) => o.id);
    const recepciones = await prisma.goodsReceipt.findMany({
      where: { tenantId, OR: [{ supplierId }, ...(idsOrdenes.length ? [{ purchaseOrderId: { in: idsOrdenes } }] : [])] },
      select: { id: true, ref: true, status: true, receivedDate: true, scheduledDate: true, createdAt: true, purchaseOrderId: true },
      orderBy: { createdAt: "desc" },
      take: TOPE,
    });

    const datos: Omit<FichaDeProveedor, "resumen"> = {
      ordenes: ordenes.map((o) => ({
        id: o.id,
        estado: o.status,
        total: toNumOrZero(o.total),
        creada: o.createdAt.toISOString(),
        prometida: o.deliveryDate ? o.deliveryDate.toISOString() : null,
        recibida: o.receivedDate ? o.receivedDate.toISOString() : null,
        comprobante: comprobanteDeOrden(o.invoiceType, o.invoiceNumber),
      })),
      cuentas: cuentas.map((c) => {
        const monto = toNumOrZero(c.amount);
        const pagado = toNumOrZero(c.paidAmount);
        return {
          id: c.id,
          ordenId: c.purchaseOrderId,
          descripcion: c.description,
          monto,
          pagado,
          saldo: Math.round((monto - pagado) * 100) / 100,
          estado: c.status,
          vence: c.dueDate.toISOString(),
        };
      }),
      devoluciones: devoluciones.map((d) => {
        const conCosto = d.items.filter((i) => i.precioUnitario !== null);
        return {
          id: d.id,
          motivo: d.motivo,
          estado: d.estado,
          creada: d.createdAt.toISOString(),
          items: d.items.length,
          monto: conCosto.length
            ? Math.round(conCosto.reduce((s, i) => s + i.cantidad * toNumOrZero(i.precioUnitario), 0) * 100) / 100
            : null,
        };
      }),
      recepciones: recepciones.map((r) => ({
        id: r.id,
        ref: r.ref,
        estado: r.status,
        fecha: (r.receivedDate ?? r.scheduledDate ?? r.createdAt).toISOString(),
        ordenId: r.purchaseOrderId,
      })),
    };
    return { ...datos, resumen: resumirFicha(datos, limaDateKey()) };
  },

  /**
   * Cómo te entrega en los últimos `meses` (C36). `null` si el proveedor no es
   * de este negocio.
   */
  async evaluacion(tenantId: string, supplierId: string, meses: number): Promise<EvaluacionProveedor | null> {
    const proveedor = await prisma.supplier.findFirst({
      where: { tenantId, id: supplierId },
      select: { id: true, leadTimeDias: true },
    });
    if (!proveedor) return null;
    const hoy = limaDateKey();
    // Un día de margen hacia atrás: el filtro fino por día de Lima lo hace la función pura.
    const desde = new Date(`${inicioDelPeriodo(hoy, meses)}T00:00:00Z`);
    desde.setUTCDate(desde.getUTCDate() - 1);
    const ordenes = await prisma.purchaseOrder.findMany({
      where: { tenantId, supplierId, createdAt: { gte: desde } },
      select: {
        id: true, status: true, createdAt: true, deliveryDate: true, receivedDate: true,
        items: { select: { productId: true, unit: true, unitCost: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    return evaluarProveedor(
      ordenes.map((o) => ({
        id: o.id,
        estado: o.status,
        creada: o.createdAt.toISOString(),
        prometida: o.deliveryDate ? o.deliveryDate.toISOString() : null,
        recibida: o.receivedDate ? o.receivedDate.toISOString() : null,
        items: o.items.map((i) => ({ productId: i.productId, unidad: i.unit, costo: toNumOrZero(i.unitCost) })),
      })),
      { hoy, meses, diasDeclarados: proveedor.leadTimeDias ?? null },
    );
  },
};
