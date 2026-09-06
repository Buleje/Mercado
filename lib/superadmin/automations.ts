import "server-only";
import { prisma } from "@/lib/prisma";
import { USAGE_TIERS, type TierName } from "@/lib/billing/wire-up/usage-tiers";
import type { NotifyLog } from "@/lib/superadmin/automation-cooldown";

/**
 * Automatizaciones del superadmin (Brandon 2026-06-14). Reglas PRESET que
 * detectan tiendas que matchean una condición y disparan una acción (aviso al
 * dueño). El estado enabled/lastRunAt se persiste en PlatformSetting["automations"].
 * La ejecución automática (cron) es follow-up; acá hay match en vivo + "ejecutar
 * ahora" manual.
 */

export type RuleKey = "trial-expiring" | "no-login-14d" | "near-limit" | "stale-30d";

export const RULES: { key: RuleKey; title: string; trigger: string; action: string; message: { title: string; body: string } }[] = [
  {
    key: "trial-expiring",
    title: "Trial por vencer",
    trigger: "El trial vence en ≤3 días",
    action: "Avisar al dueño (WhatsApp + push)",
    message: { title: "⏳ Tu prueba de Buleje está por terminar", body: "Tu período de prueba vence pronto. Activá tu plan para no perder acceso. ¿Te ayudamos?" },
  },
  {
    key: "no-login-14d",
    title: "Sin actividad",
    trigger: "Sin iniciar sesión en 14 días",
    action: "Reenganchar al dueño (WhatsApp + push)",
    message: { title: "👋 Te extrañamos en Buleje", body: "Hace rato no entrás a tu panel. ¿Necesitás una mano para sacarle provecho a tu tienda?" },
  },
  {
    key: "near-limit",
    title: "Cerca del límite",
    trigger: "Pedidos del mes ≥90% del plan",
    action: "Ofrecer upgrade (WhatsApp + push)",
    message: { title: "🚀 Tu tienda está creciendo", body: "Estás cerca del límite de pedidos de tu plan. Subí de plan para no frenar tus ventas." },
  },
  {
    key: "stale-30d",
    title: "Tienda dormida",
    trigger: "Sin pedidos en 30 días",
    action: "Reactivar al dueño (WhatsApp + push)",
    message: { title: "🔔 Reactivá tu tienda Buleje", body: "Hace 30 días que no registrás pedidos. ¿Querés que te ayudemos a reactivar tus ventas?" },
  },
];

function planToTier(plan: string): TierName {
  if (plan === "pro" || plan === "business") return "pro";
  if (plan === "enterprise") return "enterprise";
  if (plan === "starter") return "starter";
  return "free";
}

export type MatchTenant = { id: string; slug: string; name: string };

/** Tiendas que matchean una regla AHORA (datos reales). */
export async function computeMatches(key: RuleKey): Promise<MatchTenant[]> {
  const now = Date.now();
  if (key === "trial-expiring") {
    const rows = await prisma.tenant.findMany({
      where: { trialEndsAt: { gte: new Date(now), lte: new Date(now + 3 * 86_400_000) } },
      select: { id: true, slug: true, name: true },
    });
    return rows;
  }
  if (key === "stale-30d") {
    const ago30 = new Date(now - 30 * 86_400_000);
    const [active, recent] = await Promise.all([
      prisma.tenant.findMany({ where: { active: true }, select: { id: true, slug: true, name: true } }),
      prisma.order.groupBy({ by: ["tenantId"], where: { createdAt: { gte: ago30 } }, _count: { _all: true } }),
    ]);
    const withRecent = new Set(recent.map((r) => r.tenantId));
    return active.filter((t) => !withRecent.has(t.id));
  }
  if (key === "no-login-14d") {
    const ago14 = new Date(now - 14 * 86_400_000);
    const [active, logins] = await Promise.all([
      prisma.tenant.findMany({ where: { active: true }, select: { id: true, slug: true, name: true } }),
      prisma.activityLog.groupBy({ by: ["tenantId"], where: { action: "login_success" }, _max: { createdAt: true } }),
    ]);
    const lastLogin = new Map(logins.map((l) => [l.tenantId, l._max.createdAt?.getTime() ?? 0]));
    return active.filter((t) => (lastLogin.get(t.id) ?? 0) < ago14.getTime());
  }
  // near-limit
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [tenants, ordersBy] = await Promise.all([
    prisma.tenant.findMany({ select: { id: true, slug: true, name: true, plan: true } }),
    prisma.order.groupBy({ by: ["tenantId"], where: { createdAt: { gte: monthStart } }, _count: { _all: true } }),
  ]);
  const orderMap = new Map(ordersBy.map((r) => [r.tenantId, r._count._all]));
  return tenants.filter((t) => {
    const quota = USAGE_TIERS[planToTier(t.plan)]["order.created"];
    const limit = quota?.limit ?? Infinity;
    if (limit === Infinity || limit === 0) return false;
    return (orderMap.get(t.id) ?? 0) / limit >= 0.9;
  }).map((t) => ({ id: t.id, slug: t.slug, name: t.name }));
}

type RuleState = { enabled?: boolean; lastRunAt?: string | null };
type AutomationState = Record<string, RuleState>;

export async function getAutomationState(): Promise<AutomationState> {
  const row = await prisma.platformSetting.findUnique({ where: { key: "automations" } });
  return (row?.value as AutomationState) ?? {};
}

export async function setAutomationState(state: AutomationState, updatedBy: string): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key: "automations" },
    create: { key: "automations", value: state, updatedBy },
    update: { value: state, updatedBy },
  });
}

const NOTIFY_LOG_KEY = "automation-notify-log";

/** Log de dedup: a quien se aviso y cuando, por regla. */
export async function getNotifyLog(): Promise<NotifyLog> {
  const row = await prisma.platformSetting.findUnique({ where: { key: NOTIFY_LOG_KEY } });
  return (row?.value as NotifyLog) ?? {};
}

export async function setNotifyLog(log: NotifyLog, updatedBy: string): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key: NOTIFY_LOG_KEY },
    create: { key: NOTIFY_LOG_KEY, value: log, updatedBy },
    update: { value: log, updatedBy },
  });
}
