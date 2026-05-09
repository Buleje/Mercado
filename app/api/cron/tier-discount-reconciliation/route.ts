/**
 * GET /api/cron/tier-discount-reconciliation
 *
 * Semanal (lunes 8 AM UTC). Itera todos los tenants activos y detecta
 * orders marketplace donde falló la consulta de tier discount en checkout
 * (tag [TIER_DISCOUNT_FAILED] en notes — inyectado por MarketplaceOrdersDB.createFromCart).
 *
 * Read-only + idempotente: solo identifica orders ya tagueadas, no modifica nada.
 * Reporta a Sentry para que el admin aplique reembolso manual del descuento perdido.
 *
 * Auth: Bearer CRON_SECRET
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MarketplaceOrdersDB } from "@/lib/db/marketplace/orders.db";
import { timingSafeCompare } from "@/lib/timing-safe";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import * as Sentry from "@sentry/nextjs";

interface TenantResult {
  tenantId: string;
  count: number;
  orderIds: string[];
}

export async function GET(req: NextRequest) {
  // --- Auth ---
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();

  try {
    // --- Obtener todos los tenants activos ---
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true, slug: true },
    });

    const byTenant: TenantResult[] = [];
    let totalOrders = 0;
    let tenantsChecked = 0;
    let timedOut = false;

    // Round 7 fix M003: paralelización con concurrencia 8 + timeout budget.
    // Antes: for-await secuencial → 5k tenants × 50ms = 4 min, timeout en Vercel.
    // Ahora: batches de 8 + budget de 50s (Vercel free tier 60s, gen 10s).
    const BATCH_SIZE = 8;
    const TIMEOUT_BUDGET_MS = 50_000;
    const cronStart = Date.now();

    for (let i = 0; i < tenants.length; i += BATCH_SIZE) {
      if (Date.now() - cronStart > TIMEOUT_BUDGET_MS) {
        timedOut = true;
        logger.warn("[cron/tier-discount-reconciliation] timeout budget alcanzado", {
          processed: tenantsChecked,
          remaining: tenants.length - tenantsChecked,
        });
        break;
      }

      const batch = tenants.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (tenant) => {
          try {
            const orders = await MarketplaceOrdersDB.findOrdersWithFailedTierDiscount(tenant.id);
            return { tenant, orders };
          } catch (err) {
            logger.error("[cron/tier-discount-reconciliation] tenant fallo", {
              tenantId: tenant.id,
              err: err instanceof Error ? err.message : String(err),
            });
            return { tenant, orders: [] as Awaited<ReturnType<typeof MarketplaceOrdersDB.findOrdersWithFailedTierDiscount>> };
          }
        }),
      );

      for (const { tenant, orders } of results) {
        tenantsChecked++;
        if (orders.length > 0) {
          byTenant.push({
            tenantId: tenant.id,
            count: orders.length,
            orderIds: orders.map((o) => o.id),
          });
          totalOrders += orders.length;

          Sentry.addBreadcrumb({
            category: "cron.tier-discount-reconciliation",
            message: `Tenant ${tenant.slug}: ${orders.length} order(s) con TIER_DISCOUNT_FAILED`,
            level: "warning",
            data: {
              tenantId: tenant.id,
              tenantSlug: tenant.slug,
              orderIds: orders.map((o) => o.id),
            },
          });
        }
      }
    }

    // --- Sentry alert si hay orders afectadas ---
    if (totalOrders > 0) {
      reportCriticalError(
        new Error(
          `[TIER_DISCOUNT_FAILED] ${totalOrders} order(s) en ${byTenant.length} tenant(s) no recibieron descuento por tier. Revisar y reembolsar manualmente.`,
        ),
        {
          module: "marketplace-tier-discount",
          tags: {
            cron: "tier-discount-reconciliation",
            affected_tenants: String(byTenant.length),
            affected_orders: String(totalOrders),
          },
          extra: { byTenant },
        },
      );
    }

    const summary = {
      tenantsTotal: tenants.length,
      tenantsChecked,
      totalOrders,
      byTenant,
      timedOut,
      checkedAt: startedAt.toISOString(),
    };

    logger.info("[cron/tier-discount-reconciliation]", summary);

    logActivity(
      "cron",
      "tier-discount-reconciliation",
      `Reconciliación: ${tenantsChecked}/${tenants.length} tenants, ${totalOrders} orders con TIER_DISCOUNT_FAILED${timedOut ? " (timeout)" : ""}`,
      undefined,
      "cron",
    ).catch((err) => {
      logger.error("[cron/tier-discount-reconciliation] logActivity failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/tier-discount-reconciliation] Error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
