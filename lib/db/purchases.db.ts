import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { invalidateAdminCache } from "@/lib/admin-cache";
import { DatosAjenosEnOrdenError } from "@/lib/compras/datos-ajenos";
import type {
  Supplier as PSupplier,
  PurchaseOrder as PPurchaseOrder,
  PurchaseItem as PPurchaseItem,
  SupplierEvaluation as PSupplierEvaluation,
} from "@/lib/generated/prisma/client";
import {
  type DbSupplier,
  type DbPurchaseOrder,
  type PurchaseStatus,
} from "./misc.db";

// ── Local Types ───────────────────────────────────────────────────────────────

export type DbSupplierEvaluation = {
  id: string;
  supplierId: string;
  purchaseId?: string;
  punctuality: number;
  quality: number;
  price: number;
  notes?: string;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Mappers ───────────────────────────────────────────────────────────────────

/**
 * La ficha completa. Omitir campos acá no los "esconde": hace que el
 * formulario los reciba vacíos y los BORRE al guardar (medido 2026-08-11:
 * 7 campos perdidos por abrir una ficha desde la lista y darle guardar).
 */
function mapSupplier(s: PSupplier): DbSupplier {
  return {
    id: s.id, name: s.name,
    ...(s.ruc != null && { ruc: s.ruc }),
    ...(s.phone != null && { phone: s.phone }),
    ...(s.email != null && { email: s.email }),
    ...(s.address != null && { address: s.address }),
    ...(s.notes != null && { notes: s.notes }),
    // Identificación
    ...(s.tipoPersona != null && { tipoPersona: s.tipoPersona }),
    ...(s.tipoDocumento != null && { tipoDocumento: s.tipoDocumento }),
    ...(s.documento != null && { documento: s.documento }),
    ...(s.razonSocial != null && { razonSocial: s.razonSocial }),
    ...(s.estado != null && { estado: s.estado }),
    // Contacto
    ...(s.whatsappSecundario != null && { whatsappSecundario: s.whatsappSecundario }),
    ...(s.personaContacto != null && { personaContacto: s.personaContacto }),
    // Ubicación
    ...(s.departamento != null && { departamento: s.departamento }),
    ...(s.provincia != null && { provincia: s.provincia }),
    ...(s.distrito != null && { distrito: s.distrito }),
    ...(s.direccion != null && { direccion: s.direccion }),
    // Comercial
    ...(s.categoria != null && { categoria: s.categoria }),
    ...(s.condicionPago != null && { condicionPago: s.condicionPago }),
    ...(s.diasCredito != null && { diasCredito: s.diasCredito }),
    ...(s.leadTimeDias != null && { leadTimeDias: s.leadTimeDias }),
    ...(s.cuentaBancaria != null && { cuentaBancaria: s.cuentaBancaria }),
    ...(s.banco != null && { banco: s.banco }),
    ...(s.observaciones != null && { observaciones: s.observaciones }),
    createdAt: toISO(s.createdAt),
  };
}

function mapPurchaseOrder(po: PPurchaseOrder & { items: PPurchaseItem[] }): DbPurchaseOrder {
  return {
    id: po.id, supplierId: po.supplierId, supplierName: po.supplierName,
    // TD-018: unitCost / total / discount son Decimal
    items: po.items.map((i: PPurchaseItem) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: toNumOrZero(i.unitCost), unit: i.unit })),
    total: toNumOrZero(po.total), status: po.status as PurchaseStatus,
    ...(po.notes != null && { notes: po.notes }),
    ...(po.paymentMethod != null && { paymentMethod: po.paymentMethod }),
    ...(po.deliveryDate != null && { deliveryDate: toISO(po.deliveryDate) }),
    ...(po.discount != null && { discount: toNumOrZero(po.discount) }),
    // ADR-377. Ojo: agregar una columna y NO mapearla acá la deja invisible
    // para toda la app aunque exista en la base (gotcha del serializador).
    ...(po.invoiceNumber != null && { invoiceNumber: po.invoiceNumber }),
    ...(po.invoiceType != null && { invoiceType: po.invoiceType }),
    igvIncluded: po.igvIncluded,
    ...(po.flete != null && { flete: toNumOrZero(po.flete) }),
    ...(po.otrosCostos != null && { otrosCostos: toNumOrZero(po.otrosCostos) }),
    ...(po.receivedDate != null && { receivedDate: toISO(po.receivedDate) }),
    ...(po.createdBy != null && { createdBy: po.createdBy }),
    ...(po.receivedBy != null && { receivedBy: po.receivedBy }),
    ...(po.cancelReason != null && { cancelReason: po.cancelReason }),
    createdAt: toISO(po.createdAt), updatedAt: toISO(po.updatedAt),
  };
}

