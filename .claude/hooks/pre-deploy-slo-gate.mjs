#!/usr/bin/env node
/**
 * pre-deploy-slo-gate.mjs — PreToolUse hook para Skill(deploy).
 *
 * Gate de SLO error budget antes de cada deploy. Verifica:
 *  - Si algun SLO tiene >90% del error budget consumido → bloquea deploy
 *  - Bypass de emergencia con SLO_GATE_BYPASS=1 (logueado)
 *  - Si no hay datos disponibles → permite con warning (no bloquear por falta de datos)
 *
 * Exit 0 = allow · Exit 2 = block (stderr al user + decision JSON)
 *
 * Referencia: ADR-034 SLOs Operational Contract
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Config ────────────────────────────────────────────────────────────────
const PROJECT_DIR = resolve(
  process.env.BSM_PROJECT_ROOT ||
  process.env.CLAUDE_PROJECT_DIR ||
  "."
);

// ── SLO Definitions (mirrored from slo.yaml) ─────────────────────────────
const SLOS = [
  { name: "checkout_success_rate", target: 0.995, window_days: 30, owner: "sre-observability" },
  { name: "api_p99_latency", target: 0.999, window_days: 7, owner: "performance-engineer" },
  { name: "boleta_sunat_success", target: 0.999, window_days: 30, owner: "integration-specialist" },
  { name: "whatsapp_delivery", target: 0.98, window_days: 30, owner: "integration-specialist" },
];

/**
 * Lee el input stdin del hook (formato JSON de Claude Code).
 */
function readInput() {
  try {
    const raw = readFileSync(0, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Emite respuesta de bloqueo en formato Claude Code hooks JSON.
 */
function block(reason, details) {
  const response = {
    decision: "block",
    reason: `SLO gate failed: ${reason}`,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "SLO ERROR BUDGET GATE\n" +
        "─────────────────────────\n" +
        `${reason}\n\n` +
        `Detalles:\n${details}\n\n` +
        "Solucion: corregir la degradacion antes de deployar.\n" +
        "Bypass de emergencia: SLO_GATE_BYPASS=1 (solo hotfixes criticos)."
    }
  };
  process.stdout.write(JSON.stringify(response));
  process.stderr.write(`\nslo-gate: ${reason}\n`);
  process.exit(2);
}

/**
 * Intenta leer metricas reales del archivo de estado SLO.
 * Retorna null si no hay datos disponibles.
 */
function readSLOMetrics() {
  try {
    const metricsPath = resolve(PROJECT_DIR, "slo", "current-metrics.json");
    const raw = readFileSync(metricsPath, "utf8");
    return JSON.parse(raw);
  } catch {
    // No metrics file available — this is expected when no telemetry is configured
    return null;
  }
}

/**
 * Calcula el burn rate para un SLO dado metricas reales.
 */
function calculateBurnRate(slo, metrics) {
  if (!metrics || !metrics[slo.name]) return null;

  const currentValue = metrics[slo.name].current;
  const budgetTotal = 1 - slo.target;
  if (budgetTotal <= 0) return 0;

  const burnRate = Math.max(0, ((slo.target - currentValue) / budgetTotal) * 100);
  return burnRate;
}

// ── Main ────────────────────────────────────────────────────────────────
const input = readInput();

// Solo interceptar si hay input valido
if (!input) {
  process.exit(0);
}

const toolName = input.tool_name || "";
const skillName = (input.tool_input?.skill || "").toLowerCase();

// Solo gatear el skill de deploy
if (toolName !== "Skill" || !["deploy", "vercel-plugin:deploy"].includes(skillName)) {
  process.exit(0);
}

// Bypass de emergencia
if (process.env.SLO_GATE_BYPASS === "1") {
  process.stderr.write("slo-gate: SLO_GATE_BYPASS=1 — EMERGENCY BYPASS activo (logged)\n");
  process.stderr.write("slo-gate: Este bypass sera auditado. Asegurate de que es un hotfix critico.\n");
  process.exit(0);
}

// Intentar leer metricas reales
const metrics = readSLOMetrics();

// Si no hay datos de metricas, permitir con warning (no bloquear por falta de datos)
if (!metrics) {
  process.stderr.write("slo-gate: No hay datos de metricas SLO disponibles (slo/current-metrics.json)\n");
  process.stderr.write("slo-gate: Permitiendo deploy sin validacion de SLO. Configura OTEL/Sentry para datos reales.\n");
  process.exit(0);
}

// Verificar cada SLO
const violations = [];

for (const slo of SLOS) {
  const burnRate = calculateBurnRate(slo, metrics);

  if (burnRate === null) {
    process.stderr.write(`slo-gate: ${slo.name} — sin datos, omitiendo\n`);
    continue;
  }

  if (burnRate >= 90) {
    violations.push({
      name: slo.name,
      burnRate: burnRate.toFixed(1),
      owner: slo.owner,
      target: (slo.target * 100).toFixed(1),
    });
  } else {
    process.stderr.write(`slo-gate: ${slo.name} — ${burnRate.toFixed(1)}% burned (OK)\n`);
  }
}

// Si hay violaciones, bloquear deploy
if (violations.length > 0) {
  const details = violations
    .map(
      (v) =>
        `  ${v.name}: ${v.burnRate}% budget burned (target: ${v.target}%, owner: ${v.owner})`
    )
    .join("\n");

  block(
    `${violations.length} SLO(s) con >90% del error budget consumido`,
    details
  );
}

// Todos los SLOs OK
process.stderr.write("slo-gate: todos los SLOs dentro del presupuesto de errores\n");
process.exit(0);
