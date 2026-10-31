import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * MeReferralStatusDB
 * Audit project-wide 2026-05-19 — migración de /api/me/referral-status.
 *
 * Acceso canónico al estado del programa de referidos para el customer
 * autenticado. Encapsula las queries de Customer (referralCode, loyaltyPoints)
 * y la lista de referidos (customers con `referredBy` = mi CELULAR: así lo
 * escriben `CustomersDB.applyReferralCode` y `ReferralsDB.vincular`; hasta el
 * 20-10 se buscaba por código y la lista salía vacía siempre).
 *
 * tenantId obligatorio como primer argumento (CLAUDE.md regla #3).
 */
export const MeReferralStatusDB = {
  /**
   * Datos propios del customer: código de referido, puntos de lealtad y nombre.
   *
   * @param tenantId      tenant scope
   * @param customerPhone teléfono normalizado (Customer PK)
   */
  async getSelf(tenantId: string, customerPhone: string) {
    return prisma.customer.findFirst({
      where: { phone: customerPhone, tenantId },
      select: {
        referralCode: true,
        loyaltyPoints: true,
        name: true,
      },
    });
  },

  /**
   * Clientas que llegaron recomendadas por el caller (tenantId en el WHERE).
   *
   * @param tenantId      tenant scope
   * @param customerPhone celular de quien recomendó (Customer.referredBy)
   * @param take          máximo de resultados (default 20)
   */
  async getReferredCustomers(
    tenantId: string,
    customerPhone: string,
    take = 20,
  ) {
    return prisma.customer.findMany({
      where: {
        referredBy: customerPhone,
        tenantId,
      },
      select: {
        name: true,
        createdAt: true,
        totalSpent: true,
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  },
};
