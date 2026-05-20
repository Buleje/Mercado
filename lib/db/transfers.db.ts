/**
 * TransfersDB — DB class canónica para transferencias entre almacenes.
 *
 * Audit project-wide 2026-05-19: extrae toda lógica Prisma de
 * app/api/transfers/route.ts. tenantId es SIEMPRE el primer argumento
 * en cada método (regla crítica #3 CLAUDE.md).
 */
import "server-only";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbTransferRow = {
  id: string;
  code: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  productId: number;
  quantity: number;
  unit: string;
  status: string;
  requestedBy: string;
  requestDate: Date;
  deliveredDate: Date | null;
  notes: string;
  fromWarehouse: { name: string };
  toWarehouse: { name: string };
  product: { name: string };
};

export type DbTransferMapped = {
  id: string;
  code: string;
  fromWarehouseId: string;
  from: string;
  toWarehouseId: string;
  to: string;
  productId: number;
  items: Array<{ product: string; qty: number; unit: string }>;
  status: string;
  requestedBy: string;
  requestDate: string;
  deliveredDate: string | null;
  notes: string;
};

const TRANSFER_INCLUDE = {
  fromWarehouse: true,
  toWarehouse: true,
  product: true,
} as const;

function mapTransfer(row: DbTransferRow): DbTransferMapped {
  return {
    id: row.id,
    code: row.code,
    fromWarehouseId: row.fromWarehouseId,
    from: row.fromWarehouse.name,
    toWarehouseId: row.toWarehouseId,
    to: row.toWarehouse.name,
    productId: row.productId,
    items: [{ product: row.product.name, qty: row.quantity, unit: row.unit }],
    status: row.status,
    requestedBy: row.requestedBy,
    requestDate: row.requestDate.toISOString(),
    deliveredDate: row.deliveredDate?.toISOString() ?? null,
    notes: row.notes,
  };
}

// ── TransfersDB ───────────────────────────────────────────────────────────────

export const TransfersDB = {
  /** Lista todas las transferencias del tenant, más recientes primero. */
  async list(tenantId: string): Promise<DbTransferMapped[]> {
    const rows = await prisma.transfer.findMany({
      where: { tenantId },
      include: TRANSFER_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => mapTransfer(row as DbTransferRow));
  },

  /**
   * Genera el siguiente código correlativo para el tenant (TRF-001, TRF-002…).
   * Usa findFirst con orderBy para evitar race conditions — el código se
   * asigna en el mismo create (ver `create()`).
   */
  async nextCode(tenantId: string): Promise<string> {
    const last = await prisma.transfer.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { code: true },
    });
    const lastNumber = last?.code ? parseInt(last.code.replace(/\D/g, ""), 10) || 0 : 0;
    return `TRF-${String(lastNumber + 1).padStart(3, "0")}`;
  },

  /** Crea una nueva transferencia con código auto-asignado. */
  async create(
    tenantId: string,
    data: {
      fromWarehouseId: string;
      toWarehouseId: string;
      productId: number;
      quantity: number;
      unit?: string;
      requestedBy: string;
      notes?: string;
    },
  ): Promise<DbTransferMapped> {
    const code = await TransfersDB.nextCode(tenantId);
    const row = await prisma.transfer.create({
      data: {
        code,
        fromWarehouseId: data.fromWarehouseId,
        toWarehouseId: data.toWarehouseId,
        productId: data.productId,
        quantity: data.quantity,
        unit: data.unit || "und",
        requestedBy: data.requestedBy,
        notes: data.notes || "",
        tenantId,
      },
      include: TRANSFER_INCLUDE,
    });
    return mapTransfer(row as DbTransferRow);
  },

  /** Actualiza status y/o notas de una transferencia. */
  async update(
    tenantId: string,
    id: string,
    data: {
      status?: "pendiente" | "en-transito" | "recibido" | "cancelado";
      notes?: string;
    },
  ): Promise<DbTransferMapped> {
    const row = await prisma.transfer.update({
      where: { id },
      data: {
        ...(data.status
          ? {
              status: data.status,
              deliveredDate: data.status === "recibido" ? new Date() : null,
            }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: TRANSFER_INCLUDE,
    });
    // tenantId guard: validar que el registro pertenece al tenant
    // (Prisma update sin where.tenantId es cross-tenant risk)
    if ((row as { tenantId: string }).tenantId !== tenantId) {
      throw new Error("Transferencia no pertenece al tenant");
    }
    return mapTransfer(row as DbTransferRow);
  },

  /** Elimina una transferencia verificando ownership del tenant. */
  async delete(tenantId: string, id: string): Promise<void> {
    // deleteMany con tenantId en where: elimina solo si pertenece al tenant.
    // Si count=0, el registro no existe o es de otro tenant — ambos son 404.
    const result = await prisma.transfer.deleteMany({
      where: { id, tenantId },
    });
    if (result.count === 0) {
      throw new Error("Transferencia no encontrada");
    }
  },
};
