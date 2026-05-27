import "server-only";

/**
 * lib/db/order-payment-link.db.ts
 *
 * Read-only helper to look up Orders linked to a PaymentApproval.
 *
 * Lives outside lib/db/orders.db.ts because that file is a state-machine
 * danger zone (see .github/instructions/database-migrations.instructions.md).
 * This module only READS — never mutates Order state. Callers that need
 * to transition an Order (e.g. superadmin approve/reject) MUST use
 * `OrdersDB.update(tenantId, id, { status })` so the state machine,
 * idempotency, and audit guarantees of orders.db.ts stay intact.
 *
 * Cross-tenant by design: PaymentApproval is a platform-level entity
 * (no tenantId column — see prisma migration 20260502120000_add_payment_approval).
 * The multi-vendor WhatsApp checkout creates one Order per vendor and
 * stamps each with the same paymentApprovalId.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface LinkedOrder {
  id: string;
  tenantId: string;
  status: string;
  total: number;
  customerPhone: string;
  customerName: string;
  storeName: string | null;
}

export const OrderPaymentLinkDb = {
  /**
   * Returns every Order tagged with the given PaymentApproval.id.
   * Empty array when there are none. Never throws; logs on error.
   */
  async findByApprovalId(approvalId: string): Promise<LinkedOrder[]> {
    try {
       
      const orders = await prisma.order.findMany({
        where: { paymentApprovalId: approvalId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          tenantId: true,
          status: true,
          total: true,
          customerPhone: true,
          customerName: true,
        },
      });

      if (orders.length === 0) return [];

      // Lookup nombres de tenant en una sola query
      const tenantIds = Array.from(new Set(orders.map((o) => o.tenantId)));
       
      const tenants = await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true },
      });
      const nameByTenantId = new Map(tenants.map((t) => [t.id, t.name]));

      return orders.map((o) => ({
        id: o.id,
        tenantId: o.tenantId,
        status: o.status as unknown as string,
        total: Number(o.total),
        customerPhone: o.customerPhone ?? "",
        customerName: o.customerName,
        storeName: nameByTenantId.get(o.tenantId) ?? null,
      }));
    } catch (err) {
      logger.error("[order-payment-link] findByApprovalId failed", {
        approvalId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  },
};
