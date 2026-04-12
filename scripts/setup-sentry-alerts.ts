/**
 * setup-sentry-alerts.ts
 * ---------------------------------------------------------------------------
 * Configures Sentry alert rules for Buleje via the Sentry API.
 *
 * Required env vars:
 *   SENTRY_AUTH_TOKEN  — API token with project:write and org:read scopes
 *   SENTRY_ORG        — Organization slug (e.g. "buleje")
 *   SENTRY_PROJECT    — Project slug (e.g. "bodega-san-martin")
 *
 * Usage:
 *   npx tsx scripts/setup-sentry-alerts.ts            # Create rules
 *   npx tsx scripts/setup-sentry-alerts.ts --dry-run   # Preview without creating
 * ---------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Config & types
// ---------------------------------------------------------------------------

interface EnvConfig {
  authToken: string;
  org: string;
  project: string;
  baseUrl: string;
}

interface IssueAlertPayload {
  name: string;
  conditions: Record<string, unknown>[];
  filters?: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  actionMatch: string;
  filterMatch?: string;
  frequency: number;
}

interface MetricAlertPayload {
  name: string;
  dataset: string;
  query: string;
  aggregate: string;
  timeWindow: number;
  thresholdType: number;
  resolveThreshold: number | null;
  triggers: MetricTrigger[];
  projects: string[];
  owner?: string;
}

interface MetricTrigger {
  label: string;
  alertThreshold: number;
  actions: MetricTriggerAction[];
}

interface MetricTriggerAction {
  type: string;
  targetType: string;
  targetIdentifier: string;
}

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function loadEnv(): EnvConfig {
  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  const missing: string[] = [];
  if (!authToken) missing.push("SENTRY_AUTH_TOKEN");
  if (!org) missing.push("SENTRY_ORG");
  if (!project) missing.push("SENTRY_PROJECT");

  if (missing.length > 0) {
    console.error(`[ERROR] Faltan variables de entorno: ${missing.join(", ")}`);
    console.error(
      "  Asegurate de exportarlas o agregarlas al .env.local antes de ejecutar."
    );
    process.exit(1);
  }

  return {
    authToken: authToken!,
    org: org!,
    project: project!,
    baseUrl: "https://sentry.io/api/0",
  };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function sentryFetch<T>(
  env: EnvConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${env.baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.authToken}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Sentry API ${res.status} ${res.statusText} — ${options.method ?? "GET"} ${path}\n${body}`
    );
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

interface ExistingIssueRule {
  id: number;
  name: string;
}

interface ExistingMetricRule {
  id: number;
  name: string;
}

async function getExistingIssueRules(
  env: EnvConfig
): Promise<ExistingIssueRule[]> {
  return sentryFetch<ExistingIssueRule[]>(
    env,
    `/projects/${env.org}/${env.project}/rules/`
  );
}

async function getExistingMetricRules(
  env: EnvConfig
): Promise<ExistingMetricRule[]> {
  return sentryFetch<ExistingMetricRule[]>(
    env,
    `/organizations/${env.org}/alert-rules/`
  );
}

function ruleExists(
  name: string,
  existing: { name: string }[]
): boolean {
  return existing.some((r) => r.name === name);
}

// ---------------------------------------------------------------------------
// Rule 1: Error Rate Alto (Issue Alert)
// ---------------------------------------------------------------------------

function buildErrorRateRule(): IssueAlertPayload {
  return {
    name: "Buleje \u2014 Error Rate Alto",
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 10,
        interval: "1h",
      },
    ],
    actions: [
      {
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
      },
    ],
    actionMatch: "all",
    frequency: 60,
  };
}

async function createErrorRateRule(
  env: EnvConfig,
  dryRun: boolean,
  existingRules: ExistingIssueRule[]
): Promise<boolean> {
  const payload = buildErrorRateRule();

  if (ruleExists(payload.name, existingRules)) {
    console.log(`  [SKIP] "${payload.name}" ya existe.`);
    return false;
  }

  if (dryRun) {
    console.log(`  [DRY-RUN] Crearia: "${payload.name}"`);
    console.log(`    Condicion: >10 eventos/hora`);
    console.log(`    Accion: Notificar a IssueOwners por email`);
    console.log(`    Frecuencia: cada 60 minutos`);
    return false;
  }

  await sentryFetch(
    env,
    `/projects/${env.org}/${env.project}/rules/`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  console.log(`  [OK] "${payload.name}" creada.`);
  return true;
}

// ---------------------------------------------------------------------------
// Rule 2: Excepcion No Manejada (Issue Alert)
// ---------------------------------------------------------------------------

function buildUnhandledExceptionRule(): IssueAlertPayload {
  return {
    name: "Buleje \u2014 Excepci\u00f3n No Manejada",
    conditions: [
      {
        id: "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition",
      },
    ],
    filters: [
      {
        id: "sentry.rules.filters.tagged_event.TaggedEventFilter",
        key: "handled",
        match: "eq",
        value: "no",
      },
    ],
    actions: [
      {
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
      },
    ],
    actionMatch: "all",
    filterMatch: "all",
    frequency: 5,
  };
}

async function createUnhandledExceptionRule(
  env: EnvConfig,
  dryRun: boolean,
  existingRules: ExistingIssueRule[]
): Promise<boolean> {
  const payload = buildUnhandledExceptionRule();

  if (ruleExists(payload.name, existingRules)) {
    console.log(`  [SKIP] "${payload.name}" ya existe.`);
    return false;
  }

  if (dryRun) {
    console.log(`  [DRY-RUN] Crearia: "${payload.name}"`);
    console.log(`    Condicion: Primera vez que se ve el evento`);
    console.log(`    Filtro: handled = no`);
    console.log(`    Accion: Notificar a IssueOwners por email`);
    console.log(`    Frecuencia: cada 5 minutos`);
    return false;
  }

  await sentryFetch(
    env,
    `/projects/${env.org}/${env.project}/rules/`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  console.log(`  [OK] "${payload.name}" creada.`);
  return true;
}

// ---------------------------------------------------------------------------
// Rule 3: Latencia P95 Alta (Metric Alert)
// ---------------------------------------------------------------------------

function buildLatencyMetricAlert(project: string): MetricAlertPayload {
  return {
    name: "Buleje \u2014 Latencia P95 Alta",
    dataset: "transactions",
    query: "",
    aggregate: "p95(transaction.duration)",
    timeWindow: 5,
    thresholdType: 0, // 0 = above threshold
    resolveThreshold: 400,
    triggers: [
      {
        label: "critical",
        alertThreshold: 800,
        actions: [
          {
            type: "email",
            targetType: "team",
            targetIdentifier: "default",
          },
        ],
      },
      {
        label: "warning",
        alertThreshold: 500,
        actions: [],
      },
    ],
    projects: [project],
  };
}

async function createLatencyMetricAlert(
  env: EnvConfig,
  dryRun: boolean,
  existingRules: ExistingMetricRule[]
): Promise<boolean> {
  const payload = buildLatencyMetricAlert(env.project);

  if (ruleExists(payload.name, existingRules)) {
    console.log(`  [SKIP] "${payload.name}" ya existe.`);
    return false;
  }

  if (dryRun) {
    console.log(`  [DRY-RUN] Crearia: "${payload.name}"`);
    console.log(`    Metrica: p95(transaction.duration)`);
    console.log(`    Ventana: 5 minutos`);
    console.log(`    Warning: >500ms | Critical: >800ms`);
    console.log(`    Resuelve: <400ms`);
    return false;
  }

  await sentryFetch(
    env,
    `/organizations/${env.org}/alert-rules/`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  console.log(`  [OK] "${payload.name}" creada.`);
  return true;
}

// ---------------------------------------------------------------------------
// Rule 4: Tasa de Fallos de Transacciones (Metric Alert)
// ---------------------------------------------------------------------------

function buildFailureRateMetricAlert(project: string): MetricAlertPayload {
  return {
    name: "Buleje \u2014 Tasa de Fallos Alta",
    dataset: "transactions",
    query: "",
    aggregate: "failure_rate()",
    timeWindow: 10,
    thresholdType: 0,
    resolveThreshold: 0.03,
    triggers: [
      {
        label: "critical",
        alertThreshold: 0.1,
        actions: [
          {
            type: "email",
            targetType: "team",
            targetIdentifier: "default",
          },
        ],
      },
      {
        label: "warning",
        alertThreshold: 0.05,
        actions: [],
      },
    ],
    projects: [project],
  };
}

async function createFailureRateMetricAlert(
  env: EnvConfig,
  dryRun: boolean,
  existingRules: ExistingMetricRule[]
): Promise<boolean> {
  const payload = buildFailureRateMetricAlert(env.project);

  if (ruleExists(payload.name, existingRules)) {
    console.log(`  [SKIP] "${payload.name}" ya existe.`);
    return false;
  }

  if (dryRun) {
    console.log(`  [DRY-RUN] Crearia: "${payload.name}"`);
    console.log(`    Metrica: failure_rate()`);
    console.log(`    Ventana: 10 minutos`);
    console.log(`    Warning: >5% | Critical: >10%`);
    console.log(`    Resuelve: <3%`);
    return false;
  }

  await sentryFetch(
    env,
    `/organizations/${env.org}/alert-rules/`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  console.log(`  [OK] "${payload.name}" creada.`);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  console.log("=== Sentry Alert Rules Setup — Buleje ===");
  console.log(`Modo: ${dryRun ? "DRY-RUN (no se creara nada)" : "PRODUCCION"}\n`);

  const env = loadEnv();
  console.log(`Org: ${env.org} | Proyecto: ${env.project}\n`);

  // Fetch existing rules to avoid duplicates
  console.log("Consultando reglas existentes...");

  let existingIssueRules: ExistingIssueRule[] = [];
  let existingMetricRules: ExistingMetricRule[] = [];

  try {
    [existingIssueRules, existingMetricRules] = await Promise.all([
      getExistingIssueRules(env),
      getExistingMetricRules(env),
    ]);
    console.log(
      `  Encontradas: ${existingIssueRules.length} issue alerts, ${existingMetricRules.length} metric alerts\n`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] No se pudo consultar reglas existentes:\n  ${msg}`);
    if (!dryRun) {
      console.error("  Abortando para evitar duplicados.");
      process.exit(1);
    }
    console.log("  (Continuando en dry-run con lista vacia)\n");
  }

  let created = 0;

  // --- Issue Alerts ---
  console.log("[1/4] Error Rate Alto (Issue Alert)");
  if (await createErrorRateRule(env, dryRun, existingIssueRules)) created++;

  console.log("[2/4] Excepcion No Manejada (Issue Alert)");
  if (await createUnhandledExceptionRule(env, dryRun, existingIssueRules))
    created++;

  // --- Metric Alerts ---
  console.log("[3/4] Latencia P95 Alta (Metric Alert)");
  if (await createLatencyMetricAlert(env, dryRun, existingMetricRules))
    created++;

  console.log("[4/4] Tasa de Fallos Alta (Metric Alert)");
  if (await createFailureRateMetricAlert(env, dryRun, existingMetricRules))
    created++;

  // --- Summary ---
  console.log("\n=== Resumen ===");
  if (dryRun) {
    console.log(
      "Modo dry-run: ninguna regla fue creada. Ejecuta sin --dry-run para aplicar."
    );
  } else {
    console.log(`Reglas creadas: ${created}/4`);
    console.log(
      `Verifica en: https://${env.org}.sentry.io/alerts/rules/`
    );
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err instanceof Error ? err.message : err);
  process.exit(1);
});

export {};
