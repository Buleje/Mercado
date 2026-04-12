import "server-only";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";

// ── Types ────────────────────────────────────────────────────────────────────

export type DbReferral = {
  id: string;
  tenantId: string;
  referrerId: string; // Customer.phone
  refereeId: string;  // Customer.phone
  status: "pending" | "rewarded";
  rewardCouponId: string | null;
  orderId: string | null;
  createdAt: string;
  rewardedAt: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReferral(r: any): DbReferral {
  return {
    id: r.id,
    tenantId: r.tenantId,
    referrerId: r.referrerId,
    refereeId: r.refereeId,
    status: r.status as "pending" | "rewarded",
    rewardCouponId: r.rewardCouponId ?? null,
    orderId: r.orderId ?? null,
    createdAt: toISO(r.createdAt),
    rewardedAt: r.rewardedAt ? toISO(r.rewardedAt) : null,
  };
}

/** Genera un código base36 de 8 caracteres en mayúsculas */
function generateBase36Code(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  // Usamos crypto.getRandomValues si está disponible (Node 20+), fallback a Math.random
  const buf = new Uint32Array(8);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < 8; i++) {
      code += chars[buf[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return code;
}

// ── Configuración de rewards (configurable) ──────────────────────────────────

const REFERRAL_CONFIG = {
  /** Descuento porcentual para el referee en su primera compra */
  refereePct: 10,
  /** Monto fijo en soles para el referrer cuando el referee completa su primer pedido */
  referrerFixedSoles: 10,
  /** Días de expiración de los cupones generados */
  couponExpiryDays: 30,
} as const;

// ── ReferralsDB ───────────────────────────────────────────────────────────────

export const ReferralsDB = {
  /**
   * Genera (o devuelve el existente) código único de referido para un customer.
   * tenantId como primer parámetro — regla #3 del proyecto.
   */
  async generateCodeForCustomer(
    tenantId: string,
    customerPhone: string,
  ): Promise<string> {
    const customer = await prisma.customer.findFirst({
      where: { phone: customerPhone, tenantId },
      select: { referralCode: true },
    });

    if (customer?.referralCode) return customer.referralCode;

    // Generar código único con reintentos para evitar colisiones
    let code = "";
    let attempts = 0;
    while (attempts < 5) {
      code = generateBase36Code();
      const existing = await prisma.customer.findFirst({
        where: { referralCode: code },
        select: { phone: true },
      });
      if (!existing) break;
      attempts++;
    }

    await prisma.customer.updateMany({
      where: { phone: customerPhone, tenantId },
      data: { referralCode: code },
    });

    return code;
  },

  /**
   * Busca un customer por su código de referido dentro del tenant.
   */
  async getCustomerByReferralCode(
    tenantId: string,
    code: string,
  ): Promise<{ phone: string; name: string } | null> {
    const row = await prisma.customer.findFirst({
      where: { referralCode: code, tenantId },
      select: { phone: true, name: true },
    });
    return row ?? null;
  },

  /**
   * Registra el vínculo referidor → referido y crea el cupón de bienvenida
   * para el referee (10% descuento en primera compra).
   * Retorna error si el referee intenta auto-referirse.
   */
  async registerReferral(
    tenantId: string,
    referrerId: string,
    refereeId: string,
  ): Promise<{ success: boolean; message: string; couponCode?: string }> {
    // Guardia: no puede auto-referirse
    if (referrerId === refereeId) {
      return { success: false, message: "No puedes usar tu propio código de referido" };
    }

    // Verificar que el referee no haya sido referido antes (unique constraint)
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Referral"
      WHERE "tenantId" = ${tenantId}
        AND "refereeId" = ${refereeId}
      LIMIT 1
    `;
    if (existing.length > 0) {
      return { success: false, message: "Este cliente ya fue referido previamente" };
    }

    // Actualizar referredBy en el Customer del referee
    await prisma.customer.updateMany({
      where: { phone: refereeId, tenantId },
      data: { referredBy: referrerId },
    });

    // Crear registro Referral
    await prisma.$executeRaw`
      INSERT INTO "Referral" ("id", "tenantId", "referrerId", "refereeId", "status", "createdAt")
      VALUES (
        gen_random_uuid()::text,
        ${tenantId},
        ${referrerId},
        ${refereeId},
        'pending',
        NOW()
      )
      ON CONFLICT ("tenantId", "refereeId") DO NOTHING
    `;

    // Crear cupón de bienvenida (10%) para el referee
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFERRAL_CONFIG.couponExpiryDays);

    const couponCode = `REF-${refereeId.replace(/\D/g, "").slice(-6)}-${Date.now().toString(36).toUpperCase()}`;

    await prisma.coupon.create({
      data: {
        tenantId,
        code: couponCode,
        description: `Descuento bienvenida por referido — ${REFERRAL_CONFIG.refereePct}% en tu primera compra`,
        discountType: "percent",
        discountValue: REFERRAL_CONFIG.refereePct,
        maxUses: 1,
        expiresAt,
        active: true,
      },
    });

    logActivity(
      "referral_registered",
      "Referral",
      `Referee ${refereeId} referido por ${referrerId}. Cupón bienvenida: ${couponCode}`,
      refereeId,
      "system",
      undefined,
      tenantId,
    ).catch(() => {});

    return { success: true, message: "Referido registrado correctamente", couponCode };
  },

  /**
   * Dispara el reward al referrer cuando el referee completa su PRIMER pedido.
   * Crea un cupón de S/10 para el referrer y marca el registro como 'rewarded'.
   * Es idempotente: si ya está rewarded, retorna sin duplicar.
   */
  async onFirstOrderCompleted(
    tenantId: string,
    refereeId: string,
    orderId: string,
  ): Promise<{ rewarded: boolean; couponCode?: string; referrerId?: string }> {
    // Buscar registro pendiente
    const rows = await prisma.$queryRaw<{
      id: string;
      referrerId: string;
      status: string;
    }[]>`
      SELECT id, "referrerId", status FROM "Referral"
      WHERE "tenantId" = ${tenantId}
        AND "refereeId" = ${refereeId}
      LIMIT 1
    `;

    if (rows.length === 0) return { rewarded: false };

    const referral = rows[0];
    if (referral.status === "rewarded") return { rewarded: false };

    // Verificar que este sea el PRIMER pedido confirmado del referee
    const prevOrders = await prisma.order.count({
      where: {
        tenantId,
        customerPhone: refereeId,
        status: "confirmado",
        id: { not: orderId },
      },
    });
    if (prevOrders > 0) return { rewarded: false };

    // Crear cupón de S/10 para el referrer
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFERRAL_CONFIG.couponExpiryDays);

    const couponCode = `BONUS-REF-${referral.referrerId.replace(/\D/g, "").slice(-6)}-${Date.now().toString(36).toUpperCase()}`;

    const coupon = await prisma.coupon.create({
      data: {
        tenantId,
        code: couponCode,
        description: `Recompensa por referido — S/${REFERRAL_CONFIG.referrerFixedSoles} en tu próxima compra`,
        discountType: "fixed",
        discountValue: REFERRAL_CONFIG.referrerFixedSoles,
        maxUses: 1,
        expiresAt,
        active: true,
      },
    });

    // Marcar referral como rewarded con raw SQL (tabla no está en schema Prisma todavía)
    await prisma.$executeRaw`
      UPDATE "Referral"
      SET "status"         = 'rewarded',
          "rewardCouponId" = ${coupon.id},
          "orderId"        = ${orderId},
          "rewardedAt"     = NOW()
      WHERE id = ${referral.id}
    `;

    logActivity(
      "referral_rewarded",
      "Referral",
      `Referrer ${referral.referrerId} recompensado con cupón ${couponCode} por primer pedido de ${refereeId}`,
      orderId,
      "system",
      undefined,
      tenantId,
    ).catch(() => {});

    return { rewarded: true, couponCode, referrerId: referral.referrerId };
  },

  /**
   * Lista todos los referidos de un customer (como referrer).
   */
  async listReferralsByCustomer(
    tenantId: string,
    customerPhone: string,
  ): Promise<DbReferral[]> {
    const rows = await prisma.$queryRaw<{
      id: string;
      tenantId: string;
      referrerId: string;
      refereeId: string;
      status: string;
      rewardCouponId: string | null;
      orderId: string | null;
      createdAt: Date;
      rewardedAt: Date | null;
    }[]>`
      SELECT id, "tenantId", "referrerId", "refereeId", status,
             "rewardCouponId", "orderId", "createdAt", "rewardedAt"
      FROM "Referral"
      WHERE "tenantId" = ${tenantId}
        AND "referrerId" = ${customerPhone}
      ORDER BY "createdAt" DESC
    `;

    return rows.map(mapReferral);
  },
};
