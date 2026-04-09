/**
 * GET /api/stripe-connect/status
 * Verifica el estado de la cuenta Stripe Connect del tenant:
 * si el onboarding está completo, si puede cobrar y si puede recibir payouts.
 * También retorna el balance disponible de la cuenta conectada.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getConnectedAccountStatus, getConnectedAccountBalance } from "@/lib/stripe-connect";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();

  try {
    // Buscar el accountId guardado para este tenant
    const record = await prisma.activityLog.findFirst({
      where: { tenantId: auth.tenantId, action: "stripe_connect_account" },
      orderBy: { createdAt: "desc" },
      select: { entityId: true },
    });

    if (!record?.entityId) {
      throw new NotFoundError("Cuenta Stripe Connect");
    }

    const accountId = record.entityId;

    logger.info("[StripeConnect] Consultando estado", {
      tenantId: auth.tenantId,
      accountId,
    });

    const [statusInfo, balance] = await Promise.all([
      getConnectedAccountStatus(accountId),
      getConnectedAccountBalance(accountId),
    ]);

    // Extrae el balance disponible en PEN (o la primera moneda disponible)
    const penBalance = balance.available.find((b) => b.currency === "pen");
    const pendingBalance = balance.pending.find((b) => b.currency === "pen");

    return NextResponse.json({
      accountId,
      isActive: statusInfo.isActive,
      chargesEnabled: statusInfo.chargesEnabled,
      payoutsEnabled: statusInfo.payoutsEnabled,
      detailsSubmitted: statusInfo.detailsSubmitted,
      balance: {
        available: penBalance ? penBalance.amount / 100 : 0,
        pending: pendingBalance ? pendingBalance.amount / 100 : 0,
        currency: "PEN",
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
