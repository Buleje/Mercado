/**
 * lib/superadmin/alert-rules.ts
 *
 * Motor PURO de alertas del superadmin. Reemplaza las condiciones y umbrales
 * hardcodeados inline del route por reglas con:
 *   - umbrales configurables vía entorno (sin redeploy de lógica)
 *   - escalación de severidad por antigüedad / proximidad (un ticket viejo o un
 *     trial a punto de vencer suben de warning a critical)
 *
 * El route arma los `AlertInput` desde Prisma y delega el cálculo acá, lo que
 * lo hace testeable con data sintética.
 */

export type Severity = "critical" | "warning" | "info";

export interface Alert {
  id: string;
  severity: Severity;
  kind: string;
  title: string;
  detail: string;
  href: string;
  at: string | null;
  /** Tienda asociada (cuando la alerta es de un tenant concreto) — para filtrar. */
  tenant?: string;
  /** Slug del tenant — para saltar a su Ficha 360 / rescate (idea #E). */
  tenantSlug?: string;
}

export interface AlertConfig {
  /** Ventana de "trial por vencer" en días. */
  trialWarnDays: number;
  /** Días restantes ≤ esto → critical. */
  trialCriticalDays: number;
  /** Pedido pendiente más viejo que esto (horas) → alerta SLA. */
  slaHours: number;
  /** El pendiente más viejo supera esto (horas) → critical. */
  slaCriticalHours: number;
  /** Ticket high sin responder por más de esto (min) → critical. */
  ticketCriticalMinutes: number;
  /** Ventana de "tiendas nuevas" en días. */
  newTenantDays: number;
  /** Sin pedidos en esto (días) → tienda estancada. */
  staleTenantDays: number;
  /** Pago Yape pendiente más viejo que esto (horas) → critical. */
  paymentPendingCriticalHours: number;
  /** Caída de pedidos ≥ esto (0-1) vs período anterior → riesgo de churn. */
  churnDropPct: number;
  /** Pedidos mínimos en el período anterior para considerar churn (anti-ruido). */
  churnMinPrev: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  trialWarnDays: 3,
  trialCriticalDays: 1,
  slaHours: 2,
  slaCriticalHours: 6,
  ticketCriticalMinutes: 60,
  newTenantDays: 7,
  staleTenantDays: 30,
  paymentPendingCriticalHours: 6,
  churnDropPct: 0.5,
  churnMinPrev: 5,
};

