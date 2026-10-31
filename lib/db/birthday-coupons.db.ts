import "server-only";
import { prisma } from "@/lib/prisma";
import { cumpleDe, cumpleParaGuardar } from "@/lib/clientes/cumpleanos";

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
   * Lista candidatos: customers con cumpleaños en CUALQUIERA de las dos
   * columnas (`birthday` de la tienda o `fechaNacimiento` de la ficha del
   * panel — 09-10: el que cargaba el cajero nunca disparaba el cupón).
   * `birthday` sale ya unificado por `cumpleDe` y a mediodía UTC, así el
   * `getMonth()/getDate()` del llamador da el mismo día en Lima y en UTC.
   * El filtro por dia/mes se hace en memoria porque Prisma no expresa
   * "MONTH(x) AND DAY(x)" portable sin raw SQL.
   */
  async listBirthdayCandidates(): Promise<BirthdayCandidate[]> {
    const filas = await prisma.customer.findMany({
      where: { OR: [{ birthday: { not: null } }, { fechaNacimiento: { not: null } }] },
      select: {
        phone: true,
        name: true,
        birthday: true,
        fechaNacimiento: true,
        notifPromotions: true,
        tenantId: true,
      },
    });
    return filas.map(({ fechaNacimiento, ...c }) => ({
      ...c,
      birthday: cumpleParaGuardar(cumpleDe({ birthday: c.birthday, fechaNacimiento })),
    }));
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
