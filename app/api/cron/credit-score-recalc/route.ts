/**
 * GET /api/cron/credit-score-recalc
 *
 * Fiado Digital Phase 2 — Weekly credit score recalculation.
 *
 * Runs every Sunday at midnight. Recalculates ALL active CreditProfiles
 * and snapshots each one to CreditScoreHistory for transparency timeline.
 *
 * Also detects significant score changes (≥50 points) and creates
 * notifications for the admin to review.
 *
 * Auth: Bearer CRON_SECRET
 * ADR-021 §3: immutable snapshots, tenant-isolated.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import {
  updateCreditProfile,
  snapshotCreditScore,
} from "@/lib/credit/scoring-engine";
import { checkOverdue } from "@/lib/credit/installment-manager";
import { createNotification } from "@/lib/create-notification";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { isFiadoDigitalPhase2Enabled } from "@/lib/feature-flags/fiado-digital";

const SIGNIFICANT_CHANGE_THRESHOLD = 50; // points

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isFiadoDigitalPhase2Enabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "FIADO_DIGITAL_V2_PHASE2 not enabled",
    });
  }

  try {
    const now = new Date();

    // 1. Get all active credit profiles across all tenants
    const profiles = await prisma.creditProfile.findMany({
      where: { isActive: true },
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        creditScore: true,
      },
    });

    let recalculated = 0;
    let snapshots = 0;
    let significantChanges = 0;
    let overdueUpdated = 0;

    // Group by tenant for overdue checks
    const tenantIds = [...new Set(profiles.map((p) => p.tenantId))];

    // 2. Check overdue installments per tenant
    for (const tenantId of tenantIds) {
      const updated = await checkOverdue(tenantId);
      overdueUpdated += updated;
    }

    // 3. Recalculate each profile and snapshot
    for (const profile of profiles) {
      const previousScore = profile.creditScore;

      // Recalculate and persist profile
      await updateCreditProfile(profile.tenantId, profile.customerId);
      recalculated++;

      // Snapshot to history
      const result = await snapshotCreditScore(
        profile.tenantId,
        profile.customerId,
        "weekly_recalc",
      );

      if (result) {
        snapshots++;

        // Detect significant changes
        const delta = result.score - previousScore;
        if (Math.abs(delta) >= SIGNIFICANT_CHANGE_THRESHOLD) {
          significantChanges++;

          const direction = delta > 0 ? "subió" : "bajó";
          const emoji = delta > 0 ? "📈" : "📉";

          await createNotification({
            tenantId: profile.tenantId,
            type: "CREDIT_SCORE_CHANGE",
            severity: delta < -100 ? "HIGH" : "MEDIUM",
            title: `${emoji} Score ${direction} ${Math.abs(delta)} pts — Cliente ${profile.customerId}`,
            body: `El score de crédito pasó de ${previousScore} a ${result.score} (${delta > 0 ? "+" : ""}${delta}). Revisar perfil del cliente.`,
            entityId: `score-change-${profile.id}-${now.toISOString().split("T")[0]}`,
          });
        }
      }
    }

    logActivity(
      "cron",
      "credit",
      `Score-recalc: ${recalculated} profiles, ${snapshots} snapshots, ${significantChanges} significant changes, ${overdueUpdated} overdue updates`,
      undefined,
      "cron",
    ).catch((err) => logger.warn("[cron] activity log failed", { error: String(err) }));

    logger.info("[cron/credit-score-recalc]", {
      profiles: profiles.length,
      recalculated,
      snapshots,
      significantChanges,
      overdueUpdated,
    });

    return NextResponse.json({
      ok: true,
      profiles: profiles.length,
      recalculated,
      snapshots,
      significantChanges,
      overdueUpdated,
      processedAt: now.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/credit-score-recalc] Error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