function parseNum(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Lee umbrales del entorno (override sin redeploy); default = constantes de arriba. */
export function getAlertConfig(
  env: Record<string, string | undefined> = process.env,
): AlertConfig {
  return {
    trialWarnDays: parseNum(env.ALERT_TRIAL_WARN_DAYS, DEFAULT_ALERT_CONFIG.trialWarnDays),
    trialCriticalDays: parseNum(env.ALERT_TRIAL_CRITICAL_DAYS, DEFAULT_ALERT_CONFIG.trialCriticalDays),
    slaHours: parseNum(env.ALERT_SLA_HOURS, DEFAULT_ALERT_CONFIG.slaHours),
    slaCriticalHours: parseNum(env.ALERT_SLA_CRITICAL_HOURS, DEFAULT_ALERT_CONFIG.slaCriticalHours),
    ticketCriticalMinutes: parseNum(env.ALERT_TICKET_CRITICAL_MINUTES, DEFAULT_ALERT_CONFIG.ticketCriticalMinutes),
    newTenantDays: parseNum(env.ALERT_NEW_TENANT_DAYS, DEFAULT_ALERT_CONFIG.newTenantDays),
    staleTenantDays: parseNum(env.ALERT_STALE_TENANT_DAYS, DEFAULT_ALERT_CONFIG.staleTenantDays),
    paymentPendingCriticalHours: parseNum(env.ALERT_PAYMENT_PENDING_CRITICAL_HOURS, DEFAULT_ALERT_CONFIG.paymentPendingCriticalHours),
    churnDropPct: parseNum(env.ALERT_CHURN_DROP_PCT, DEFAULT_ALERT_CONFIG.churnDropPct),
    churnMinPrev: parseNum(env.ALERT_CHURN_MIN_PREV, DEFAULT_ALERT_CONFIG.churnMinPrev),
  };
}

export interface AlertInput {
  urgentTickets: { id: string; subject: string; tenantName: string; createdAt: string }[];
  expiringTrials: { slug: string; name: string; trialEndsAt: string | null }[];
  slaCount: number;
  /** ISO del pedido pendiente más viejo (para escalar el SLA). */
  oldestStaleOrderAt: string | null;
  newTenantCount: number;
  staleTenants: { name: string }[];
  /** Pagos Yape esperando aprobación (dinero retenido). */
  pendingPayments: { count: number; oldestAt: string | null };
  /** Tiendas con caída fuerte de pedidos vs período anterior (riesgo de churn). */
  churnRisks: { name: string; slug: string; prev: number; curr: number }[];
}

const SEV_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/** Evalúa todas las reglas → lista de alertas ordenada por severidad. */
export function buildAlerts(
  input: AlertInput,
  config: AlertConfig,
  now: number,
): Alert[] {
  const alerts: Alert[] = [];

  // ── Tickets high sin responder — escala por antigüedad ──────────────────────
  for (const t of input.urgentTickets) {
    const ageMin = (now - new Date(t.createdAt).getTime()) / 60_000;
    const severity: Severity = ageMin >= config.ticketCriticalMinutes ? "critical" : "warning";
    alerts.push({
      id: `ticket-${t.id}`,
      severity,
      kind: "ticket",
      title: severity === "critical" ? "Ticket urgente sin responder (escalado)" : "Ticket urgente sin responder",
      detail: `${t.tenantName}: ${t.subject}`,
      href: "/superadmin/support",
      at: t.createdAt,
      tenant: t.tenantName,
    });
  }

  // ── Trials por vencer — escala por proximidad ───────────────────────────────
  for (const t of input.expiringTrials) {
    const days = t.trialEndsAt
      ? Math.max(0, Math.round((new Date(t.trialEndsAt).getTime() - now) / 86_400_000))
      : 0;
    const severity: Severity = days <= config.trialCriticalDays ? "critical" : "warning";
    alerts.push({
      id: `trial-${t.slug}`,
      severity,
      kind: "trial",
      title: `Trial vence en ${days}d`,
      detail: t.name,
      href: "/superadmin/tenants?qf=trial-expiring",
      at: t.trialEndsAt,
      tenant: t.name,
    });
  }

  // ── Pagos Yape esperando aprobación — dinero retenido, escala por antigüedad ─
  if (input.pendingPayments.count > 0) {
    const ageH = input.pendingPayments.oldestAt
      ? (now - new Date(input.pendingPayments.oldestAt).getTime()) / 3_600_000
      : 0;
    const severity: Severity = ageH >= config.paymentPendingCriticalHours ? "critical" : "warning";
    alerts.push({
      id: "payments-pending",
      severity,
      kind: "payment",
      title: `${input.pendingPayments.count} pago(s) Yape por aprobar`,
      detail:
        severity === "critical"
          ? `El más viejo lleva ${Math.floor(ageH)}h esperando — aprobá o rechazá`
          : "Comprobantes Yape esperando tu revisión",
      href: "/superadmin/pagos-yape",
      at: input.pendingPayments.oldestAt,
    });
  }

  // ── Riesgo de churn — tiendas con caída fuerte de pedidos (warning) ──────────
  for (const c of input.churnRisks) {
    const dropPct = c.prev > 0 ? Math.round((1 - c.curr / c.prev) * 100) : 0;
    alerts.push({
      id: `churn-${c.slug}`,
      severity: "warning",
      kind: "churn",
      title: `${c.name}: pedidos −${dropPct}%`,
      detail: `Cayó de ${c.prev} a ${c.curr} pedidos vs período anterior — riesgo de churn`,
      href: `/superadmin/tenants?q=${encodeURIComponent(c.slug)}`,
      at: null,
      tenant: c.name,
      tenantSlug: c.slug,
    });
  }

  // ── Pedidos SLA — escala si el más viejo supera el umbral crítico ───────────
  if (input.slaCount > 0) {
    const ageH = input.oldestStaleOrderAt
      ? (now - new Date(input.oldestStaleOrderAt).getTime()) / 3_600_000
      : config.slaHours;
    const severity: Severity = ageH >= config.slaCriticalHours ? "critical" : "warning";
    alerts.push({
      id: "sla",
      severity,
      kind: "sla",
      title: `${input.slaCount} pedidos sin atender >${config.slaHours}h`,
      detail:
        severity === "critical"
          ? `El más viejo lleva ${Math.floor(ageH)}h — SLA crítico`
          : "Pedidos pendientes que rompen el SLA",
      href: "/superadmin/orders",
      at: input.oldestStaleOrderAt,
    });
  }

  // ── Tiendas estancadas (warning) ────────────────────────────────────────────
  if (input.staleTenants.length > 0) {
    alerts.push({
      id: "stale",
      severity: "warning",
      kind: "stale",
      title: `${input.staleTenants.length} tiendas sin pedidos en ${config.staleTenantDays}d`,
      detail:
        input.staleTenants.slice(0, 4).map((t) => t.name).join(", ") +
        (input.staleTenants.length > 4 ? "…" : ""),
      href: "/superadmin/tenants/onboarding",
      at: null,
    });
  }

  // ── Tiendas nuevas (info) ───────────────────────────────────────────────────
  if (input.newTenantCount > 0) {
    alerts.push({
      id: "new",
      severity: "info",
      kind: "new",
      title: `${input.newTenantCount} tiendas nuevas (${config.newTenantDays}d)`,
      detail: "Altas recientes — revisa su activación",
      href: "/superadmin/tenants?sort=createdAt",
      at: null,
    });
  }

  return alerts.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}

/** Conteos por severidad. */
export function alertCounts(alerts: Alert[]): {
  critical: number;
  warning: number;
  info: number;
  total: number;
} {
  return {
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
    total: alerts.length,
  };
}
