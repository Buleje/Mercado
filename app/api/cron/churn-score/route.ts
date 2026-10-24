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
import { registrarSenales } from "@/lib/churn/registrar-senales";
import { fueAccionReal } from "@/lib/churn/intervencion";

/**
 * GET /api/cron/churn-score
 *
 * Cron job diario — Auth: Authorization: Bearer <CRON_SECRET>
 * Recorre todos los tenants activos, calcula health score, detecta signals,
 * GUARDA las alertas (siempre) y, sólo con CHURN_AUTORUN=true, ejecuta la regla
 * (correo/WhatsApp). Un tenant que falla no frena a los demás.
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

      // Feature flag: CHURN_AUTORUN controla sólo la ACCIÓN (correo/WhatsApp/etc).
      // Score y alertas se guardan siempre: en dry-run el superadmin igual ve a
      // quién le tocaría. Default: dry-run.
      // Para activar en producción: CHURN_AUTORUN=true en Vercel env.
      const churnAutorun = (process.env.CHURN_AUTORUN ?? "").toLowerCase() === "true";

      let processed = 0;
      let errors = 0;
      let playbookExecutions = 0;
      let playbookDryRuns = 0;
      let senalesNuevas = 0;
      let senalesCerradas = 0;
      const acciones: Promise<void>[] = [];
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

            // 5. Guardar las alertas SIEMPRE (una abierta por tipo) y cerrar
            //    las que ya no aplican si el negocio salió del riesgo alto.
            const { alertas, cerradas } = await registrarSenales(tenant.id, signals, currentScore.riskLevel);
            senalesNuevas += alertas.filter((a) => a.creada).length;
            senalesCerradas += cerradas;

            // 6. La acción (correo/WhatsApp) sólo con CHURN_AUTORUN y una vez por alerta.
            for (const alerta of alertas) {
              if (fueAccionReal(alerta.intervention)) continue;
              if (!churnAutorun) {
                playbookDryRuns++;
                logger.info("[cron/churn-score] Dry-run (CHURN_AUTORUN=false): alerta guardada, sin acción", {
                  slug: tenant.slug,
                  signalType: alerta.signal.signalType,
                  severity: alerta.signal.severity,
                });
                continue;
              }
              playbookExecutions++;
              acciones.push(
                executePlaybook(
                  alerta.signal,
                  {
                    id: tenant.id,
                    slug: tenant.slug,
                    name: tenant.name,
                    ownerEmail: tenant.ownerEmail ?? null,
                    ownerPhone: tenant.ownerPhone ?? null,
                    plan: tenant.plan,
                    trialEndsAt: tenant.trialEndsAt ?? null,
                  },
                  alerta,
                ).catch((err) => {
                  logger.warn("[cron/churn-score] Error en playbook (ignorado)", {
                    slug: tenant.slug,
                    signalType: alerta.signal.signalType,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }),
              );
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

      // Esperar las acciones antes de responder: en serverless lo que queda
      // colgado después del return puede no correr nunca.
      await Promise.allSettled(acciones);

      logger.info("[cron/churn-score] Ciclo completado", {
        processed,
        senalesNuevas,
        senalesCerradas,
        errors,
        riskSummary,
        churnAutorun,
        playbookExecutions,
        playbookDryRuns,
      });

      return {
        ok: true,
        processed,
        errors,
        total: tenants.length,
        riskSummary,
        churnAutorun,
        playbookExecutions,
        playbookDryRuns,
        senalesNuevas,
        senalesCerradas,
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
