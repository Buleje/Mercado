import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { prisma } from "@/lib/prisma";
import { generateWeeklyReport, renderWhatsAppMessage } from "@/lib/reports/weekly-report";
import { sendWeeklyReportTo } from "@/lib/reports/whatsapp-sender";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/weekly-report
 *
 * Lunes 8:00 AM Lima (13:00 UTC) — Reporte semanal por WhatsApp al dueño
 * de cada bodega activa que tenga ownerPhone configurado.
 *
 * Contenido: top 3 productos, total ventas, delta vs semana anterior,
 * alertas de stock crítico y fiados vencidos.
 *
 * vercel.json schedule: "0 13 * * 1"
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (!isVercelCron && (!secret || !timingSafeCompare(auth, `Bearer ${secret}`))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Fetch active tenants with an owner phone ──────────────────────────────
  const tenants = await prisma.tenant.findMany({
    where: {
      active: true,
      ownerPhone: { not: null },
    },
    select: { id: true, name: true, ownerPhone: true },
  });

  const results = {
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [] as Array<{ tenantId: string; error: string }>,
  };

  for (const tenant of tenants) {
    if (!tenant.ownerPhone) continue;

    try {
      const data = await generateWeeklyReport(tenant.id);
      const message = renderWhatsAppMessage(data, tenant.name);

      // Fire-and-forget: don't await, but capture errors via catch
      sendWeeklyReportTo(tenant.id, tenant.ownerPhone, message).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(
          `[weekly-report] fire-and-forget error tenant ${tenant.id}: ${msg}`
        );
        results.failed++;
        results.errors.push({ tenantId: tenant.id, error: msg });
      });

      results.sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        `[weekly-report] Error generando reporte para tenant ${tenant.id}: ${msg}`
      );
      results.failed++;
      results.errors.push({ tenantId: tenant.id, error: msg });
    }
  }

  logger.info(
    `[weekly-report] Finalizado — enviados: ${results.sent}, fallidos: ${results.failed}, total tenants: ${tenants.length}`
  );

  return NextResponse.json({
    ok: true,
    sent: results.sent,
    failed: results.failed,
    skipped: results.skipped,
    total: tenants.length,
    ...(results.errors.length > 0 && { errors: results.errors }),
  });
}
