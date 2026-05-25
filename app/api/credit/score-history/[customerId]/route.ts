/**
 * GET /api/credit/score-history/[customerId]
 *
 * Fiado Digital Phase 1 — Credit score history timeline.
 *
 * Returns the append-only CreditScoreHistory snapshots for a customer,
 * ordered by date. Admin-facing (requireAdmin with admin/cajero roles).
 *
 * When Phase 1 flag is off, returns 404 silently (prevents leaking
 * endpoint existence pre-launch).
 *
 * ADR-021 §3: immutable timeline, tenant-isolated.
 * ADR-019: no segment config, runtime auto-detects dynamic via cookies.
 * CLAUDE.md §3: tenantId as first WHERE filter.
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { isFiadoDigitalPhase1Enabled } from "@/lib/feature-flags/fiado-digital";
import { prisma } from "@/lib/prisma";
import { calculateCreditScore } from "@/lib/credit/scoring-engine";
import { toNumOrZero } from "@/lib/decimal-utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
    const auth = await requireAdmin(req, ["admin", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const { customerId } = await params;

    // Feature flag gate
    if (!isFiadoDigitalPhase1Enabled()) {
      logger.info("[credit/score-history] Phase 1 disabled — 404", {
        customerId,
        tenantId: auth.tenantId,
      });
      return NextResponse.json(
        { error: "Fiado Digital Phase 1 no habilitado" },
        { status: 404 },
      );
    }

    // Fetch history snapshots (last 50, newest first)
    const history = await prisma.creditScoreHistory.findMany({
      where: { tenantId: auth.tenantId, customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        score: true,
        creditLimit: true,
        riskLevel: true,
        breakdownPurchaseHistory: true,
        breakdownPaymentPunctuality: true,
        breakdownAvgTicket: true,
        breakdownSeniority: true,
        breakdownLoyaltyPoints: true,
        trigger: true,
        createdAt: true,
      },
    });

    // Calculate current live score for comparison
    const currentScore = await calculateCreditScore(auth.tenantId, customerId);

    // Fetch current profile limits
    const profile = await prisma.creditProfile.findUnique({
      where: {
        tenantId_customerId: { tenantId: auth.tenantId, customerId },
      },
      select: {
        creditLimit: true,
        usedCredit: true,
        availableCredit: true,
        riskLevel: true,
        lastScoreUpdate: true,
      },
    });

    return NextResponse.json({
      customerId,
      currentScore: currentScore.score,
      currentLimit: currentScore.creditLimit,
      currentRiskLevel: currentScore.riskLevel,
      breakdown: currentScore.breakdown,
      profile: profile
        ? {
            creditLimit: toNumOrZero(profile.creditLimit),
            usedCredit: toNumOrZero(profile.usedCredit),
            availableCredit: toNumOrZero(profile.availableCredit),
            riskLevel: profile.riskLevel,
            lastScoreUpdate: profile.lastScoreUpdate.toISOString(),
          }
        : null,
      history: history.map((h) => ({
        id: h.id,
        score: h.score,
        creditLimit: toNumOrZero(h.creditLimit),
        riskLevel: h.riskLevel,
        breakdown: {
          purchaseHistory: h.breakdownPurchaseHistory,
          paymentPunctuality: h.breakdownPaymentPunctuality,
          avgTicket: h.breakdownAvgTicket,
          seniority: h.breakdownSeniority,
          loyaltyPoints: h.breakdownLoyaltyPoints,
        },
        trigger: h.trigger,
        date: h.createdAt.toISOString(),
      })),
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
