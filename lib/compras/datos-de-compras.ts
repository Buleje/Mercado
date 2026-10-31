/**
 * Lo que leen «Buscar en Compras» (C57) y «Revisar pendientes» (C64): órdenes
 * con su seguimiento, proveedores, cuentas, devoluciones y recepciones del
 * negocio, por las clases de `lib/db` (caché + `tenantId`). Sólo lectura.
 *
 * La plata (cuentas por pagar) viaja sólo a quien la gestiona — misma regla
 * que `GET /api/purchases?seguimiento=1` (revisión 17-10, punto 7).
 */

import { PayablesDB, PurchasesDB, SuppliersDB } from "@/lib/jsondb";
import { GoodsReceiptsDB } from "@/lib/db/goods-receipts.db";
import { SupplierReturnsDB } from "@/lib/db/supplier-returns.db";
import { claveDeDia, conSeguimiento } from "./ciclo-oc";
import type { CuentaDeCompras, DatosDeCompras, DevolucionDeCompras, OrdenDeCompras, RecepcionDeCompras } from "./buscar-compras";
import type { DatosExcepciones, OrdenConSeguimiento } from "./excepciones-compras";

/** Admin, dueño y encargado ven la deuda; el almacenero, no. */
export const ROLES_QUE_VEN_LA_PLATA: readonly string[] = ["admin", "owner", "manager"];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const iso = (v: Date | string | null | undefined): string => (v instanceof Date ? v.toISOString() : v ?? "");

type FilaDb<T> = T extends readonly (infer U)[] ? U : never;

function aOrden(o: FilaDb<Awaited<ReturnType<typeof PurchasesDB.getAll>>>): OrdenDeCompras {
  return {
    id: o.id,
    supplierId: o.supplierId,
    supplierName: o.supplierName,
    items: o.items.map((i) => ({ productId: i.productId, name: i.name, quantity: num(i.quantity), unitCost: num(i.unitCost), unit: i.unit })),
    total: num(o.total),
    status: o.status,
    notes: o.notes ?? null,
    invoiceNumber: o.invoiceNumber ?? null,
    invoiceType: o.invoiceType ?? null,
    deliveryDate: o.deliveryDate ?? null,
    createdAt: o.createdAt,
    createdBy: o.createdBy ?? null,
    receivedBy: o.receivedBy ?? null,
  };
}

function aCuenta(c: FilaDb<Awaited<ReturnType<typeof PayablesDB.getAll>>>): CuentaDeCompras {
  return {
    id: c.id,
    supplierId: c.supplierId,
    supplierName: c.supplierName,
    purchaseOrderId: c.purchaseOrderId ?? null,
    description: c.description,
    amount: num(c.amount),
    paidAmount: num(c.paidAmount),
    status: c.status,
    dueDate: c.dueDate || null,
    createdAt: c.createdAt,
  };
}

function aDevolucion(v: FilaDb<Awaited<ReturnType<typeof SupplierReturnsDB.listWithItems>>>): DevolucionDeCompras {
  return {
    id: v.id,
    proveedorId: v.proveedorId,
    proveedorNombre: v.proveedorNombre,
    motivo: v.motivo,
    estado: v.estado,
    notas: v.notas,
    createdAt: iso(v.createdAt),
    items: v.items.map((i) => ({ nombre: i.nombre, cantidad: num(i.cantidad), unidad: i.unidad, precioUnitario: i.precioUnitario == null ? null : num(i.precioUnitario) })),
  };
}

function aRecepcion(r: FilaDb<Awaited<ReturnType<typeof GoodsReceiptsDB.list>>>): RecepcionDeCompras {
  return {
    id: r.id,
    ref: r.ref,
    purchaseOrderId: r.purchaseOrderId,
    supplierName: r.supplierName,
    status: r.status,
    inspector: r.inspector,
    fecha: claveDeDia(r.receivedDate ?? r.createdAt),
  };
}

/** Para el buscador: todo, sin el seguimiento de cada orden. */
export async function datosParaBuscar(tenantId: string, verPlata: boolean): Promise<DatosDeCompras> {
  const [ordenes, proveedores, cuentas, devoluciones, recepciones] = await Promise.all([
    PurchasesDB.getAll(tenantId),
    SuppliersDB.getAll(tenantId),
    verPlata ? PayablesDB.getAll(tenantId) : Promise.resolve(null),
    SupplierReturnsDB.listWithItems(tenantId),
    GoodsReceiptsDB.list(tenantId),
  ]);
  return {
    ordenes: ordenes.map(aOrden),
    proveedores: proveedores.map((p) => ({
      id: p.id, name: p.name, ruc: p.ruc ?? null, documento: p.documento ?? null, phone: p.phone ?? null, personaContacto: p.personaContacto ?? null,
    })),
    cuentas: cuentas ? cuentas.map(aCuenta) : null,
    devoluciones: devoluciones.map(aDevolucion),
    recepciones: recepciones.map(aRecepcion),
  };
}

/**
 * Para la bandeja: cada orden con lo que llegó de verdad (todas sus
 * recepciones, no sólo las 200 más nuevas) para comparar con su cuenta.
 */
export async function datosParaExcepciones(tenantId: string, verPlata: boolean): Promise<DatosExcepciones> {
  const [ordenes, cuentas, devoluciones] = await Promise.all([
    PurchasesDB.getAll(tenantId),
    verPlata ? PayablesDB.getAll(tenantId) : Promise.resolve(null),
    SupplierReturnsDB.listWithItems(tenantId),
  ]);
  const { recepciones } = await PurchasesDB.datosDeSeguimiento(tenantId, ordenes.map((o) => o.id), false);
  const conSeg = conSeguimiento(ordenes.map(aOrden), recepciones, [], { ocultarCuenta: false }) as OrdenConSeguimiento[];
  return {
    ordenes: conSeg,
    cuentas: cuentas ? cuentas.map(aCuenta) : null,
    devoluciones: devoluciones.map(aDevolucion),
  };
}
