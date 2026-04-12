/**
 * lib/slo/budget-calculator.ts
 *
 * SLO error budget calculator for Buleje ERP.
 * Tracks burn rate, remaining budget, and deploy-gate decisions.
 *
 * Ref: ADR-034 (SLOs Operational Contract)
 */

// ── Interfaces ───────────────────────────────────────────────────────────────

export type BudgetStatusLevel = "healthy" | "warning" | "critical" | "exhausted";

export interface AlertThreshold {
  level: number;
  description: string;
  action: string;
  severity: string;
}

export interface SLO {
  name: string;
  description: string;
  sentry_query: string;
  otel_metric: string;
  target: number;
  window_days: number;
  error_budget_calculated: string;
  owner_agent: string;
  alerting: {
    thresholds: AlertThreshold[];
  };
}

export interface BudgetStatus {
  sloName: string;
  target: number;
  current: number;
  budgetTotal: number;
  budgetBurned: number;
  budgetRemaining: number;
  burnRatePercent: number;
  daysRemaining: number;
  status: BudgetStatusLevel;
}

export interface DeployGateResult {
  blocked: boolean;
  reason: string;
  slos: BudgetStatus[];
}

// ── SLO Definitions (hardcoded from slo.yaml) ────────────────────────────────

const SLO_DEFINITIONS: SLO[] = [
  {
    name: "checkout_success_rate",
    description:
      "Porcentaje de checkouts que completan exitosamente sin error 5xx ni timeout",
    sentry_query:
      "event.type:transaction transaction:/api/orders/create !http.status_code:5*",
    otel_metric: "checkout.success.rate",
    target: 0.995,
    window_days: 30,
    error_budget_calculated:
      "21 min downtime/month (0.5% of 30d = 216 min, ~21 min degraded service)",
    owner_agent: "sre-observability",
    alerting: {
      thresholds: [
        { level: 50, description: "50% budget consumed", action: "notify-slack", severity: "info" },
        { level: 75, description: "75% budget consumed", action: "notify-slack + page-oncall", severity: "warning" },
        { level: 90, description: "90% budget consumed", action: "block-deploys + page-oncall", severity: "critical" },
        { level: 100, description: "100% budget exhausted", action: "block-deploys + incident-channel + page-lead", severity: "exhausted" },
      ],
    },
  },
  {
    name: "api_p99_latency",
    description: "Latencia P99 de todas las APIs debe ser menor a 500ms",
    sentry_query:
      "event.type:transaction p99(transaction.duration):<500",
    otel_metric: "http.server.request.duration.p99",
    target: 0.999,
    window_days: 7,
    error_budget_calculated:
      "0.1% slow requests (max ~604 requests of 604,800 in 7d at 1rps)",
    owner_agent: "performance-engineer",
    alerting: {
      thresholds: [
        { level: 50, description: "50% budget consumed", action: "notify-slack", severity: "info" },
        { level: 75, description: "75% budget consumed", action: "notify-slack + performance-review", severity: "warning" },
        { level: 90, description: "90% budget consumed", action: "block-deploys + page-oncall", severity: "critical" },
        { level: 100, description: "100% budget exhausted", action: "block-deploys + incident-channel + page-lead", severity: "exhausted" },
      ],
    },
  },
  {
    name: "boleta_sunat_success",
    description:
      "Porcentaje de boletas/facturas enviadas exitosamente a SUNAT sin rechazo",
    sentry_query:
      "event.type:transaction transaction:/api/sunat/boleta status:ok",
    otel_metric: "sunat.boleta.success.rate",
    target: 0.999,
    window_days: 30,
    error_budget_calculated:
      "4 failures per 1000 boletas (0.1% failure rate over 30d window)",
    owner_agent: "integration-specialist",
    alerting: {
      thresholds: [
        { level: 50, description: "50% budget consumed", action: "notify-slack", severity: "info" },
        { level: 75, description: "75% budget consumed", action: "notify-slack + review-sunat-logs", severity: "warning" },
        { level: 90, description: "90% budget consumed", action: "block-deploys + page-oncall + sunat-audit", severity: "critical" },
        { level: 100, description: "100% budget exhausted", action: "block-deploys + incident-channel + page-lead", severity: "exhausted" },
      ],
    },
  },
  {
    name: "whatsapp_delivery",
    description:
      "Porcentaje de mensajes WhatsApp entregados exitosamente al destinatario",
    sentry_query:
      "event.type:transaction transaction:/api/whatsapp/send status:delivered",
    otel_metric: "whatsapp.message.delivery.rate",
    target: 0.98,
    window_days: 30,
    error_budget_calculated:
      "14 hrs degraded/month (2% of 30d = 14.4 hrs allowed degradation)",
    owner_agent: "integration-specialist",
    alerting: {
      thresholds: [
        { level: 50, description: "50% budget consumed", action: "notify-slack", severity: "info" },
        { level: 75, description: "75% budget consumed", action: "notify-slack + review-whatsapp-provider", severity: "warning" },
        { level: 90, description: "90% budget consumed", action: "block-deploys + page-oncall", severity: "critical" },
        { level: 100, description: "100% budget exhausted", action: "block-deploys + incident-channel + page-lead", severity: "exhausted" },
      ],
    },
  },
];

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Loads all SLO definitions.
 * Currently hardcoded; in future can be replaced with YAML parsing.
 */
