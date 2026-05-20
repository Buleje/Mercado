import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * MeReferralStatusDB
 * Audit project-wide 2026-05-19 — migración de /api/me/referral-status.
 *
 * Acceso canónico al estado del programa de referidos para el customer
 * autenticado. Encapsula las queries de Customer (referralCode, loyaltyPoints)
 * y la lista de referidos (customers con `referredBy` = mi código).
 *
 * No toca ReferralsDB (tabla Referral — archivo compartido de otro agente).
 * Solo usa el modelo Customer (campo referredBy).
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
   * Lista de customers que usaron el código de referido del caller.
   * Busca por `referredBy` = referralCode + tenantId para aislamiento.
   *
   * @param tenantId     tenant scope
   * @param referralCode código a buscar en Customer.referredBy
   * @param take         máximo de resultados (default 20)
   */
  async getReferredCustomers(
    tenantId: string,
    referralCode: string,
    take = 20,
  ) {
    return prisma.customer.findMany({
      where: {
        referredBy: referralCode,
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
