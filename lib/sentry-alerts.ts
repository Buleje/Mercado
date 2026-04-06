import * as Sentry from "@sentry/nextjs";

// ---------------------------------------------------------------------------
// Sentry Alerting Helpers
// ---------------------------------------------------------------------------
// These utilities wrap Sentry SDK calls with the extra context and severity
// levels needed so that Sentry dashboard alert rules can fire reliably.
// ---------------------------------------------------------------------------

interface CriticalErrorContext {
  /** Module or subsystem where the error originated (e.g. "checkout", "orders") */
  module?: string;
  /** The tenant affected */
  tenantId?: string;
  /** Any additional key-value pairs to attach */
  extra?: Record<string, unknown>;
  /** Tags for Sentry filtering / alert conditions */
  tags?: Record<string, string>;
}

/**
 * Report a critical (fatal-level) error to Sentry.
 *
 * Use this for errors that represent data-loss risk, payment failures,
 * or anything that should wake someone up via a Sentry alert rule.
 */
export function reportCriticalError(
  error: Error | unknown,
  context: CriticalErrorContext = {},
): string {
  const eventId = Sentry.captureException(error, {
    level: "fatal",
    tags: {
      severity: "critical",
      ...(context.module ? { module: context.module } : {}),
      ...(context.tenantId ? { tenant_id: context.tenantId } : {}),
      ...context.tags,
    },
    extra: {
      ...context.extra,
      ...(context.tenantId ? { tenantId: context.tenantId } : {}),
      reportedAt: new Date().toISOString(),
    },
  });

  return eventId;
}

// ---------------------------------------------------------------------------

interface PerformanceAnomalyOptions {
  /** Optional tags for Sentry filtering */
  tags?: Record<string, string>;
  /** Tenant affected (if applicable) */
  tenantId?: string;
}

/**
 * Report a performance anomaly as a custom Sentry event.
 *
 * Call this when a metric (e.g. response time, queue depth, memory usage)
 * exceeds the expected threshold so that a Sentry alert rule can trigger.
 */
export function reportPerformanceAnomaly(
  metric: string,
  value: number,
  threshold: number,
  options: PerformanceAnomalyOptions = {},
): string {
  const eventId = Sentry.captureMessage(
    `Performance anomaly: ${metric} = ${value} (threshold: ${threshold})`,
    {
      level: "warning",
      tags: {
        category: "performance_anomaly",
        metric,
        ...(options.tenantId ? { tenant_id: options.tenantId } : {}),
        ...options.tags,
      },
      extra: {
        metric,
        value,
        threshold,
        exceedBy: value - threshold,
        exceedPercent: Math.round(((value - threshold) / threshold) * 100),
        tenantId: options.tenantId,
        reportedAt: new Date().toISOString(),
      },
    },
  );

  return eventId;
}

// ---------------------------------------------------------------------------

interface AlertRule {
  name: string;
  condition: string;
  action: string;
  severity: "warning" | "critical";
}

/**
 * Log the recommended Sentry dashboard alert rules to configure.
 *
 * This does NOT create rules via the API — it prints them to the console
 * so a developer can manually configure them in the Sentry UI.
 *
 * Call once during development/setup: `setupAlertRules()`
 */
export function setupAlertRules(): AlertRule[] {
  const rules: AlertRule[] = [
    {
      name: "High Error Rate",
      condition: "Error rate > 1% of transactions over 1 hour",
      action:
        "Sentry Dashboard > Alerts > Metric Alert: events(is:unresolved) / count() > 0.01",
      severity: "warning",
    },
    {
      name: "Slow P95 Latency",
      condition: "P95 transaction duration > 500ms over 5 minutes",
      action:
        "Sentry Dashboard > Alerts > Metric Alert: p95(transaction.duration) > 500",
      severity: "warning",
    },
    {
      name: "New Unhandled Exception",
      condition: "A new issue (first seen) with unhandled exception",
      action:
        "Sentry Dashboard > Alerts > Issue Alert: A new issue is created, filter: error.unhandled:true — notify immediately",
      severity: "critical",
    },
    {
      name: "Transaction Failure Spike",
      condition: "Transaction failure rate > 5% over 10 minutes",
      action:
        "Sentry Dashboard > Alerts > Metric Alert: failure_rate() > 0.05",
      severity: "critical",
    },
  ];

  /* eslint-disable no-console */
  console.log("\n=== Recommended Sentry Alert Rules ===\n");
  for (const rule of rules) {
    console.log(`[${rule.severity.toUpperCase()}] ${rule.name}`);
    console.log(`  Condition : ${rule.condition}`);
    console.log(`  How to set: ${rule.action}`);
    console.log();
  }
  console.log(
    "Configure these in https://sentry.io → Project Settings → Alerts",
  );
  console.log("======================================\n");
  /* eslint-enable no-console */

  return rules;
}
