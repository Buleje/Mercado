#!/usr/bin/env node
/**
 * session-start-context.mjs v3 — BRAIN BOOT slim (SessionStart hook).
 *
 * Carga SOLO contexto dinamico que NO esta en CLAUDE.md/AGENTS.md:
 *   1. Branch + dirty + ultimos commits
 *   2. Test status (si husky dejo flag de fallo)
 *   3. Session handoff pendiente (si existe)
 *   4. Ultima evolucion del compound-learning (si existe)
 *
 * Lo estatico (stack, modulos, reglas, comandos, agentes, skills count)
 * vive en CLAUDE.md y se carga via systemPrompt — no necesita repetirse.
 *
 * Budget: <1s. Non-blocking. Exit 0 always.
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const projectRoot =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.BSM_PROJECT_ROOT ||
  process.cwd();

function runGit(cmd) {
  try {
    return execSync(`git -C "${projectRoot}" ${cmd}`, {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function readJSON(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// ── Dynamic context ─────────────────────────────────────────────
const branch = runGit("branch --show-current") || "(?)";
const upstream = runGit("rev-parse --abbrev-ref @{upstream}") || "(sin upstream)";
const recentCommits = runGit("log --oneline -3");
const statusPorcelain = runGit("status --porcelain");
const filesDirty = statusPorcelain
  ? statusPorcelain.split("\n").filter((l) => l.trim()).length
  : 0;

const testFailedFlag = existsSync(join(projectRoot, ".husky/.last-test-run.FAILED"));

const sessionState = readJSON(join(projectRoot, ".claude/session-state.json"));
const evolutionLog = readJSON(join(projectRoot, ".claude/evolution-log.json"));

// ── Build minimal context message ───────────────────────────────
const lines = [];
lines.push(`**Branch:** \`${branch}\` → \`${upstream}\` · **Dirty:** ${filesDirty} archivos`);

if (recentCommits) {
  lines.push("");
  lines.push("**Ultimos commits:**");
  lines.push("```");
  lines.push(recentCommits);
  lines.push("```");
}

if (testFailedFlag) {
  lines.push("");
  lines.push("⚠️ **TESTS FALLANDO** en ultimo post-commit. Correr `/self-heal test`.");
}

if (sessionState?.nextActions?.length > 0) {
  lines.push("");
  lines.push("**📋 Sesion anterior dejo trabajo pendiente:**");
  sessionState.nextActions.slice(0, 3).forEach((a, i) => {
    lines.push(`  ${i + 1}. ${a}`);
  });
}

if (filesDirty > 5) {
  lines.push("");
  lines.push(`⚠️ ${filesDirty} archivos sin commitear. Considerar \`/commit\`.`);
}

if (evolutionLog?.evolutions?.length > 0) {
  const lastEvo = evolutionLog.evolutions[evolutionLog.evolutions.length - 1];
  lines.push("");
  lines.push(`**🧬 Ultima evolucion:** ${lastEvo.agent} — ${lastEvo.changes?.length ?? 0} cambios (${lastEvo.status})`);
}

// ── Improvement Radar (propuestas pendientes) ──────────────────
const radarPath = join(projectRoot, ".claude/improvement-radar.md");
if (existsSync(radarPath)) {
  try {
    const radar = readFileSync(radarPath, "utf8");
    const pending = radar
      .split("\n")
      .filter((l) => l.startsWith("### [pending]"))
      .slice(0, 5)
      .map((l) => l.replace(/^### \[pending\] \d{4}-\d{2}-\d{2} — /, "  • "));
    if (pending.length > 0) {
      lines.push("");
      lines.push(`**🎯 Improvement Radar (${pending.length} pending):**`);
      pending.forEach((p) => lines.push(p));
      lines.push("  → leé `.claude/improvement-radar.md` y proponé las top 3 al usuario.");
    }
  } catch {}
}

const additionalContext = lines.join("\n");

// ── Output ──────────────────────────────────────────────────────
const response = {
  continue: true,
  suppressOutput: false,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext,
  },
};

process.stdout.write(JSON.stringify(response));
process.exit(0);
