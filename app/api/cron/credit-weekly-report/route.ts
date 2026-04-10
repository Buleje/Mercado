/**
 * GET /api/cron/credit-weekly-report
 *
 * Fiado Digital Phase 2 — Weekly credit report for bodega owners.
 *
 * Runs every Monday at 8am. Sends a WhatsApp-formatted summary to each
 * tenant's admin with:
 *   - Total pending fiados amount
 *   - Collected this week
 *   - Overdue count + amount
 *   - Top 5 debtors
 *   - Score changes (significant moves ≥50 points)
 *   - Actionable recommendation
 *
 * Auth: Bearer CRON_SECRET
 * ADR-021 §4: per-tenant isolation, fire-and-forget notification.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { createNotification } from "@/lib/create-notification";
import { queue } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { isFiadoDigitalPhase2Enabled } from "@/lib/feature-flags/fiado-digital";
import { toNumOrZero } from "@/lib/decimal-utils";

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
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get all active tenants
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true, slug: true, name: true, ownerPhone: true },
    });

    let reportsGenerated = 0;

    for (const tenant of tenants) {
      const tenantId = tenant.id;

      // 1. Pending fiados (ACTIVO)
      const pendingFiados = await prisma.fiado.findMany({
        where: { tenantId, status: "ACTIVO" },
        select: { saldo: true },
      });
      const totalPending = pendingFiados.reduce(
        (sum, f) => sum + toNumOrZero(f.saldo),
        0,
      );

      // 2. Overdue fiados
      const overdueFiados = await prisma.fiado.findMany({
        where: {
          tenantId,
          status: { in: ["ACTIVO", "VENCIDO"] },
          fechaVence: { lt: now },
        },
        select: { saldo: true },
      });
      const overdueCount = overdueFiados.length;
      const overdueAmount = overdueFiados.reduce(
        (sum, f) => sum + toNumOrZero(f.saldo),
        0,
      );

      // 3. Collected this week (cuotas pagadas)
      const weekPayments = await prisma.fiadoCuota.findMany({
        where: {
          fiado: { tenantId },
          pagadoEn: { gte: oneWeekAgo },
        },
        select: { monto: true },
      });
      const collectedThisWeek = weekPayments.reduce(
        (sum, c) => sum + toNumOrZero(c.monto),
        0,
      );

      // 4. Top 5 debtors
      const topDebtors = await prisma.fiado.groupBy({
        by: ["customerId"],
        where: { tenantId, status: { in: ["ACTIVO", "VENCIDO"] } },
        _sum: { saldo: true },
        orderBy: { _sum: { saldo: "desc" } },
        take: 5,
      });

      // Fetch customer names for top debtors
      const customerIds = topDebtors.map((d) => d.customerId);
      const customers = await prisma.customer.findMany({
        where: { phone: { in: customerIds }, tenantId },
        select: { phone: true, name: true },
      });
      const nameMap = new Map(customers.map((c) => [c.phone, c.name]));

      // 5. Build report
      const fmt = (n: number) => `S/${n.toFixed(2)}`;

      const debtorLines = topDebtors
        .slice(0, 5)
        .map((d, i) => {
          const name = nameMap.get(d.customerId) ?? d.customerId;
          return `  ${i + 1}. ${name}: ${fmt(toNumOrZero(d._sum.saldo))}`;
        })
        .join("\n");

      // Generate recommendation
      let recommendation = "";
      if (overdueCount > 0 && overdueAmount > totalPending * 0.5) {
        recommendation =
          "⚠️ Más de la mitad de tus fiados están vencidos. Considera llamar a los deudores principales.";
      } else if (collectedThisWeek > totalPending * 0.3) {
        recommendation =
          "✅ Buena semana de cobros! Mantén el seguimiento con los pendientes restantes.";
      } else if (totalPending === 0) {
        recommendation =
          "🎉 No tienes fiados pendientes! Tu cartera está al día.";
      } else {
        recommendation =
          "📋 Revisa los recordatorios automáticos y haz seguimiento manual a los montos mayores.";
      }

      const report = [
        `📊 *Reporte Semanal de Crédito*`,
        `${tenant.name ?? tenant.slug}`,
        ``,
        `💰 Pendiente total: ${fmt(totalPending)}`,
        `✅ Cobrado esta semana: ${fmt(collectedThisWeek)}`,
        `⏰ Vencidos: ${overdueCount} fiados (${fmt(overdueAmount)})`,
        ``,
        `📋 *Top deudores:*`,
        debtorLines || "  (sin deudores)",
        ``,
        recommendation,
        ``,
        `_Reporte automático — Fiado Digital_`,
      ].join("\n");

      // Create notification for admin dashboard
      await createNotification({
        tenantId,
        type: "CREDIT_WEEKLY_REPORT",
        severity: overdueAmount > totalPending * 0.5 ? "HIGH" : "LOW",
        title: `Reporte semanal: ${fmt(totalPending)} pendiente`,
        body: report,
        entityId: `weekly-${now.toISOString().split("T")[0]}`,
      });

      // Send WhatsApp to owner directly via queue
      if (tenant.ownerPhone) {
        queue
          .enqueue("send-whatsapp", {
            tenantId,
            phone: tenant.ownerPhone,
            message: report,
          })
          .catch(() => {});
      }

      reportsGenerated++;
    }

    logActivity(
      "cron",
      "credit",
      `Credit-weekly-report: ${reportsGenerated} reports generated for ${tenants.length} tenants`,
      undefined,
      "cron",
    ).catch(() => {});

    logger.info("[cron/credit-weekly-report]", {
      tenants: tenants.length,
      reportsGenerated,
    });

    return NextResponse.json({
      ok: true,
      tenants: tenants.length,
      reportsGenerated,
      processedAt: now.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/credit-weekly-report] Error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
