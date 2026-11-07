/**
 * GET /api/me/referral-status
 *
 * Customer referral program status — shows:
 * - My referral code
 * - How many people used it
 * - Total rewards earned
 * - List of referrals with status
 *
 * Auth: requireCustomer
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { anonymousGate } from "@/lib/auth/anonymous-gate";
import { MeReferralStatusDB } from "@/lib/db/me-referral-status.db";
import { ReferralsDB } from "@/lib/db/referrals.db";
import { mensajeInvitacion, PUNTOS_POR_REFERIDA_SIN_CONFIG, resumenDelPrograma } from "@/lib/referidas/reglas";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

// Next 16 con cacheComponents: force-dynamic es redundante.

export async function GET(req: NextRequest) {
  const anon = anonymousGate(req);
  if (anon) return anon;
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { tenantId, customerId: customerPhone } = customer;

  if (!customerPhone) {
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

  try {
    // Audit project-wide 2026-05-19: migrado a MeReferralStatusDB.
    const me = await MeReferralStatusDB.getSelf(tenantId, customerPhone);

    if (!me?.referralCode) {
      return NextResponse.json({
        hasReferralCode: false,
        referralCode: null,
        referrals: [],
        totalReferred: 0,
        shareUrl: null,
      });
    }

    // Find all customers who used my referral code
    const referrals = await MeReferralStatusDB.getReferredCustomers(tenantId, customerPhone, 20);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
    const shareUrl = `${baseUrl}/registro?ref=${me.referralCode}`;

    // Programa del negocio (ADR-510). Sin config: los 50 puntos que da
    // CustomersDB.applyReferralCode (acá decía 10, y no era lo que se daba).
    const { config, guardada, negocio } = await ReferralsDB.config(tenantId);
    const totalPointsEarned = guardada ? 0 : referrals.length * PUNTOS_POR_REFERIDA_SIN_CONFIG;
    const premios = guardada ? (await ReferralsDB.deQuienRefiere(tenantId, customerPhone)).cupones : [];

    return NextResponse.json({
      hasReferralCode: true,
      referralCode: me.referralCode,
      shareUrl,
      shareMessage: guardada
        ? `${mensajeInvitacion(config, me.referralCode, negocio)} ${shareUrl}`
        : `Usa mi codigo ${me.referralCode} en Buleje y ambos ganamos puntos! ${shareUrl}`,
      ...(guardada ? { programa: resumenDelPrograma(config), premios } : {}),
      totalReferred: referrals.length,
      totalPointsEarned,
      currentPoints: me.loyaltyPoints,
      referrals: referrals.map((r) => ({
        name: r.name,
        joinedAt: r.createdAt,
        totalSpent: toNumOrZero(r.totalSpent),
        isActive: toNumOrZero(r.totalSpent) > 0,
      })),
    });
  } catch (err) {
    logger.error("[me/referral-status] Error", { tenantId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