function mapSupplierEvaluation(e: PSupplierEvaluation): DbSupplierEvaluation {
  return {
    id: e.id, supplierId: e.supplierId,
    ...(e.purchaseId != null && { purchaseId: e.purchaseId }),
    punctuality: e.punctuality, quality: e.quality, price: e.price,
    ...(e.notes != null && { notes: e.notes }),
    createdAt: toISO(e.createdAt),
  };
}

// ── Suppliers DB ──────────────────────────────────────────────────────────────

export const SuppliersDB = {
  async getAll(tenantId: string): Promise<DbSupplier[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.supplier.findMany({ where, orderBy: { createdAt: "desc" } })).map(mapSupplier);
  },
  async getById(tenantId: string, id: string): Promise<DbSupplier | null> {
    const row = await prisma.supplier.findFirst({ where: { id, tenantId } });
    return row ? mapSupplier(row) : null;
  },
  async add(s: DbSupplier, tenantId: string): Promise<DbSupplier> {
    const row = await prisma.supplier.create({
      // La ficha entera, no un recorte: lo que no se pase acá se pierde al
      // crear y el usuario lo vuelve a tipear.
      data: {
        id: s.id, name: s.name, ruc: s.ruc, phone: s.phone, email: s.email,
        address: s.address, notes: s.notes,
        tipoPersona: s.tipoPersona, tipoDocumento: s.tipoDocumento,
        documento: s.documento, razonSocial: s.razonSocial, estado: s.estado,
        whatsappSecundario: s.whatsappSecundario, personaContacto: s.personaContacto,
        departamento: s.departamento, provincia: s.provincia,
        distrito: s.distrito, direccion: s.direccion,
        categoria: s.categoria, condicionPago: s.condicionPago,
        diasCredito: s.diasCredito, leadTimeDias: s.leadTimeDias,
        cuentaBancaria: s.cuentaBancaria, banco: s.banco,
        observaciones: s.observaciones,
        tenantId,
      },
    });
    // Audit 2026-05-17 Q-P0-4: invalida cache para que POS vea proveedor nuevo
    invalidateAdminCache.afterPurchase(tenantId);
    return mapSupplier(row);
  },
  async update(tenantId: string, id: string, patch: Partial<DbSupplier>): Promise<DbSupplier | null> {
    const existing = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const { id: _id, createdAt: _c, ...data } = patch;
    await prisma.supplier.updateMany({ where: { id, tenantId }, data });
    const row = await prisma.supplier.findFirst({ where: { id, tenantId } });
    // Faltaba: `add` y `delete` invalidaban, `update` no. Editarle el teléfono
    // a un proveedor lo dejaba viejo en el POS hasta que venciera el cache.
    invalidateAdminCache.afterPurchase(tenantId);
    return row ? mapSupplier(row) : null;
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.supplier.deleteMany({ where: { id, tenantId } }).catch((err) => logger.error("[purchases.db] supplier delete failed", { error: String(err), id, tenantId }));
    // Audit 2026-05-17 Q-P0-4
    invalidateAdminCache.afterPurchase(tenantId);
  },
};

// ── Pertenencia al negocio (10-10) ────────────────────────────────────────────
//
// `PurchaseOrder.supplierId` y `PurchaseItem.productId` son FKs simples: la base
// acepta un proveedor o un producto de OTRO negocio. Así quedaron 34 órdenes de
// `main` con proveedor y productos de `demo`. Toda alta pasa por `PurchasesDB.add`
// y ahí se exige que proveedor y productos sean del mismo `tenantId`.

export { DatosAjenosEnOrdenError };

export type PertenenciaDeOrden = {
  /** La orden existe con ese `tenantId`. */
  existe: boolean;
  proveedorAjeno: boolean;
  productosAjenos: number[];
};

