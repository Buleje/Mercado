import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSuperAdminAlert } from "@/lib/mailer-superadmin";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { logger } from "@/lib/logger";

const CRON_SECRET = process.env.CRON_SECRET;
const PLATFORM_ALERT_PHONE = process.env.SUPERADMIN_ALERT_PHONE;

/**
 * GET /api/cron/marketplace-sla-watchdog
 *
 * Detecta pedidos del marketplace que cruzaron 2× el SLA (críticos) y
 * envía alerta al superadmin para escalación manual. Se programa cada
 * 10 minutos en `vercel.json`.
 *
 * Dedup: usa `activityLog` con action="sla_critical_alert" + entityId
 * (orderId) para no notificar dos veces el mismo pedido en una ventana
 * de 6 horas.
 */

const SLA_MINUTES: Record<string, number> = {
  pendiente: 10,
  confirmado: 30,
  en_camino: 45,
};

// Threshold dinámico por plan: planes premium tienen tolerancia más alta.
// Free: 1.0× SLA base · Pro: 1.3× · Business/Enterprise: 1.5×
const PLAN_SLA_MULTIPLIER: Record<string, number> = {
  free: 1.0,
  pro: 1.3,
  business: 1.5,
  enterprise: 1.5,
};

function effectiveSla(status: string, plan: string | null | undefined): number {
  const base = SLA_MINUTES[status] ?? 60;
  const mult = PLAN_SLA_MULTIPLIER[plan ?? "free"] ?? 1.0;
  return Math.round(base * mult);
}

const DEDUP_WINDOW_HOURS = 6;
const ACTION = "sla_critical_alert";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!CRON_SECRET || !auth || !timingSafeCompare(auth, `Bearer ${CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("marketplace-sla-watchdog", async () => {
      const now = Date.now();
      const cutoffSince = new Date(now - 4 * 60 * 60 * 1000); // mira últimas 4 h
      const dedupSince = new Date(now - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);

      const [orders, recentlyAlerted] = await Promise.all([
        prisma.order.findMany({
          where: {
            source: "marketplace",
            deletedAt: null,
            createdAt: { gte: cutoffSince },
            status: { in: ["pendiente", "confirmado", "en_camino"] },
          },
          select: {
            id: true,
            tenantId: true,
            customerName: true,
            customerPhone: true,
            total: true,
            status: true,
            createdAt: true,
          },
        }),
        prisma.activityLog.findMany({
          where: { action: ACTION, createdAt: { gte: dedupSince } },
          select: { entityId: true },
        }),
      ]);

      const alertedSet = new Set(
        recentlyAlerted.map((a) => a.entityId).filter(Boolean) as string[],
      );

      // Pre-fetch tenants con plan para aplicar threshold dinámico
      const allTenantIds = Array.from(new Set(orders.map((o) => o.tenantId)));
      const tenants = await prisma.tenant.findMany({
        where: { id: { in: allTenantIds } },
        select: { id: true, name: true, slug: true, plan: true, ownerPhone: true },
      });
      const tenantMap = new Map(tenants.map((t) => [t.id, t]));

      const critical = orders.filter((o) => {
        if (alertedSet.has(o.id)) return false;
        const tenant = tenantMap.get(o.tenantId);
        const sla = effectiveSla(o.status, tenant?.plan);
        const minutes = (now - new Date(o.createdAt).getTime()) / 60000;
        return minutes >= sla * 2;
      });

      if (critical.length === 0) {
        return { ok: true, checked: new Date().toISOString(), alerts: ["No critical SLA breaches"] };
      }

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.pe";

      // Enviar email de alerta consolidado (un solo email con todos)
      await sendSuperAdminAlert({
        subject: `🚨 ${critical.length} pedido(s) en estado crítico de SLA`,
        title: "🚨 Pedidos críticos sin atención",
        items: critical.map((o) => {
          const t = tenantMap.get(o.tenantId);
          const sla = effectiveSla(o.status, t?.plan);
          const minutes = Math.floor((now - new Date(o.createdAt).getTime()) / 60000);
          return {
            label: t?.name ?? o.tenantId,
            value: `#${o.id.slice(0, 8)} · ${o.status} · ${minutes}min (SLA: ${sla}min · plan ${t?.plan ?? "—"}) · ${o.customerName}`,
            color: "#f87171",
          };
        }),
        actionUrl: `${baseUrl}/superadmin/stores`,
        actionLabel: "Abrir Operations",
      }).catch((e) => logger.warn("[sla-watchdog] email failed", { error: String(e) }));

      // WhatsApp directo al platform-admin para alertas críticas (más
      // rápido que email). Sólo si SUPERADMIN_ALERT_PHONE está configurado.
      if (PLATFORM_ALERT_PHONE) {
        const lines = [
          `🚨 *${critical.length} pedido(s) en SLA crítico*`,
          "",
          ...critical.slice(0, 5).map((o) => {
            const t = tenantMap.get(o.tenantId);
            const minutes = Math.floor(
              (now - new Date(o.createdAt).getTime()) / 60000,
            );
            return `• ${t?.name ?? o.tenantId} · #${o.id.slice(0, 8)} · ${minutes}min`;
          }),
          critical.length > 5 ? `…y ${critical.length - 5} más` : "",
          "",
          `${baseUrl}/superadmin/stores`,
        ]
          .filter(Boolean)
          .join("\n");
        await sendWhatsAppQueued(PLATFORM_ALERT_PHONE, lines, {
          tenantId: "main",
          context: "sla-watchdog-platform",
        }).catch((e) =>
          logger.warn("[sla-watchdog] whatsapp failed", { error: String(e) }),
        );
      }

      // Marcar como alertados via ActivityLog (dedup)
      await prisma.activityLog.createMany({
        data: critical.map((o) => {
          const t = tenantMap.get(o.tenantId);
          const sla = effectiveSla(o.status, t?.plan);
          return {
            action: ACTION,
            entity: "order",
            entityId: o.id,
            detail: `${o.status} ${Math.floor((now - new Date(o.createdAt).getTime()) / 60000)}min vs SLA ${sla}min (plan ${t?.plan ?? "free"})`,
            tenantId: o.tenantId,
            user: "system:sla-watchdog",
          };
        }),
        skipDuplicates: true,
      });

      return {
        ok: true,
        checked: new Date().toISOString(),
        alerts: [`${critical.length} critical SLA breach(es) alerted`],
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
