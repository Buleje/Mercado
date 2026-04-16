/**
 * lib/coupons/auto-coupon-triggers.ts
 *
 * Cupones automáticos por hito para el marketplace.
 *
 * Tres triggers:
 *  - "first_purchase"   → Primera compra del cliente → BIENVENIDO 10%
 *  - "birthday"         → Cumpleaños ±7 días → CUMPLEAÑOS 15%
 *  - "loyal_customer"   → 10ma compra → FIEL 20%
 *
 * Idempotencia: antes de crear el cupón se verifica si ya existe uno
 * activo del mismo tipo (por prefijo en el código) para el cliente.
 *
 * Uso:
 *   await checkAndIssueCoupons(order, customer, tenantId);
 *   // siempre fire-and-forget desde el caller
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { CouponsDB } from "@/lib/db/promotions.db";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import type { DbOrder } from "@/lib/db/misc.db";
import type { DbCustomer } from "@/lib/db/misc.db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CouponTriggerType =
  | "first_purchase"
  | "birthday"
  | "loyal_customer";

export type CouponTrigger =
  | { type: "first_purchase"; couponPrefix: "BIENVENIDO"; discountPercent: 10 }
  | { type: "birthday";       couponPrefix: "CUMPLEANOS"; discountPercent: 15; daysWindow: 7 }
  | { type: "loyal_customer"; couponPrefix: "FIEL";       discountPercent: 20; ordersThreshold: 10 };

/** Coupon validity in days from creation */
const COUPON_VALIDITY_DAYS = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (base) return base;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

function expiresInDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Genera un código de cupón único para el cliente.
 * Formato: {PREFIX}-{últimos6 del phone}-{timestamp4}
 * Ej: BIENVENIDO-123456-A1B2
 */
