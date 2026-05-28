#!/usr/bin/env node
/**
 * post-deploy-sentinel.mjs — PostToolUse hook para Skill(deploy).
 *
 * Después de un deploy exitoso a Vercel, ejecuta health checks.
 * Si el sitio no responde → reportar para self-heal o rollback.
 *
 * Este hook NO "escucha" 5 minutos (imposible en hook síncrono).
 * En su lugar, ejecuta 3 checks con intervalos cortos y reporta.
 *
 * Exit 0 = no action needed
 * Stderr con warnings = informar al agente principal
 *
 * Referencia: ADR-026 Phase 3 Total Autonomous Sovereignty
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// ── Config ────────────────────────────────────────────────────────────────
const PROD_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://mercado.vercel.app";
const HEALTH_ENDPOINT = `${PROD_URL}/api/health`;
const MAX_RESPONSE_TIME_MS = 5000; // 5 segundos = alerta
const CHECK_ATTEMPTS = 3;
const DELAY_BETWEEN_CHECKS_MS = 2000; // 2 segundos entre checks

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
 * Sleep síncrono (para hook síncrono).
 */
function sleep(ms) {
  execSync(`sleep ${ms / 1000} 2>/dev/null || timeout /t ${Math.ceil(ms / 1000)} /nobreak >nul 2>&1`, {
    stdio: "ignore",
    timeout: ms + 5000
  });
}

/**
 * Ejecuta un health check con curl.
 * Retorna { status, timeMs, ok }
 */
function healthCheck(url) {
  try {
    const output = execSync(
      `curl -s -o /dev/null -w "%{http_code} %{time_total}" --max-time 10 "${url}" 2>/dev/null`,
      { encoding: "utf8", timeout: 15000 }
    ).trim();
    const [status, time] = output.split(" ");
    const timeMs = Math.round(parseFloat(time) * 1000);
    return {
      status: parseInt(status, 10),
      timeMs,
      ok: parseInt(status, 10) >= 200 && parseInt(status, 10) < 400
    };
  } catch {
    return { status: 0, timeMs: -1, ok: false };
  }
}

// ── Main ────────────────────────────────────────────────────────────────
const input = readInput();

// Solo interceptar post-deploy
if (!input) {
  process.exit(0);
}

const toolName = input.tool_name || "";
const skillName = (input.tool_input?.skill || "").toLowerCase();

if (toolName !== "Skill" || !["deploy", "vercel-plugin:deploy"].includes(skillName)) {
  process.exit(0);
}

// Solo si el deploy fue exitoso
const toolResult = input.tool_result || "";
if (typeof toolResult === "string" && toolResult.includes("error")) {
  process.stderr.write("⚠️ sentinel: deploy parece haber fallado, skip health check\n");
  process.exit(0);
}

// ── Health checks post-deploy ──────────────────────────────────────────
process.stderr.write(`\n🔍 Post-Deploy Sentinel — verificando ${PROD_URL}\n`);

const results = [];

for (let i = 0; i < CHECK_ATTEMPTS; i++) {
  if (i > 0) {
    sleep(DELAY_BETWEEN_CHECKS_MS);
  }

  const appCheck = healthCheck(PROD_URL);
  const apiCheck = healthCheck(HEALTH_ENDPOINT);

  results.push({ attempt: i + 1, app: appCheck, api: apiCheck });

  const appIcon = appCheck.ok ? "✅" : "❌";
  const apiIcon = apiCheck.ok ? "✅" : "❌";

  process.stderr.write(
    `  Check ${i + 1}/${CHECK_ATTEMPTS}: ` +
    `App ${appIcon} (${appCheck.status}, ${appCheck.timeMs}ms) | ` +
    `API ${apiIcon} (${apiCheck.status}, ${apiCheck.timeMs}ms)\n`
  );
}

// ── Analizar resultados ────────────────────────────────────────────────
const failures = results.filter(r => !r.app.ok || !r.api.ok);
const slowChecks = results.filter(
  r => r.app.timeMs > MAX_RESPONSE_TIME_MS || r.api.timeMs > MAX_RESPONSE_TIME_MS
);

if (failures.length >= 2) {
  process.stderr.write(
    `\n🔴 SENTINEL ALERT: ${failures.length}/${CHECK_ATTEMPTS} health checks fallidos!\n` +
    `   Acción recomendada: ejecutar /self-heal o considerar rollback\n` +
    `   Comando rollback: vercel rollback\n\n`
  );
} else if (failures.length === 1) {
  process.stderr.write(
    `\n🟡 SENTINEL WARNING: 1 check fallido (puede ser transitorio)\n` +
    `   Monitorear manualmente en los próximos minutos.\n\n`
  );
} else if (slowChecks.length > 0) {
  const maxTime = Math.max(...results.map(r => Math.max(r.app.timeMs, r.api.timeMs)));
  process.stderr.write(
    `\n🟡 SENTINEL WARNING: respuesta lenta (${maxTime}ms > ${MAX_RESPONSE_TIME_MS}ms)\n` +
    `   Puede ser cold start post-deploy. Monitorear.\n\n`
  );
} else {
  process.stderr.write(
    `\n🟢 SENTINEL OK: deploy verificado, sitio saludable.\n\n`
  );
}

process.exit(0);
