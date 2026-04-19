import "server-only";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { LoyaltyDB } from "@/lib/db/loyalty.db";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

// ── Config ──────────────────────────────────────────────────────────────────

/** Points both referrer and referee earn */
const REFERRAL_POINTS = 50;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generates a unique 6-char referral code for a customer.
 * Format: REF + last 3 digits of phone + 3 random alphanum chars
 */
export function generateReferralCode(phone: string): string {
  const phoneSuffix = phone.replace(/\D/g, "").slice(-3);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing O/0/I/1
  const buf = randomBytes(3);
  const random = Array.from(buf).map((b) => chars[b % chars.length]).join("");
  return `REF${phoneSuffix}${random}`;
}

// ── Main ────────────────────────────────────────────────────────────────────

export interface ReferralResult {
  success: boolean;
  referrerPoints?: number;
  refereePoints?: number;
  error?: string;
}

/**
 * Process a referral: credit both the referrer and the referee with bonus points.
 *
 * Anti-duplication:
 *  - A customer can only use a referral code once (referredBy field)
 *  - A customer cannot refer themselves
 *  - Only processes if the referee hasn't been referred before
 *
 * @param tenantId      - Tenant (first param per CLAUDE.md rule #3)
 * @param refereePhone  - Phone of the new customer who was referred
 * @param referralCode  - The referrer's unique code
 */
export async function processReferral(
  tenantId: string,
  refereePhone: string,
  referralCode: string,
): Promise<ReferralResult> {
  try {
    // 1. Find referrer by code
    const referrer = await prisma.customer.findFirst({
      where: {
        referralCode: referralCode.toUpperCase(),
        tenantId,
      },
      select: { phone: true, name: true },
    });

    if (!referrer) {
      return { success: false, error: "Código de referido no válido" };
    }

    // 2. Cannot refer yourself
    if (referrer.phone === refereePhone) {
      return { success: false, error: "No puedes usar tu propio código de referido" };
    }

    // 3. Check referee hasn't already been referred
    const referee = await prisma.customer.findUnique({
      where: { phone: refereePhone },
      select: { referredBy: true, name: true },
    });

    if (!referee) {
      return { success: false, error: "Cliente no encontrado" };
    }

    if (referee.referredBy) {
      return { success: false, error: "Ya usaste un código de referido anteriormente" };
    }

    // 4. Mark referee as referred
    await prisma.customer.update({
      where: { phone: refereePhone },
      data: { referredBy: referralCode.toUpperCase() },
    });

    // 5. Credit points to both
    await LoyaltyDB.earn(
      tenantId,
      referrer.phone,
      REFERRAL_POINTS,
      "referral",
      {
        type: "referrer",
        refereePhone: refereePhone.slice(-4),
        refereeName: referee.name,
      },
    );

    await LoyaltyDB.earn(
      tenantId,
      refereePhone,
      REFERRAL_POINTS,
      "referral",
      {
        type: "referee",
        referrerPhone: referrer.phone.slice(-4),
        referrerName: referrer.name,
        referralCode,
      },
    );

    // 6. Notify both via WhatsApp — fire-and-forget
    sendWhatsAppQueued(
      referrer.phone,
      `🎉 *¡Alguien usó tu código de referido!*\n\n` +
      `Tu amigo/a se registró con tu código y ambos ganaron *${REFERRAL_POINTS} puntos* 🏆\n\n` +
      `Tu saldo se actualizó automáticamente. ¡Sigue invitando amigos para ganar más puntos!`,
      { tenantId, context: "referral-referrer-notify" },
    ).catch(() => {});

    sendWhatsAppQueued(
      refereePhone,
      `🎁 *¡Bienvenido/a!*\n\n` +
      `Usaste el código de ${referrer.name} y ganaste *${REFERRAL_POINTS} puntos* de regalo 🎉\n\n` +
      `Recuerda: 50 puntos = S/1 de descuento en tu próxima compra.`,
      { tenantId, context: "referral-referee-notify" },
    ).catch(() => {});

    // 7. Log activity — fire-and-forget
    logActivity(
      "loyalty_referral",
      "Customer",
      `Referido procesado: ${referrer.phone.slice(-4)} → ${refereePhone.slice(-4)} (+${REFERRAL_POINTS} pts cada uno)`,
      refereePhone,
      "system",
      undefined,
      tenantId,
    ).catch(() => {});

    logger.info("[referral] Procesado", {
      tenantId,
      referrerPhone: referrer.phone.slice(-4),
      refereePhone: refereePhone.slice(-4),
      points: REFERRAL_POINTS,
    });

    return {
      success: true,
      referrerPoints: REFERRAL_POINTS,
      refereePoints: REFERRAL_POINTS,
    };
  } catch (err) {
    logger.error("[referral] Error", {
      tenantId,
      refereePhone: refereePhone.slice(-4),
      referralCode,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: "Error procesando el referido" };
  }
}

/**
 * Generate and assign a referral code to a customer who doesn't have one yet.
 * Returns the existing code if they already have one.
 */
export async function ensureReferralCode(
  tenantId: string,
  customerPhone: string,
): Promise<string> {
  const customer = await prisma.customer.findUnique({
    where: { phone: customerPhone },
    select: { referralCode: true },
  });

  if (customer?.referralCode) {
    return customer.referralCode;
  }

  // Generate unique code with retries (unique constraint may fail)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode(customerPhone);
    try {
      await prisma.customer.update({
        where: { phone: customerPhone },
        data: { referralCode: code },
      });
      return code;
    } catch {
      // Likely unique constraint violation — retry with different code
      continue;
    }
  }

  throw new Error("No se pudo generar código de referido único");
}
