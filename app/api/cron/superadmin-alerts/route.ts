import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSuperAdminAlert } from "@/lib/mailer-superadmin";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron/superadmin-alerts
 *
 * Runs periodically (e.g. every hour via Vercel Cron).
 * Checks for:
 *   - New tenant signups in the last hour
 *   - Subscription cancellations in the last hour
 *   - Trials expiring within 24 hours
 * Sends email alerts to the superadmin.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization");
  if (!CRON_SECRET || !auth || !timingSafeCompare(auth, `Bearer ${CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("superadmin-alerts", async () => {

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://bodegasanmartin.com";
  const alerts: string[] = [];

  // 1) New signups in the last hour
  const newTenants = await prisma.tenant.findMany({
    where: { createdAt: { gte: oneHourAgo } },
    select: { name: true, slug: true, plan: true, ownerEmail: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  if (newTenants.length > 0) {
    for (const t of newTenants) {
      await sendSuperAdminAlert({
        subject: `🆕 Nueva tienda: ${t.name} (${t.plan})`,
        title: "🆕 Nueva Tienda Registrada",
        items: [
          { label: "Tienda", value: t.name, color: "#40916c" },
          { label: "Slug", value: t.slug },
          { label: "Plan", value: t.plan.toUpperCase(), color: "#34d399" },
          { label: "Email", value: t.ownerEmail ?? "—" },
          { label: "Fecha", value: t.createdAt.toLocaleString("es-PE") },
        ],
        actionUrl: `${baseUrl}/superadmin`,
        actionLabel: "Ver en SuperAdmin",
      }).catch(() => { /* don't fail cron */ });
    }
    alerts.push(`${newTenants.length} new signup(s)`);
  }

  // 2) Recent cancellations (activity log)
  const cancellations = await prisma.activityLog.findMany({
    where: {
      action: { in: ["subscription_canceled", "tenant_suspended"] },
      createdAt: { gte: oneHourAgo },
    },
    select: { action: true, entity: true, entityId: true, detail: true, tenantId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  if (cancellations.length > 0) {
    for (const c of cancellations) {
      await sendSuperAdminAlert({
        subject: `⚠️ ${c.action === "subscription_canceled" ? "Cancelación" : "Suspensión"}: ${c.tenantId ?? c.entityId}`,
        title: c.action === "subscription_canceled" ? "⚠️ Suscripción Cancelada" : "⚠️ Tienda Suspendida",
        items: [
          { label: "Tienda", value: c.tenantId ?? c.entityId ?? "—", color: "#f87171" },
          { label: "Acción", value: c.action },
          { label: "Detalle", value: c.detail ?? "—" },
          { label: "Fecha", value: c.createdAt.toLocaleString("es-PE") },
        ],
        actionUrl: `${baseUrl}/superadmin`,
        actionLabel: "Ver en SuperAdmin",
      }).catch(() => {});
    }
    alerts.push(`${cancellations.length} cancellation(s)/suspension(s)`);
  }

  // 3) Trials expiring within 24 hours
  const expiringTrials = await prisma.tenant.findMany({
    where: {
      active: true,
      plan: "free",
      trialEndsAt: { gte: new Date(), lte: in24Hours },
    },
    select: { name: true, slug: true, ownerEmail: true, trialEndsAt: true },
  });

  if (expiringTrials.length > 0) {
    await sendSuperAdminAlert({
      subject: `⏰ ${expiringTrials.length} trial(s) expiran en 24h`,
      title: "⏰ Trials Próximos a Expirar",
      items: expiringTrials.map(t => ({
        label: t.name,
        value: `Expira: ${t.trialEndsAt?.toLocaleDateString("es-PE") ?? "—"}`,
        color: "#fbbf24",
      })),
      actionUrl: `${baseUrl}/superadmin`,
      actionLabel: "Contactar tiendas",
    }).catch(() => {});
    alerts.push(`${expiringTrials.length} trial(s) expiring`);
  }

  return {
    ok: true,
    checked: new Date().toISOString(),
    alerts: alerts.length > 0 ? alerts : ["No alerts"],
  };

    }); // end withCronRetry

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