export function loadSLOs(): SLO[] {
  return SLO_DEFINITIONS;
}

/**
 * Determines the status label from a burn rate percentage.
 */
export function getStatusFromBurnRate(burnRatePercent: number): BudgetStatusLevel {
  if (burnRatePercent >= 100) return "exhausted";
  if (burnRatePercent >= 90) return "critical";
  if (burnRatePercent >= 50) return "warning";
  return "healthy";
}

/**
 * Calculates the error budget burn status for a specific SLO.
 *
 * @param sloName - name of the SLO to calculate
 * @param currentValue - current observed success rate (0-1). If not provided, defaults to target (simulated healthy).
 * @param burnRateOverride - override burn rate for testing (0-100+)
 * @returns BudgetStatus or null if SLO not found
 */
export function calculateBudgetBurn(
  sloName: string,
  currentValue?: number,
  burnRateOverride?: number,
): BudgetStatus | null {
  const slo = SLO_DEFINITIONS.find((s) => s.name === sloName);
  if (!slo) return null;

  const budgetTotal = 1 - slo.target; // e.g. 0.005 for 99.5%
  const current = currentValue ?? slo.target; // default: exactly at target
  const burnRatePercent =
    burnRateOverride ??
    (budgetTotal > 0
      ? Math.max(0, ((slo.target - current) / budgetTotal) * 100)
      : 0);

  const budgetBurned = (burnRatePercent / 100) * budgetTotal;
  const budgetRemaining = Math.max(0, budgetTotal - budgetBurned);
  const daysRemaining =
    burnRatePercent > 0
      ? Math.max(0, Math.floor(slo.window_days * (1 - burnRatePercent / 100)))
      : slo.window_days;

  return {
    sloName: slo.name,
    target: slo.target,
    current,
    budgetTotal,
    budgetBurned,
    budgetRemaining,
    burnRatePercent,
    daysRemaining,
    status: getStatusFromBurnRate(burnRatePercent),
  };
}

/**
 * Returns budget status for all SLOs at once (sync version — simulated data).
 * Use getAllBudgetStatusesLive() for real Sentry data.
 */
export function getAllBudgetStatuses(): BudgetStatus[] {
  return SLO_DEFINITIONS.map((slo) => {
    const result = calculateBudgetBurn(slo.name);
    return result!;
  });
}

/**
 * Returns budget status for all SLOs using REAL Sentry data.
 * Falls back to simulated (at-target) per SLO when no data available.
 */
export async function getAllBudgetStatusesLive(): Promise<{ statuses: BudgetStatus[]; dataSource: "sentry" | "simulated" | "mixed" }> {
  const { getAllSentryMetrics } = await import("./sentry-provider");
  const metrics = await getAllSentryMetrics();

  let hasReal = false;
  let hasSimulated = false;

  const statuses = SLO_DEFINITIONS.map((slo) => {
    const metric = metrics.get(slo.name);
    if (metric && metric.hasData && metric.currentValue >= 0) {
      hasReal = true;
      return calculateBudgetBurn(slo.name, metric.currentValue)!;
    }
    hasSimulated = true;
    return calculateBudgetBurn(slo.name)!;
  });

  const dataSource = hasReal && hasSimulated ? "mixed" : hasReal ? "sentry" : "simulated";
  return { statuses, dataSource };
}

/**
 * Determines if any SLO has >90% budget burned (deploy gate).
 */
export function shouldBlockDeploy(statuses?: BudgetStatus[]): DeployGateResult {
  const all = statuses ?? getAllBudgetStatuses();
  const critical = all.filter((s) => s.burnRatePercent >= 90);

  if (critical.length > 0) {
    const names = critical.map((s) => `${s.sloName} (${s.burnRatePercent.toFixed(1)}% burned)`);
    return {
      blocked: true,
      reason: `Deploy blocked: ${critical.length} SLO(s) with >90% budget burned: ${names.join(", ")}`,
      slos: all,
    };
  }

  return {
    blocked: false,
    reason: "All SLO budgets within safe range",
    slos: all,
  };
}

/**
 * Formats an array of BudgetStatus into a Markdown table.
 */
export function formatStatusTable(statuses: BudgetStatus[]): string {
  const statusEmoji: Record<BudgetStatusLevel, string> = {
    healthy: "🟢",
    warning: "🟡",
    critical: "🔴",
    exhausted: "⛔",
  };

  const header = "| SLO | Target | Current | Budget Burned | Remaining Days | Status |";
  const separator = "|-----|--------|---------|---------------|----------------|--------|";

  const rows = statuses.map((s) => {
    const emoji = statusEmoji[s.status];
    return `| ${s.sloName} | ${(s.target * 100).toFixed(1)}% | ${(s.current * 100).toFixed(1)}% | ${s.burnRatePercent.toFixed(1)}% | ${s.daysRemaining}d | ${emoji} ${s.status} |`;
  });

  return [header, separator, ...rows].join("\n");
}
