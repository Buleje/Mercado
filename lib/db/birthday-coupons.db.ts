import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * BirthdayCouponsDB
 *
 * Helpers para el cron de cupones de cumpleaños. Cross-tenant intencional
 * (el cron corre 1 vez/dia para todo el ecosistema). Audit project-wide
 * 2026-05-19 — migracion de /api/birthday-coupons.
 *
 * @cross-tenant intentional — cron de plataforma (ADR-082).
 */

export interface BirthdayCandidate {
  phone: string;
  name: string;
  birthday: Date | null;
  notifPromotions: boolean | null;
  tenantId: string;
}

export const BirthdayCouponsDB = {
  /**
   * Lista candidatos: customers con birthday no-null. El filtro por
   * dia/mes se hace en memoria porque Prisma no expresa "MONTH(x)
   * AND DAY(x)" portable sin raw SQL.
   */
  async listBirthdayCandidates(): Promise<BirthdayCandidate[]> {
    return prisma.customer.findMany({
      where: { birthday: { not: null } },
      select: {
        phone: true,
        name: true,
        birthday: true,
        notifPromotions: true,
        tenantId: true,
      },
    });
  },

  /**
   * Verifica si ya existe un coupon con ese codigo (idempotencia por año).
   */
  async couponExists(code: string): Promise<boolean> {
    const row = await prisma.coupon.findFirst({
      where: { code },
      select: { id: true },
    });
    return !!row;
  },

  /**
   * Crea un coupon de cumpleaños scoped al tenant del customer.
   */
  async createBirthdayCoupon(params: {
    tenantId: string;
    code: string;
    customerName: string;
    expiresAt: Date;
  }): Promise<void> {
    await prisma.coupon.create({
      data: {
        code: params.code,
        description: `🎂 Feliz cumpleaños ${params.customerName}! 10% de descuento`,
        discountType: "percent",
        discountValue: 10,
        maxUses: 1,
        active: true,
        expiresAt: params.expiresAt,
        tenantId: params.tenantId,
      },
    });
  },
};
