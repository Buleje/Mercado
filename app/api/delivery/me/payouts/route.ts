import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePartner } from "@/lib/delivery/partner-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { PartnerPayoutsDB } from "@/lib/db/partner-payouts.db";
import { payoutRequestSchema } from "@/lib/delivery/payout";

/**
 * GET  /api/delivery/me/payouts → saldo + historial de retiros del partner.
 * POST /api/delivery/me/payouts → solicita un retiro a Yape.
 *
 * Dinero (zona de peligro): el saldo disponible se calcula SIEMPRE en backend
 * (PartnerPayoutsDB) y el retiro se crea dentro de una transacción
 * serializable. El cliente nunca decide cuánto hay disponible.
 *
 * Sin `"use cache"`: requirePartner(req) lee cookies y el saldo debe ser
 * fresco (mismo criterio que /api/delivery/me/earnings).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requirePartner(req);
    if (session instanceof NextResponse) return session;

    const [balance, history] = await Promise.all([
      PartnerPayoutsDB.getBalance(session.tenantId, session.partnerId),
      PartnerPayoutsDB.listForPartner(session.tenantId, session.partnerId),
    ]);

    return NextResponse.json({ balance, history });
  } catch (e) {
    logger.error("[GET /delivery/me/payouts] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "STRICT", "delivery-payout");
  if (rl) return rl;

  try {
    const session = await requirePartner(req);
    if (session instanceof NextResponse) return session;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const parsed = payoutRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    const result = await PartnerPayoutsDB.requestPayout(
      session.tenantId,
      session.partnerId,
      parsed.data,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json(
      { payout: result.payout, balance: result.balance },
      { status: 201 },
    );
  } catch (e) {
    logger.error("[POST /delivery/me/payouts] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
