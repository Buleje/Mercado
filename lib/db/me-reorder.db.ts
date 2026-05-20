/**
 * lib/db/me-reorder.db.ts
 *
 * DB class para quick-reorder del storefront (/api/me/reorder/[orderId]).
 * Recupera una orden previa verificando ownership por customerPhone
 * para pre-poblar el carrito con precios e inventario actualizados.
 *
 * Audit project-wide 2026-05-19 — migración regla #1 CLAUDE.md.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

// Estructural — compatible con DecimalLike (toNumber/toFixed/toString) y number/string.
type PrismaDecimal = { toNumber(): number; toFixed(d?: number): string; toString(): string };

export type ReorderItem = {
  productId: number | null;
  name: string;
  quantity: number;
  price: PrismaDecimal | number | string;
  unit: string | null;
};

export type ReorderOrder = {
  id: string;
  tenantId: string;
  customerPhone: string | null;
  total: PrismaDecimal | number | string;
  createdAt: Date;
  items: ReorderItem[];
};

// ─── MeReorderDB ─────────────────────────────────────────────────────────────

export const MeReorderDB = {
  /**
   * Busca una orden previa verificando tenantId + customerPhone (ownership).
   * Devuelve null si no existe o no pertenece al customer.
   *
   * @param tenantId      - Tenant del storefront (aislamiento multi-tenant)
   * @param customerPhone - Teléfono del customer (PK lógica de Customer)
   * @param orderId       - ID de la orden a recuperar
   */
  async findOrderForReorder(
    tenantId: string,
    customerPhone: string,
    orderId: string,
  ): Promise<ReorderOrder | null> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId, customerPhone },
      include: {
        items: {
          select: {
            productId: true,
            name: true,
            quantity: true,
            price: true,
            unit: true,
          },
        },
      },
    });

    if (!order) {
      logger.warn("[MeReorderDB] order not found or unauthorized", {
        tenantId,
        orderId,
        customerPhone,
      });
      return null;
    }

    return order as ReorderOrder;
  },
};
