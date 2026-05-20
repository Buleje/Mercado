import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * CustomerDataDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/customer/data.
 * Ley 29733 PE — Export + Right-to-Erasure de PII.
 * Todas las queries scoped por tenantId (audit 2026-05-05 CT-12, 2026-05-06 H009).
 */

export const CustomerDataDB = {
  async findCustomerWithCarts(tenantId: string, phone: string) {
    return prisma.customer.findFirst({
      where: { phone, tenantId },
      include: { savedCarts: true },
    });
  },

  async listOrdersByCustomer(tenantId: string, customerPhone: string) {
    return prisma.order.findMany({
      where: { customerPhone, tenantId },
      select: {
        id: true,
        createdAt: true,
        total: true,
        status: true,
        paymentMethod: true,
        customerLocation: true,
        customerReference: true,
        items: { select: { name: true, quantity: true, price: true } },
      },
    });
  },

  async listReviewsByPhone(tenantId: string, phone: string) {
    return prisma.review.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { phone, tenantId, deletedAt: null } as any,
      select: { id: true, date: true, rating: true, text: true },
    });
  },

  async anonymizeReviews(tenantId: string, phone: string) {
    return prisma.review.updateMany({
      where: { phone, tenantId },
      data: { name: "[deleted]", phone: null },
    });
  },

  async deleteCustomer(tenantId: string, phone: string) {
    return prisma.customer.deleteMany({ where: { phone, tenantId } });
  },
};