function buildCouponCode(prefix: string, customerPhone: string): string {
  const phoneSuffix = customerPhone.replace(/\D/g, "").slice(-6);
  const timeSuffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${phoneSuffix}-${timeSuffix}`;
}

/**
 * Verifica si el cliente ya tiene un cupón activo con ese prefijo
 * para este tenant → idempotencia.
 */
async function alreadyHasCoupon(
  prefix: string,
  customerPhone: string,
  tenantId: string
): Promise<boolean> {
  const phoneSuffix = customerPhone.replace(/\D/g, "").slice(-6);
  const partialCode = `${prefix}-${phoneSuffix}-`;

  const existing = await prisma.coupon.findFirst({
    where: {
      tenantId,
      code: { startsWith: partialCode },
      active: true,
      expiresAt: { gte: new Date() },
    },
  });
  return existing !== null;
}

/**
 * Cuenta las órdenes completadas del cliente en el tenant.
 * Se usa para detectar la primera compra y la 10ma compra.
 */
async function countCustomerOrders(
  customerPhone: string,
  tenantId: string
): Promise<number> {
  return prisma.order.count({
    where: {
      tenantId,
      customerPhone,
      status: { not: "cancelado" },
    },
  });
}

/**
 * Devuelve true si el cumpleaños del cliente cae dentro de los próximos
 * `daysWindow` días (o los últimos `daysWindow` días).
 * Ignora el año → solo mes y día importan.
 */
function isBirthdayWindow(birthday: string | undefined, daysWindow: number): boolean {
  if (!birthday) return false;
  const bday = new Date(birthday);
  const today = new Date();
  // Normalizar al año actual
  const bdayThisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
  const diffMs = bdayThisYear.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.abs(diffDays) <= daysWindow;
}

/**
 * Crea el cupón en DB y notifica al cliente por WhatsApp.
 */
async function issueCoupon(opts: {
  prefix: string;
  discountPercent: number;
  customerPhone: string;
  customerName?: string;
  tenantId: string;
  description: string;
  trigger: CouponTriggerType;
}): Promise<void> {
  const code = buildCouponCode(opts.prefix, opts.customerPhone);
  const expiresAt = expiresInDays(COUPON_VALIDITY_DAYS).toISOString();

  await CouponsDB.add(
    {
      code,
      description:   opts.description,
      discountType:  "percent",
      discountValue: opts.discountPercent,
      maxUses:       1,
      active:        true,
      expiresAt,
    },
    opts.tenantId
  );

  logger.info("[auto-coupon] Cupón emitido", {
    trigger: opts.trigger,
    code,
    customerPhone: opts.customerPhone,
    tenantId: opts.tenantId,
  });

  // Notificar al cliente por WhatsApp — fire-and-forget
  const marketplaceUrl = `${getBaseUrl()}/marketplace`;

  const message = opts.trigger === "birthday"
    ? `🎂🎉 *¡Feliz Cumpleaños${opts.customerName ? `, ${opts.customerName}` : ""}!* 🎉🎂\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `En tu día especial, te tenemos un regalo:\n\n` +
      `🎁 *${opts.discountPercent}% de descuento* en tu próxima compra\n` +
      `🏷️ Tu código: *${code}*\n` +
      `📅 Válido por ${COUPON_VALIDITY_DAYS} días\n\n` +
      `¡Pásala increíble y consiéntete! 🥳\n` +
      `🛒 Canjéalo aquí: ${marketplaceUrl}`
    : opts.trigger === "first_purchase"
    ? `🎉 *¡Bienvenido/a a nuestra tienda!*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Gracias por tu primera compra. Te damos un regalito:\n\n` +
      `🏷️ Tu código: *${code}*\n` +
      `💰 Descuento: ${opts.discountPercent}% en tu próxima compra\n` +
      `📅 Válido por ${COUPON_VALIDITY_DAYS} días\n\n` +
      `🛒 Canjéalo: ${marketplaceUrl}`
    : opts.trigger === "loyal_customer"
    ? `🏆 *¡Eres cliente VIP!*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Ya llevas 10 compras con nosotros. ¡Mereces un premio!\n\n` +
      `🏷️ Tu código: *${code}*\n` +
      `💰 Descuento: ${opts.discountPercent}% en tu próxima compra\n` +
      `📅 Válido por ${COUPON_VALIDITY_DAYS} días\n\n` +
      `Gracias por confiar en nosotros 💚\n` +
      `🛒 Canjéalo: ${marketplaceUrl}`
    : `🎁 *Tienes un regalo de tu tienda favorita*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `${opts.description}\n\n` +
      `🏷️ Tu código: *${code}*\n` +
      `💰 Descuento: ${opts.discountPercent}% en tu próxima compra\n` +
      `📅 Válido por ${COUPON_VALIDITY_DAYS} días\n\n` +
      `🛒 Úsalo en:\n${marketplaceUrl}`;

  sendWhatsAppQueued(opts.customerPhone, message, { tenantId: opts.tenantId, context: `auto-coupon-${opts.trigger}` }).catch(() => {});
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evalúa los tres triggers de cupones automáticos para la orden recién creada.
 * Debe llamarse fire-and-forget desde OrdersDB.add().
 *
 * Idempotente: si el cupón ya fue emitido antes, no se emite otro.
 */
export async function checkAndIssueCoupons(
  order: DbOrder,
  customer: DbCustomer | null,
  tenantId: string
): Promise<void> {
  if (!isFeatureEnabled("auto-coupon-triggers", tenantId)) return;

  const customerPhone = order.customer.phone;
  if (!customerPhone) return;

  const normalizedPhone = customerPhone.replace(/\D/g, "");

  // ── Trigger 1: Primera compra ─────────────────────────────────────────────
  const orderCount = await countCustomerOrders(normalizedPhone, tenantId);

  if (orderCount === 1) {
    const alreadyIssued = await alreadyHasCoupon("BIENVENIDO", normalizedPhone, tenantId);
    if (!alreadyIssued) {
      await issueCoupon({
        prefix:          "BIENVENIDO",
        discountPercent: 10,
        customerPhone:   normalizedPhone,
        tenantId,
        description:     "Bienvenida a nuestra tienda. Gracias por tu primera compra.",
        trigger:         "first_purchase",
      });
    }
  }

  // ── Trigger 2: Cumpleaños (±7 días) ──────────────────────────────────────
  if (customer?.birthday && isBirthdayWindow(customer.birthday, 7)) {
    const alreadyIssued = await alreadyHasCoupon("CUMPLEANOS", normalizedPhone, tenantId);
    if (!alreadyIssued) {
      await issueCoupon({
        prefix:          "CUMPLEANOS",
        discountPercent: 15,
        customerPhone:   normalizedPhone,
        tenantId,
        description:     "Feliz cumpleanos. Te regalamos un descuento especial.",
        trigger:         "birthday",
      });
    }
  }

  // ── Trigger 3: Cliente frecuente (exactamente 10ma compra) ────────────────
  if (orderCount === 10) {
    const alreadyIssued = await alreadyHasCoupon("FIEL", normalizedPhone, tenantId);
    if (!alreadyIssued) {
      await issueCoupon({
        prefix:          "FIEL",
        discountPercent: 20,
        customerPhone:   normalizedPhone,
        tenantId,
        description:     "Premio a tu fidelidad. Eres cliente habitual y lo valoramos.",
        trigger:         "loyal_customer",
      });
    }
  }
}

/**
 * Busca clientes con cumpleaños en los próximos N días y emite cupón
 * si no tienen uno activo. Diseñado para ser invocado por el cron diario.
 */
export async function issueBirthdayCouponsForTenant(
  tenantId: string,
  daysAhead = 7
): Promise<{ issued: number; skipped: number }> {
  if (!isFeatureEnabled("auto-coupon-triggers", tenantId)) {
    return { issued: 0, skipped: 0 };
  }

  const _today = new Date();
  let issued = 0;
  let skipped = 0;

  // Traemos todos los clientes del tenant que tienen birthday seteado
  // TECH-DEBT: Prisma no soporta filtro nativo de "mes+día independiente del año"
  // → traemos con birthday not null y filtramos en memoria.
  const customers = await prisma.customer.findMany({
    where: { tenantId, birthday: { not: null } },
    select: { phone: true, name: true, birthday: true },
  });

  for (const c of customers) {
    if (!c.birthday) continue;
    if (!isBirthdayWindow(c.birthday.toISOString(), daysAhead)) continue;

    const alreadyIssued = await alreadyHasCoupon("CUMPLEANOS", c.phone, tenantId);
    if (alreadyIssued) {
      skipped++;
      continue;
    }

    await issueCoupon({
      prefix:          "CUMPLEANOS",
      discountPercent: 15,
      customerPhone:   c.phone,
      customerName:    c.name,
      tenantId,
      description:     `Feliz cumpleanos ${c.name}. Te regalamos un descuento especial.`,
      trigger:         "birthday",
    });
    issued++;
  }

  return { issued, skipped };
}
