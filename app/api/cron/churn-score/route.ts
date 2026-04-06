export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { logger } from "@/lib/logger";
import {
  calculateHealthScore,
  detectSignals,
  saveHealthScore,
  getPreviousScore,
} from "@/lib/churn/health-scorer";
import { executePlaybook } from "@/lib/churn/intervention-engine";

/**
 * GET /api/cron/churn-score
 *
 * Cron job diario — Auth: Authorization: Bearer <CRON_SECRET>
 * Recorre todos los tenants activos, calcula health score, detecta signals
 * y ejecuta playbooks automáticos. Cada tenant es fire-and-forget.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("churn-score", async () => {
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: {
          id: true,
          slug: true,
          name: true,
          ownerEmail: true,
          ownerPhone: true,
          plan: true,
          trialEndsAt: true,
        },
      });

      if (tenants.length === 0) {
        return { ok: true, processed: 0, message: "Sin tenants activos" };
      }

      let processed = 0;
      let errors = 0;
      const riskSummary: Record<string, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };

      // Fire-and-forget por tenant: si uno falla no bloquea los demás
      await Promise.allSettled(
        tenants.map(async (tenant) => {
          try {
            // 1. Score previo para comparar cambios
            const previousScore = await getPreviousScore(tenant.id);

            // 2. Calcular score actual
            const currentScore = await calculateHealthScore(tenant.slug);

            // 3. Persistir score
            await saveHealthScore(currentScore);

            // 4. Detectar signals
            const signals = await detectSignals(tenant.slug, currentScore, previousScore);

            // 5. Ejecutar playbooks para cada signal (fire-and-forget por signal)
            for (const signal of signals) {
              executePlaybook(signal, {
                id: tenant.id,
                slug: tenant.slug,
                name: tenant.name,
                ownerEmail: tenant.ownerEmail ?? null,
                ownerPhone: tenant.ownerPhone ?? null,
                plan: tenant.plan,
                trialEndsAt: tenant.trialEndsAt ?? null,
              }).catch((err) => {
                logger.warn("[cron/churn-score] Error en playbook (ignorado)", {
                  slug: tenant.slug,
                  signalType: signal.signalType,
                  error: err instanceof Error ? err.message : String(err),
                });
              });
            }

            riskSummary[currentScore.riskLevel] = (riskSummary[currentScore.riskLevel] ?? 0) + 1;
            processed++;
          } catch (err) {
            errors++;
            logger.warn("[cron/churn-score] Error procesando tenant", {
              slug: tenant.slug,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        })
      );

      logger.info("[cron/churn-score] Ciclo completado", {
        processed,
        errors,
        riskSummary,
      });

      return {
        ok: true,
        processed,
        errors,
        total: tenants.length,
        riskSummary,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error("[cron/churn-score] Error fatal", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Error interno del cron job" },
      { status: 500 }
    );
  }
}
