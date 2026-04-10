#!/usr/bin/env node
/**
 * pre-deploy-enterprise-gate.mjs — PreToolUse hook para Skill(deploy).
 *
 * Gate enterprise obligatorio antes de cada deploy. Verifica:
 *  1. Que no hay console.log en código de producción
 *  2. Que tsc --noEmit pasa limpio
 *  3. Que npm run lint pasa limpio
 *  4. Que npm run test pasa
 *
 * Nota: la verificación del pentester es manual (invoke agent) — este hook
 * cubre los gates automatizables.
 *
 * Exit 0 = allow · Exit 2 = block (stderr al user + decision JSON)
 *
 * Referencia: ADR-026 Phase 3 Total Autonomous Sovereignty
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

// ── Config ────────────────────────────────────────────────────────────────
const PROJECT_DIR = resolve(
  process.env.BSM_PROJECT_ROOT ||
  process.env.CLAUDE_PROJECT_DIR ||
  "."
);

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
    reason: `Deploy gate failed: ${reason}`,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `🚫 ENTERPRISE DEPLOY GATE\n` +
        `─────────────────────────\n` +
        `${reason}\n\n` +
        `Detalles:\n${details}\n\n` +
        `Solución: corregir los errores y volver a intentar /deploy.\n` +
        `Bypass de emergencia: SKIP_DEPLOY_GATE=1 (solo hotfixes críticos).`
    }
  };
  process.stdout.write(JSON.stringify(response));
  process.stderr.write(`\n🚫 deploy-gate: ${reason}\n`);
  process.exit(2);
}

/**
 * Ejecuta un comando y retorna { ok, output }.
 */
function run(cmd) {
  try {
    const output = execSync(cmd, {
      cwd: PROJECT_DIR,
      timeout: 120000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return { ok: true, output: output.trim() };
  } catch (e) {
    return { ok: false, output: (e.stderr || e.stdout || e.message || "").trim() };
  }
}

// ── Main ────────────────────────────────────────────────────────────────
const input = readInput();

// Solo interceptar el skill de deploy
if (!input) {
  process.exit(0);
}

const toolName = input.tool_name || "";
const skillName = (input.tool_input?.skill || "").toLowerCase();

// Solo gatear el skill de deploy
if (toolName !== "Skill" || !["deploy", "vercel-plugin:deploy"].includes(skillName)) {
  process.exit(0);
}

// Skip de emergencia
if (process.env.SKIP_DEPLOY_GATE === "1") {
  process.stderr.write("⚠️ deploy-gate: SKIP_DEPLOY_GATE=1 — bypass de emergencia activo\n");
  process.exit(0);
}

// ── Gate 1: console.log en producción ──────────────────────────────────
const consoleCheck = run(
  `grep -rn "console\\.log" app/ lib/ components/ --include="*.ts" --include="*.tsx" ` +
  `--exclude-dir=__tests__ --exclude-dir=e2e --exclude-dir=node_modules 2>/dev/null | ` +
  `grep -v "// eslint-disable" | grep -v ".catch" | head -10`
);

if (consoleCheck.ok && consoleCheck.output.length > 0) {
  const count = consoleCheck.output.split("\n").length;
  block(
    `${count} console.log(s) en código de producción`,
    consoleCheck.output.substring(0, 500)
  );
}

// ── Gate 2: TypeScript type-check ──────────────────────────────────────
const tscCheck = run("npx tsc --noEmit 2>&1 | head -20");
if (!tscCheck.ok) {
  block(
    "TypeScript type-check falló (tsc --noEmit)",
    tscCheck.output.substring(0, 500)
  );
}

// ── Gate 3: ESLint ─────────────────────────────────────────────────────
const lintCheck = run("npm run lint 2>&1 | tail -10");
if (!lintCheck.ok) {
  block(
    "ESLint tiene errores",
    lintCheck.output.substring(0, 500)
  );
}

// ── Gate 4: Tests ──────────────────────────────────────────────────────
const testCheck = run("npm run test 2>&1 | tail -20");
if (!testCheck.ok) {
  block(
    "Tests fallando — no se puede deployar con tests rotos",
    testCheck.output.substring(0, 500)
  );
}

// ── Todos los gates pasaron ────────────────────────────────────────────
process.stderr.write("✅ deploy-gate: todos los gates enterprise pasaron\n");
process.exit(0);
