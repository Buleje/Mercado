/**
 * GET /api/cron/demand-forecast
 *
 * Cron diario (05:00 UTC) que:
 *   1. Calcula predicciones de demanda para todos los productos activos.
 *   2. Persiste los logs en ForecastLog para medir accuracy histórica.
 *   3. Genera sugerencias de reorden.
 *   4. Si el tenant tiene autoReorder habilitado → crea POs automáticas.
 *   5. Genera sugerencias de ajuste de precio.
 *   6. Notifica al admin con un resumen vía push notification.
 *
 * Auth: Bearer <CRON_SECRET>
 * Vercel cron schedule: "0 5 * * *"
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { predictAllProducts } from "@/lib/forecasting/demand-predictor";
import {
  generateReorderSuggestions,
  createAutoPurchaseOrders,
} from "@/lib/forecasting/auto-reorder";
import { suggestPriceAdjustments } from "@/lib/forecasting/price-optimizer";
import { ForecastingDB } from "@/lib/db/forecasting.db";
import { createNotification } from "@/lib/create-notification";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  // 1. Auth por CRON_SECRET
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    logger.warn("[cron/demand-forecast] Unauthorized — CRON_SECRET inválido");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[cron/demand-forecast] Iniciando ejecución diaria");

  try {
    const result = await withCronRetry("demand-forecast", async () => {
      // Obtener todos los tenants activos
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: {
          id: true,
          slug: true,
          name: true,
        },
      });

      const cronStart = Date.now();
      const summary: {
        tenantId: string;
        tenantName: string;
        predictionsLogged: number;
        reorderSuggestions: number;
        autoPoCreated: number;
        priceSuggestions: number;
        autoReorderEnabled: boolean;
        durationMs: number;
      }[] = [];

      for (const tenant of tenants) {
        const tenantStart = Date.now();
        const tenantId = tenant.slug;

        logger.info("[cron/demand-forecast] Procesando tenant", { tenantId });

        // Leer config de auto-reorder desde Settings (tabla separada de Tenant)
        // TECH-DEBT: Tenant no tiene campo settings directo — consultar Settings si se necesita autoReorder granular
        let autoReorderEnabled = false;
        try {
          const tenantSettings = await prisma.settings.findUnique({
            where: { tenantId: tenant.id },
            select: { featureFlagsJson: true },
          });
          if (tenantSettings?.featureFlagsJson) {
            const flags = JSON.parse(tenantSettings.featureFlagsJson) as Record<string, unknown>;
            autoReorderEnabled = Boolean(flags?.autoReorderEnabled ?? false);
          }
        } catch {
          autoReorderEnabled = false;
        }

        // ── 1. Predicciones de demanda (horizonte: 30 días) ──────────────────
        const predictions = await predictAllProducts(tenantId, 30);

        // ── 2. Persistir en ForecastLog ──────────────────────────────────────
        let predictionsLogged = 0;
        if (predictions.length > 0) {
          const result = await ForecastingDB.createMany(
            predictions.map((p) => ({
              tenantId,
              productId: p.productId,
              predictedQty: p.predictedQuantity,
              confidence: p.confidence,
              trend: p.trend,
              daysAhead: 30,
            })),
          );
          predictionsLogged = result.count;
        }

        // ── 3. Sugerencias de reorden ────────────────────────────────────────
        const reorderSuggestions = await generateReorderSuggestions(tenantId);

        // ── 4. Auto-crear POs si está habilitado ─────────────────────────────
        let autoPoCreated = 0;
        if (autoReorderEnabled && reorderSuggestions.length > 0) {
          const pos = await createAutoPurchaseOrders(tenantId, reorderSuggestions);
          autoPoCreated = pos.length;

          logActivity(
            "cron_auto_reorder",
            "PurchaseOrder",
            `Cron demand-forecast: ${pos.length} PO(s) auto-generadas`,
            undefined,
            "cron",
          ).catch(() => {});
        }

        // ── 5. Sugerencias de precio ─────────────────────────────────────────
        const priceSuggestions = await suggestPriceAdjustments(tenantId);

        // ── 6. Notificar al admin con resumen ────────────────────────────────
        const hasAlerts =
          reorderSuggestions.length > 0 || priceSuggestions.length > 0;

        if (hasAlerts) {
          const parts: string[] = [];
          if (reorderSuggestions.length > 0)
            parts.push(`${reorderSuggestions.length} producto(s) necesitan reorden`);
          if (priceSuggestions.length > 0)
            parts.push(`${priceSuggestions.length} ajuste(s) de precio sugerido(s)`);
          if (autoPoCreated > 0)
            parts.push(`${autoPoCreated} PO(s) creadas automáticamente`);

          createNotification({
            tenantId,
            type: "forecast_daily",
            severity: autoPoCreated > 0 ? "HIGH" : "MEDIUM",
            title: "Resumen diario de forecasting",
            body: parts.join(" · "),
            actionUrl: "/admin?tab=demand-prediction",
            actionLabel: "Ver predicciones",
          }).catch(() => {});
        }

        const tenantDuration = Date.now() - tenantStart;
        logger.info("[cron/demand-forecast] Tenant procesado", {
          tenantId,
          predictionsLogged,
          reorderSuggestions: reorderSuggestions.length,
          autoPoCreated,
          priceSuggestions: priceSuggestions.length,
          durationMs: tenantDuration,
        });

        summary.push({
          tenantId,
          tenantName: tenant.name,
          predictionsLogged,
          reorderSuggestions: reorderSuggestions.length,
          autoPoCreated,
          priceSuggestions: priceSuggestions.length,
          autoReorderEnabled,
          durationMs: tenantDuration,
        });
      }

      // Limpiar logs de forecast con más de 90 días de antigüedad
      for (const tenant of tenants) {
        ForecastingDB.cleanup(tenant.slug, 90).catch(() => {});
      }

      const totalDuration = Date.now() - cronStart;
      logger.info("[cron/demand-forecast] Ejecución completada", {
        tenantsProcessed: tenants.length,
        totalDurationMs: totalDuration,
      });

      return {
        ok: true,
        tenantsProcessed: tenants.length,
        totalDurationMs: totalDuration,
        executedAt: new Date().toISOString(),
        summary,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[cron/demand-forecast] Error fatal", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
