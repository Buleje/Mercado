import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
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

function mapSupplier(s: PSupplier): DbSupplier {
  return {
    id: s.id, name: s.name,
    ...(s.ruc != null && { ruc: s.ruc }),
    ...(s.phone != null && { phone: s.phone }),
    ...(s.email != null && { email: s.email }),
    ...(s.address != null && { address: s.address }),
    ...(s.notes != null && { notes: s.notes }),
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
      data: { id: s.id, name: s.name, ruc: s.ruc, phone: s.phone, email: s.email, address: s.address, notes: s.notes, tenantId },
    });
    return mapSupplier(row);
  },
  async update(tenantId: string, id: string, patch: Partial<DbSupplier>): Promise<DbSupplier | null> {
    const existing = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const { id: _id, createdAt: _c, ...data } = patch;
    await prisma.supplier.updateMany({ where: { id, tenantId }, data });
    const row = await prisma.supplier.findFirst({ where: { id, tenantId } });
    return row ? mapSupplier(row) : null;
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.supplier.deleteMany({ where: { id, tenantId } }).catch((err) => logger.error("[purchases.db] supplier delete failed", { error: String(err), id, tenantId }));
  },
};

// ── Purchase Orders DB ────────────────────────────────────────────────────────

export const PurchasesDB = {
  async getAll(tenantId: string): Promise<DbPurchaseOrder[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.purchaseOrder.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapPurchaseOrder);
  },
  async getById(tenantId: string, id: string): Promise<DbPurchaseOrder | null> {
    const row = await prisma.purchaseOrder.findFirst({ where: { id, tenantId }, include: { items: true } });
    return row ? mapPurchaseOrder(row) : null;
  },
  async add(po: DbPurchaseOrder, tenantId: string): Promise<DbPurchaseOrder> {
    const row = await prisma.purchaseOrder.create({
      data: {
        id: po.id, supplierId: po.supplierId, supplierName: po.supplierName,
        total: po.total, status: po.status as never, notes: po.notes,
        paymentMethod: po.paymentMethod ?? null,
        deliveryDate: po.deliveryDate ? new Date(po.deliveryDate) : null,
        discount: po.discount ?? 0, tenantId,
        items: { create: po.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost, unit: i.unit })) },
      },
      include: { items: true },
    });
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
    await prisma.purchaseOrder.updateMany({ where: { id, tenantId }, data });
    const row = await prisma.purchaseOrder.findFirst({ where: { id, tenantId }, include: { items: true } });
    return row ? mapPurchaseOrder(row) : null;
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.purchaseOrder.deleteMany({ where: { id, tenantId } }).catch((err) => logger.error("[purchases.db] purchaseOrder delete failed", { error: String(err), id, tenantId }));
  },
};

// ── Supplier Evaluations DB ───────────────────────────────────────────────────

export const SupplierEvaluationsDB = {
  async getBySupplierId(supplierId: string): Promise<DbSupplierEvaluation[]> {
    return (await prisma.supplierEvaluation.findMany({ where: { supplierId }, orderBy: { createdAt: "desc" } })).map(mapSupplierEvaluation);
  },
  async getAll(tenantId: string): Promise<DbSupplierEvaluation[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.supplierEvaluation.findMany({ where, orderBy: { createdAt: "desc" } })).map(mapSupplierEvaluation);
  },
  async add(data: Omit<DbSupplierEvaluation, "id" | "createdAt">, tenantId: string): Promise<DbSupplierEvaluation> {
    const row = await prisma.supplierEvaluation.create({ data: { ...data, tenantId } });
    return mapSupplierEvaluation(row);
  },
  async getAverages(supplierId: string): Promise<{ punctuality: number; quality: number; price: number; count: number }> {
    const agg = await prisma.supplierEvaluation.aggregate({
      where: { supplierId },
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
