import "server-only";
import { AutomatizacionesDB, type TiendaBasica } from "@/lib/db/automatizaciones.db";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { tiendasDormidas } from "@/lib/superadmin/tienda-dormida";
import { USAGE_TIERS } from "@/lib/billing/wire-up/usage-tiers";
import { cupoDeUsoDePlan } from "@/lib/superadmin/upgrade-recommendation";
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
    message: { title: "⏳ Tu prueba de Buleje está por terminar", body: "Tu período de prueba vence pronto. Activa tu plan para no perder acceso. ¿Te ayudamos?" },
  },
  {
    key: "no-login-14d",
    title: "Sin actividad",
    trigger: "Sin iniciar sesión en 14 días",
    action: "Reenganchar al dueño (WhatsApp + push)",
    message: { title: "👋 Te extrañamos en Buleje", body: "Hace rato no entras a tu panel. ¿Necesitas una mano para sacarle provecho a tu tienda?" },
  },
  {
    key: "near-limit",
    title: "Cerca del límite",
    trigger: "Pedidos del mes ≥90% del plan",
    action: "Ofrecer upgrade (WhatsApp + push)",
    message: { title: "🚀 Tu tienda está creciendo", body: "Estás cerca del límite de pedidos de tu plan. Sube de plan para no frenar tus ventas." },
  },
  {
    key: "stale-30d",
    title: "Tienda dormida",
    trigger: "Sin pedidos, ventas ni operaciones del libro en 30 días",
    action: "Reactivar al dueño (WhatsApp + push)",
    message: { title: "🔔 Reactiva tu tienda Buleje", body: "Hace 30 días que no registras pedidos. ¿Quieres que te ayudemos a reactivar tus ventas?" },
  },
];

export type MatchTenant = TiendaBasica;

/** Tiendas que matchean una regla AHORA (datos reales). Las lecturas viven en `AutomatizacionesDB`. */
export async function computeMatches(key: RuleKey): Promise<MatchTenant[]> {
  const now = Date.now();
  if (key === "trial-expiring") {
    return AutomatizacionesDB.tiendasConPruebaEntre(new Date(now), new Date(now + 3 * 86_400_000));
  }
  if (key === "stale-30d") {
    // «Dormida» = sin operaciones reales en 30 días (pedidos, ventas, libro CTP, trozas), no sólo sin pedidos.
    // Atajo barato: quien tuvo un pedido en 30 días ya tiene operaciones, así que sólo se miden las demás.
    const [activas, conPedidos] = await Promise.all([
      AutomatizacionesDB.tiendasActivas(),
      AutomatizacionesDB.pedidosDesde(new Date(now - 30 * 86_400_000)),
    ]);
    const candidatas = activas.filter((t) => !conPedidos.has(t.id));
    const senales = await AutomatizacionesDB.senalesDeUsoDe(candidatas.map((t) => t.id), now);
    return tiendasDormidas(candidatas, senales);
  }
  if (key === "no-login-14d") {
    const ago14 = new Date(now - 14 * 86_400_000);
    const [active, lastLogin] = await Promise.all([
      AutomatizacionesDB.tiendasActivas(),
      AutomatizacionesDB.ultimoIngresoPorTienda(),
    ]);
    return active.filter((t) => (lastLogin.get(t.id) ?? 0) < ago14.getTime());
  }
  // near-limit
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [tenants, orderMap] = await Promise.all([
    AutomatizacionesDB.tiendasConPlan(),
    AutomatizacionesDB.pedidosDesde(monthStart),
  ]);
  return tenants.filter((t) => {
    const quota = USAGE_TIERS[cupoDeUsoDePlan(t.plan)]["order.created"];
    const limit = quota?.limit ?? Infinity;
    if (limit === Infinity || limit === 0) return false;
    return (orderMap.get(t.id) ?? 0) / limit >= 0.9;
  }).map((t) => ({ id: t.id, slug: t.slug, name: t.name }));
}

type RuleState = { enabled?: boolean; lastRunAt?: string | null };
type AutomationState = Record<string, RuleState>;

export async function getAutomationState(): Promise<AutomationState> {
  return (await PlatformSettingsDB.getFresco<AutomationState>("automations")) ?? {};
}

export async function setAutomationState(state: AutomationState, updatedBy: string): Promise<void> {
  await PlatformSettingsDB.set("automations", state, updatedBy);
}

const NOTIFY_LOG_KEY = "automation-notify-log";

/** Log de dedup: a quien se aviso y cuando, por regla. */
export async function getNotifyLog(): Promise<NotifyLog> {
  return (await PlatformSettingsDB.getFresco<NotifyLog>(NOTIFY_LOG_KEY)) ?? {};
}

export async function setNotifyLog(log: NotifyLog, updatedBy: string): Promise<void> {
  await PlatformSettingsDB.set(NOTIFY_LOG_KEY, log, updatedBy);
}
