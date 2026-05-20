/**
 * lib/db/admin-warehouse-transfers.db.ts
 *
 * DB class para el endpoint admin de transferencias entre almacenes.
 * Audit project-wide 2026-05-19: extrae prisma.* directo de
 * app/api/admin/warehouse-transfers/route.ts.
 *
 * Incluye logica de:
 *  - listado paginado con cursor
 *  - validacion cross-tenant de warehouses
 *  - check de stock disponible via Location
 *  - creacion con codigo correlativo TRF-XXXX
 *  - actualizacion de status con ajuste de Location stock (completado)
 *
 * tenantId es SIEMPRE el primer argumento (regla #3 CLAUDE.md).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TransferListItem = {
  id: string;
  code: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  productId: number;
  productName: string;
  quantity: number;
  unit: string;
  status: string;
  notes: string;
  requestedBy: string;
  date: string;
  createdAt: string;
};

export type TransferListResult = {
  items: TransferListItem[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type CreateTransferInput = {
  fromWarehouseId: string;
  toWarehouseId: string;
  productId: number;
  quantity: number;
  unit: string;
  notes: string;
  requestedBy: string;
};

export type UpdateTransferResult = {
  id: string;
  code: string;
  status: string;
  fromName: string;
  toName: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

const INCLUDE_NAMES = {
  fromWarehouse: { select: { name: true } },
  toWarehouse: { select: { name: true } },
  product: { select: { name: true } },
} as const;

// ── AdminWarehouseTransfersDB ─────────────────────────────────────────────────

export const AdminWarehouseTransfersDB = {
  /**
   * Lista transferencias del tenant con paginacion por cursor.
   * Filtra opcionalmente por warehouse origen o destino.
   */
  async list(
    tenantId: string,
    opts: {
      limit: number;
      cursor?: string;
      fromId?: string;
      toId?: string;
    },
  ): Promise<TransferListResult> {
    const rows = await prisma.transfer.findMany({
      where: {
        tenantId,
        ...(opts.fromId ? { fromWarehouseId: opts.fromId } : {}),
        ...(opts.toId ? { toWarehouseId: opts.toId } : {}),
      },
      include: INCLUDE_NAMES,
      orderBy: { createdAt: "desc" },
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > opts.limit;
    const items = hasMore ? rows.slice(0, opts.limit) : rows;

    return {
      items: items.map((r) => ({
        id: r.id,
        code: r.code,
        fromId: r.fromWarehouseId,
        fromName: r.fromWarehouse.name,
        toId: r.toWarehouseId,
        toName: r.toWarehouse.name,
        productId: r.productId,
        productName: r.product.name,
        quantity: r.quantity,
        unit: r.unit,
        status: r.status,
        notes: r.notes,
        requestedBy: r.requestedBy,
        date: toISO(r.requestDate),
        createdAt: toISO(r.createdAt),
      })),
      hasMore,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  },

  /**
   * Verifica que un warehouse pertenece al tenant.
   * Retorna null si no existe o es de otro tenant.
   */
  async findWarehouse(
    tenantId: string,
    warehouseId: string,
  ): Promise<{ id: string; name: string } | null> {
    return prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
      select: { id: true, name: true },
    });
  },

  /**
   * Suma el stock disponible del producto en un warehouse via Location.
   * Retorna 0 si no hay registros (stock no tracked).
   */
  async locationStock(
    tenantId: string,
    warehouseId: string,
    productId: number,
  ): Promise<number> {
    const agg = await prisma.location.aggregate({
      where: { warehouseId, productId, tenantId },
      _sum: { qty: true },
    });
    return agg._sum.qty ?? 0;
  },

  /**
   * Crea una transferencia con codigo correlativo TRF-XXXX.
   * El codigo se basa en count total del tenant — no es atomicamente unico
   * bajo concurrencia extrema, pero es aceptable para bodega familiar.
   */
  async create(
    tenantId: string,
    input: CreateTransferInput,
  ): Promise<TransferListItem> {
    const count = await prisma.transfer.count({ where: { tenantId } });
    const code = `TRF-${String(count + 1).padStart(4, "0")}`;

    const transfer = await prisma.transfer.create({
      data: {
        code,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        productId: input.productId,
        quantity: input.quantity,
        unit: input.unit,
        notes: input.notes,
        status: "pendiente",
        requestedBy: input.requestedBy,
        tenantId,
      },
      include: INCLUDE_NAMES,
    });

    return {
      id: transfer.id,
      code: transfer.code,
      fromId: transfer.fromWarehouseId,
      fromName: transfer.fromWarehouse.name,
      toId: transfer.toWarehouseId,
      toName: transfer.toWarehouse.name,
      productId: transfer.productId,
      productName: transfer.product.name,
      quantity: transfer.quantity,
      unit: transfer.unit,
      status: transfer.status,
      notes: transfer.notes,
      requestedBy: transfer.requestedBy,
      date: toISO(transfer.requestDate),
      createdAt: toISO(transfer.createdAt),
    };
  },

  /**
   * Verifica stock de origin antes de completar (solo lectura — no modifica).
   * Retorna { ok: true } o { ok: false, available, required }.
   */
  async checkOriginStock(
    tenantId: string,
    transferId: string,
  ): Promise<
    | { ok: true }
    | { ok: false; available: number; required: number }
    | { notFound: true }
  > {
    const existing = await prisma.transfer.findFirst({
      where: { id: transferId, tenantId },
    });
    if (!existing) return { notFound: true };

    const originLoc = await prisma.location.findFirst({
      where: {
        warehouseId: existing.fromWarehouseId,
        productId: existing.productId,
        tenantId: existing.tenantId,
      },
    });

    // Si no hay Location registrada, stock no tracked — permitir completar
    if (!originLoc) return { ok: true };
    if (originLoc.qty < existing.quantity) {
      return { ok: false, available: originLoc.qty, required: existing.quantity };
    }
    return { ok: true };
  },

  /**
   * Actualiza el status de una transferencia (updateMany con tenantId guard).
   * Si el nuevo status es "completado", ajusta Location stock en transaccion.
   * Retorna el registro actualizado o null si no se encontro.
   */
  async updateStatus(
    tenantId: string,
    id: string,
    status: string,
  ): Promise<UpdateTransferResult | null> {
    const claim = await prisma.transfer.updateMany({
      where: { id, tenantId },
      data: {
        status,
        ...(status === "completado" ? { deliveredDate: new Date() } : {}),
      },
    });

    if (claim.count === 0) return null;

    const updated = await prisma.transfer.findFirstOrThrow({
      where: { id, tenantId },
      include: {
        fromWarehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
      },
    });

    // Ajuste de stock en Location solo si se marca como completado
    if (status === "completado") {
      try {
        const [fromLoc, toLoc] = await Promise.all([
          prisma.location.findFirst({
            where: {
              warehouseId: updated.fromWarehouseId,
              productId: updated.productId,
              tenantId: updated.tenantId,
            },
          }),
          prisma.location.findFirst({
            where: {
              warehouseId: updated.toWarehouseId,
              productId: updated.productId,
              tenantId: updated.tenantId,
            },
          }),
        ]);

        await prisma.$transaction([
          ...(fromLoc
            ? [
                prisma.location.update({
                  where: { id: fromLoc.id },
                  data: { qty: Math.max(0, fromLoc.qty - updated.quantity) },
                }),
              ]
            : []),
          ...(toLoc
            ? [
                prisma.location.update({
                  where: { id: toLoc.id },
                  data: { qty: toLoc.qty + updated.quantity },
                }),
              ]
            : [
                prisma.location.create({
                  data: {
                    code: `LOC-${updated.toWarehouseId.slice(0, 6)}-${updated.productId}`,
                    zone: "General",
                    warehouseId: updated.toWarehouseId,
                    productId: updated.productId,
                    qty: updated.quantity,
                    tenantId: updated.tenantId,
                  },
                }),
              ]),
        ]);

        // Recomputa Product.stock como suma de todas las Location del tenant
        const aggregate = await prisma.location.aggregate({
          where: { productId: updated.productId, tenantId: updated.tenantId },
          _sum: { qty: true },
        });
        await prisma.product
          .update({
            where: { id: updated.productId },
            data: { stock: aggregate._sum.qty ?? 0 },
          })
          .catch((err) => {
            logger.warn(
              "[AdminWarehouseTransfersDB] stock recompute failed (best-effort)",
              { err: String(err), productId: updated.productId },
            );
          });
      } catch {
        // Ajuste de stock es best-effort — status ya fue guardado
      }
    }

    return {
      id: updated.id,
      code: updated.code,
      status: updated.status,
      fromName: updated.fromWarehouse.name,
      toName: updated.toWarehouse.name,
    };
  },
};