/** Qué del proveedor y de los productos NO es del negocio (vacío = todo propio). */
async function ajenosDelNegocio(
  tenantId: string,
  supplierId: string,
  productIds: ReadonlyArray<number | string>,
): Promise<{ proveedorAjeno: boolean; productosAjenos: number[] }> {
  const ids = [...new Set(productIds.map((id) => Number(id)))];
  const validos = ids.filter((id) => Number.isInteger(id) && id > 0);
  const [proveedor, propios] = await Promise.all([
    supplierId
      ? prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true } })
      : Promise.resolve(null),
    validos.length > 0
      ? prisma.product.findMany({ where: { tenantId, id: { in: validos } }, select: { id: true } })
      : Promise.resolve([] as Array<{ id: number }>),
  ]);
  const deEste = new Set(propios.map((p) => p.id));
  return { proveedorAjeno: !proveedor, productosAjenos: ids.filter((id) => !deEste.has(id)) };
}

// ── Purchase Orders DB ────────────────────────────────────────────────────────

export const PurchasesDB = {
  async getAll(tenantId: string): Promise<DbPurchaseOrder[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.purchaseOrder.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapPurchaseOrder);
  },
  /**
   * La última compra NO cancelada con ese N.º de comprobante, sin ítems: para avisar
   * antes de duplicarla (Comandos IA › Lee un papel). Índice (tenantId, invoiceNumber).
   */
  async findByInvoiceNumber(tenantId: string, numero: string): Promise<Pick<DbPurchaseOrder, "id" | "total" | "createdAt" | "supplierName"> | null> {
    const n = numero.trim();
    if (!n) return null;
    const po = await prisma.purchaseOrder.findFirst({
      where: { tenantId, invoiceNumber: { equals: n, mode: "insensitive" }, status: { not: "cancelado" } },
      select: { id: true, total: true, createdAt: true, supplierName: true },
      orderBy: { createdAt: "desc" },
    });
    return po ? { id: po.id, total: toNumOrZero(po.total), createdAt: toISO(po.createdAt), supplierName: po.supplierName } : null;
  },
  async getById(tenantId: string, id: string): Promise<DbPurchaseOrder | null> {
    const row = await prisma.purchaseOrder.findFirst({ where: { id, tenantId }, include: { items: true } });
    return row ? mapPurchaseOrder(row) : null;
  },
  /**
   * ¿La orden es de este negocio, y también su proveedor y sus productos?
   * Para la recepción: una orden cruzada (vieja) no mueve nada.
   */
  async pertenencia(tenantId: string, id: string): Promise<PertenenciaDeOrden> {
    const oc = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      select: { supplierId: true, items: { select: { productId: true } } },
    });
    if (!oc) return { existe: false, proveedorAjeno: false, productosAjenos: [] };
    const ajenos = await ajenosDelNegocio(tenantId, oc.supplierId, oc.items.map((i) => i.productId));
    return { existe: true, ...ajenos };
  },
  /** @throws DatosAjenosEnOrdenError si el proveedor o algún producto es de otro negocio. */
  async add(po: DbPurchaseOrder, tenantId: string): Promise<DbPurchaseOrder> {
    const ajenos = await ajenosDelNegocio(tenantId, po.supplierId, po.items.map((i) => i.productId));
    if (ajenos.proveedorAjeno || ajenos.productosAjenos.length > 0) {
      throw new DatosAjenosEnOrdenError(ajenos.proveedorAjeno, ajenos.productosAjenos);
    }
    const row = await prisma.purchaseOrder.create({
      data: {
        id: po.id, supplierId: po.supplierId, supplierName: po.supplierName,
        total: po.total, status: po.status as never, notes: po.notes,
        paymentMethod: po.paymentMethod ?? null,
        deliveryDate: po.deliveryDate ? new Date(po.deliveryDate) : null,
        discount: po.discount ?? 0,
        // ADR-377
        invoiceNumber: po.invoiceNumber ?? null,
        invoiceType: po.invoiceType ?? null,
        ...(po.igvIncluded != null && { igvIncluded: po.igvIncluded }),
        flete: po.flete ?? 0,
        otrosCostos: po.otrosCostos ?? 0,
        createdBy: po.createdBy ?? null,
        tenantId,
        items: { create: po.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost, unit: i.unit })) },
      },
      include: { items: true },
    });
    // Audit 2026-05-17 Q-P0-4: stock + dashboards refrescan
    invalidateAdminCache.afterPurchase(tenantId);
    return mapPurchaseOrder(row);
  },
  async update(tenantId: string, id: string, patch: Partial<DbPurchaseOrder>): Promise<DbPurchaseOrder | null> {
    const existing = await prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.status) data.status = patch.status;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.total !== undefined) data.total = patch.total;
    if (patch.supplierName !== undefined) data.supplierName = patch.supplierName;
    if (patch.paymentMethod !== undefined) data.paymentMethod = patch.paymentMethod;
    if (patch.deliveryDate !== undefined) data.deliveryDate = patch.deliveryDate ? new Date(patch.deliveryDate) : null;
    if (patch.discount !== undefined) data.discount = patch.discount;
    // ADR-377
    if (patch.invoiceNumber !== undefined) data.invoiceNumber = patch.invoiceNumber || null;
    if (patch.invoiceType !== undefined) data.invoiceType = patch.invoiceType || null;
    if (patch.igvIncluded !== undefined) data.igvIncluded = patch.igvIncluded;
    if (patch.flete !== undefined) data.flete = patch.flete;
    if (patch.otrosCostos !== undefined) data.otrosCostos = patch.otrosCostos;
    if (patch.receivedDate !== undefined) data.receivedDate = patch.receivedDate ? new Date(patch.receivedDate) : null;
    if (patch.receivedBy !== undefined) data.receivedBy = patch.receivedBy || null;
    if (patch.cancelReason !== undefined) data.cancelReason = patch.cancelReason || null;
    await prisma.purchaseOrder.updateMany({ where: { id, tenantId }, data });
    const row = await prisma.purchaseOrder.findFirst({ where: { id, tenantId }, include: { items: true } });
    // Audit 2026-05-17 Q-P0-4: update status (recibido) cambia stock visible
    invalidateAdminCache.afterPurchase(tenantId);
    return row ? mapPurchaseOrder(row) : null;
  },
  /**
   * Las recepciones y la cuenta por pagar de esas órdenes (C10: en qué va cada
   * una). Dos lecturas, sin ítems de producto: se cruzan en `ciclo-oc.ts`.
   */
  async datosDeSeguimiento(tenantId: string, ids: string[]) {
    if (ids.length === 0) return { recepciones: [], cuentas: [] };
    const [recepciones, cuentas] = await Promise.all([
      prisma.goodsReceipt.findMany({
        where: { tenantId, purchaseOrderId: { in: ids } },
        select: { id: true, ref: true, purchaseOrderId: true, status: true, receivedDate: true, createdAt: true, itemsJson: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.payable.findMany({
        where: { tenantId, purchaseOrderId: { in: ids } },
        select: { purchaseOrderId: true, amount: true, paidAmount: true, status: true, dueDate: true },
      }),
    ]);
    return { recepciones, cuentas };
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.purchaseOrder.deleteMany({ where: { id, tenantId } }).catch((err) => logger.error("[purchases.db] purchaseOrder delete failed", { error: String(err), id, tenantId }));
    // Audit 2026-05-17 Q-P0-4
    invalidateAdminCache.afterPurchase(tenantId);
  },
};

// ── Supplier Evaluations DB ───────────────────────────────────────────────────

export const SupplierEvaluationsDB = {
  // SECURITY 2026-05-06 (audit delivery #2): tenantId obligatorio. Antes
  // getBySupplierId/getAverages no filtraban por tenantId → un supplier
  // que existiera en 2 tenants veía/contaminaba evaluaciones de ambos.
  async getBySupplierId(supplierId: string, tenantId: string): Promise<DbSupplierEvaluation[]> {
    return (await prisma.supplierEvaluation.findMany({ where: { supplierId, tenantId }, orderBy: { createdAt: "desc" } })).map(mapSupplierEvaluation);
  },
  async getAll(tenantId: string): Promise<DbSupplierEvaluation[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.supplierEvaluation.findMany({ where, orderBy: { createdAt: "desc" } })).map(mapSupplierEvaluation);
  },
  async add(data: Omit<DbSupplierEvaluation, "id" | "createdAt">, tenantId: string): Promise<DbSupplierEvaluation> {
    const row = await prisma.supplierEvaluation.create({ data: { ...data, tenantId } });
    return mapSupplierEvaluation(row);
  },
  async getAverages(supplierId: string, tenantId: string): Promise<{ punctuality: number; quality: number; price: number; count: number }> {
    const agg = await prisma.supplierEvaluation.aggregate({
      where: { supplierId, tenantId },
      _avg: { punctuality: true, quality: true, price: true },
      _count: true,
    });
    return {
      punctuality: Math.round((agg._avg.punctuality ?? 3) * 10) / 10,
      quality: Math.round((agg._avg.quality ?? 3) * 10) / 10,
      price: Math.round((agg._avg.price ?? 3) * 10) / 10,
      count: agg._count,
    };
  },
};
