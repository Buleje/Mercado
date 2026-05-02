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
 *
 * SCHEMA DRIFT NOTE: the migration 20260502130000_add_payment_approval_link
 * adds Order.paymentApprovalId at the SQL layer but prisma/schema.prisma
 * has not been updated yet. Until the schema is synced and the Prisma
 * client regenerated, we use raw SQL — same pattern as payment-approval.db.ts.
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

interface RawRow {
  id: string;
  tenantId: string;
  status: string;
  total: string | number;
  customerPhone: string | null;
  customerName: string | null;
  tenantName: string | null;
}

export const OrderPaymentLinkDb = {
  /**
   * Returns every Order tagged with the given PaymentApproval.id.
   * Empty array when there are none. Never throws; logs on error.
   */
  async findByApprovalId(approvalId: string): Promise<LinkedOrder[]> {
    try {
      // eslint-disable-next-line no-restricted-properties -- schema drift: paymentApprovalId is in the migration but not yet in schema.prisma
      const rows = await prisma.$queryRawUnsafe<RawRow[]>(
        `SELECT
           o.id,
           o."tenantId",
           o.status,
           o.total,
           o."customerPhone",
           o."customerName",
           t.name AS "tenantName"
         FROM "Order" o
         LEFT JOIN "Tenant" t ON t.id = o."tenantId"
         WHERE o."paymentApprovalId" = $1
         ORDER BY o."createdAt" ASC`,
        approvalId,
      );

      return rows.map((r) => ({
        id: String(r.id),
        tenantId: String(r.tenantId),
        status: String(r.status),
        total: typeof r.total === "number" ? r.total : Number(r.total),
        customerPhone: r.customerPhone ?? "",
        customerName: r.customerName ?? "",
        storeName: r.tenantName ?? null,
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
