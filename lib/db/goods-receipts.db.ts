import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * GoodsReceiptsDB — recepciones de mercadería persistidas (2026-07-08).
 *
 * Antes las recepciones no se guardaban (el endpoint movía stock/anotaba la OC
 * pero no dejaba registro). Esta clase persiste la recepción completa con su
 * factura del proveedor adjunta. `tenantId` SIEMPRE primer parámetro.
 */

export interface ReceiptItem {
  product: string;
  expectedQty: number;
  receivedQty: number;
  condition: "ok" | "dañado" | "vencido" | "faltante";
  notes: string;
}

export interface CreateReceiptData {
  ref: string;
  purchaseOrderId?: string | null;
  supplierId?: string | null;
  supplierName: string;
  status?: string;
  inspector?: string | null;
  scheduledDate?: Date | null;
  receivedDate?: Date | null;
  items: ReceiptItem[];
  photos?: number;
  nonConformities?: number;
  invoiceUrl?: string | null;
  notes?: string | null;
}

export const GoodsReceiptsDB = {
  /** Lista las recepciones del tenant (más recientes primero). */
  async list(tenantId: string) {
    return prisma.goodsReceipt.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  },

  /** Crea una recepción. `items` se guarda como JSON (ReceiptItem[]). */
  async create(tenantId: string, data: CreateReceiptData) {
    return prisma.goodsReceipt.create({
      data: {
        ref: data.ref,
        purchaseOrderId: data.purchaseOrderId ?? null,
        supplierId: data.supplierId ?? null,
        supplierName: data.supplierName,
        status: data.status ?? "en-proceso",
        inspector: data.inspector ?? null,
        scheduledDate: data.scheduledDate ?? null,
        receivedDate: data.receivedDate ?? null,
        itemsJson: data.items as unknown as Prisma.InputJsonValue,
        photos: data.photos ?? 0,
        nonConformities: data.nonConformities ?? 0,
        invoiceUrl: data.invoiceUrl ?? null,
        notes: data.notes ?? null,
        tenantId,
      },
    });
  },
};
