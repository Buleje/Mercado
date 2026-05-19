/**
 * GET /api/cron/birthday-coupons
 *
 * Cron diario (ejecutar vía Vercel Cron o cron externo).
 * Recorre todos los tenants activos y emite cupones CUMPLEANOS (15% descuento)
 * a los clientes que cumplan años en los próximos 7 días.
 *
 * Diferencias con /api/cron/birthday-greetings (cron anterior):
 *  - Usa el módulo `lib/coupons/auto-coupon-triggers` (con idempotencia real)
 *  - Descuento correcto: 15% (no 10%)
 *  - Multi-tenant: recorre TODOS los tenants activos
 *  - Envía WhatsApp directo al cliente (no solo un link wa.me)
 *
 * Autorización: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { issueBirthdayCouponsForTenant } from "@/lib/coupons/auto-coupon-triggers";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parámetro opcional: días de anticipación (default 7) ─────────────────
  const url = new URL(req.url);
  const daysAhead = Math.min(
    Math.max(parseInt(url.searchParams.get("days") ?? "7", 10), 1),
    30
  );

  const startedAt = new Date().toISOString();
  let totalIssued = 0;
  let totalSkipped = 0;
  const tenantResults: Array<{ tenantId: string; slug: string; issued: number; skipped: number }> = [];

  try {
    // ── Recorrer todos los tenants activos ───────────────────────────────────
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true, slug: true },
    });

    for (const tenant of tenants) {
      try {
        const result = await issueBirthdayCouponsForTenant(tenant.id, daysAhead);
        totalIssued += result.issued;
        totalSkipped += result.skipped;
        tenantResults.push({ tenantId: tenant.id, slug: tenant.slug, ...result });

        if (result.issued > 0) {
          logActivity(
            "cron",
            "coupon",
            `Birthday-coupons: ${result.issued} cupones emitidos para tenant ${tenant.slug}`,
            undefined,
            "cron",
          ).catch((err) =>
            logger.warn("[cron/birthday-coupons] activity log failed", { error: String(err) }),
          );
        }
      } catch (err) {
        logger.error("[cron/birthday-coupons] Error en tenant", {
          tenantId: tenant.id,
          slug: tenant.slug,
          error: String(err),
        });
        tenantResults.push({ tenantId: tenant.id, slug: tenant.slug, issued: 0, skipped: 0 });
      }
    }

    logger.info("[cron/birthday-coupons] Completado", {
      tenantsProcessed: tenants.length,
      totalIssued,
      totalSkipped,
      daysAhead,
    });

    return NextResponse.json({
      ok: true,
      startedAt,
      completedAt: new Date().toISOString(),
      daysAhead,
      tenantsProcessed: tenants.length,
      totalIssued,
      totalSkipped,
      tenants: tenantResults,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/birthday-coupons] Error fatal", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
