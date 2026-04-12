/**
 * GET /api/me/credit-score
 *
 * Fiado Digital Phase 1 — Customer-facing credit score endpoint.
 * Returns the authenticated customer's own score, breakdown, history,
 * and personalized tips to improve their score.
 *
 * Auth: requireCustomer (customer session cookie).
 * ADR-021 §3: tenant-isolated, read-only for customers.
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { calculateCreditScore } from "@/lib/credit/scoring-engine";
import { getAvailableCredit } from "@/lib/credit/installment-manager";
import { prisma } from "@/lib/prisma";
import { isFiadoDigitalPhase1Enabled } from "@/lib/feature-flags/fiado-digital";
import { toNumOrZero } from "@/lib/decimal-utils";

export async function GET(req: NextRequest) {
  if (!isFiadoDigitalPhase1Enabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { tenantId, customerId } = customer;

  if (!customerId) {
    return NextResponse.json(
      { error: "Tu cuenta aún no está vinculada a un perfil de cliente" },
      { status: 400 },
    );
  }

  // Calculate current score with full breakdown
  const scoreResult = await calculateCreditScore(tenantId, customerId);
  const creditInfo = await getAvailableCredit(tenantId, customerId);

  // Fetch last 12 score history snapshots for mini-chart
  const history = await prisma.creditScoreHistory
    .findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        score: true,
        creditLimit: true,
        riskLevel: true,
        trigger: true,
        createdAt: true,
      },
    })
    .catch(() => [] as never[]);

  // Calculate delta vs previous snapshot
  const previousScore = history.length > 1 ? history[1].score : null;
  const delta = previousScore !== null ? scoreResult.score - previousScore : null;

  // Generate personalized tips based on weakest factors
  const tips = generateTips(scoreResult.breakdown);

  // Next review date: next Sunday at midnight (weekly recalc runs Sundays)
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + (7 - nextReview.getDay()));
  nextReview.setHours(0, 0, 0, 0);

  // Build reason string for transparency banner
  let reason = "Tu score se revisa cada semana automáticamente.";
  if (delta !== null) {
    if (delta > 0) reason = `Subió ${delta} puntos desde la última revisión.`;
    else if (delta < 0) reason = `Bajó ${Math.abs(delta)} puntos desde la última revisión.`;
    else reason = "Tu score se mantuvo igual desde la última revisión.";
  }

  return NextResponse.json({
    score: scoreResult.score,
    creditLimit: scoreResult.creditLimit,
    riskLevel: scoreResult.riskLevel,
    breakdown: scoreResult.breakdown,
    credit: {
      limit: creditInfo.creditLimit,
      used: creditInfo.usedCredit,
      available: creditInfo.availableCredit,
      isActive: creditInfo.isActive,
    },
    delta,
    reason,
    nextReviewDate: nextReview.toISOString(),
    tips,
    history: history.reverse().map((h) => ({
      score: h.score,
      creditLimit: toNumOrZero(h.creditLimit),
      riskLevel: h.riskLevel,
      trigger: h.trigger,
      date: h.createdAt.toISOString(),
    })),
  });
}

/** Generate 2-3 actionable tips based on weakest score factors */
function generateTips(breakdown: Record<string, number>): string[] {
  const tips: string[] = [];
  const entries = Object.entries(breakdown).sort((a, b) => a[1] - b[1]);

  for (const [factor, score] of entries) {
    if (tips.length >= 3) break;
    if (score >= 700) continue; // already strong

    switch (factor) {
      case "purchaseHistory":
        tips.push(
          score < 300
            ? "Compra con más frecuencia para construir tu historial."
            : "Mantén tus compras regulares para seguir subiendo.",
        );
        break;
      case "paymentPunctuality":
        tips.push(
          score < 300
            ? "Paga tus fiados a tiempo — es lo que más pesa en tu score."
            : "Sigue pagando puntual, ya vas bien.",
        );
        break;
      case "avgTicket":
        tips.push("Compras más grandes suben tu score gradualmente.");
        break;
      case "seniority":
        tips.push("Tu antigüedad como cliente sube automáticamente con el tiempo.");
        break;
      case "loyaltyPoints":
        tips.push("Acumula puntos de lealtad comprando seguido.");
        break;
    }
  }

  if (tips.length === 0) {
    tips.push("Excelente! Mantén tus hábitos actuales para conservar tu score alto.");
  }

  return tips;
}
