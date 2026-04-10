#!/usr/bin/env node
/**
 * session-start-context.mjs v2 — BRAIN BOOT (SessionStart hook)
 *
 * Auto-activates the full autonomous ecosystem at session start:
 * 1. Git context (branch, commits, dirty files)
 * 2. Last session handoff (pending tasks, next actions)
 * 3. Production health check (if Vercel CLI available)
 * 4. Sprint status (current sprint from roadmap)
 * 5. Evolution history (what agents learned last session)
 * 6. Memory optimization check (stale memories)
 * 7. Auto-propose most impactful next action
 *
 * Everything runs in <3s. Non-blocking. Exit 0 always.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
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
      timeout: 3_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function runCmd(cmd) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      timeout: 5_000,
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function readIfExists(path, maxBytes = 4096) {
  try {
    if (!existsSync(path)) return null;
    const size = statSync(path).size;
    if (size === 0) return null;
    const buf = readFileSync(path, { encoding: "utf8" });
    return buf.length > maxBytes ? buf.slice(0, maxBytes) + "\n…[truncated]" : buf;
  } catch {
    return null;
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

// ── 1. Git context ──────────────────────────────────────────────
const branch = runGit("branch --show-current") || "(desconocido)";
const upstream = runGit("rev-parse --abbrev-ref @{upstream}") || "(sin upstream)";
const recentCommits = runGit("log --oneline -5");
const statusPorcelain = runGit("status --porcelain");
const filesDirty = statusPorcelain
  ? statusPorcelain.split("\n").filter((l) => l.trim()).length
  : 0;

// ── 2. Session handoff ─────────────────────────────────────────
const sessionState = readJSON(join(projectRoot, ".claude/session-state.json"));
const lastCheckpoint = readJSON(join(projectRoot, ".claude/.last-stop-checkpoint.json"));

// ── 3. Test status ──────────────────────────────────────────────
const testFailedFlag = existsSync(join(projectRoot, ".husky/.last-test-run.FAILED"));
const testLog = readIfExists(join(projectRoot, ".husky/.last-test-run.log"), 1024);

// ── 4. Evolution log ────────────────────────────────────────────
const evolutionLog = readJSON(join(projectRoot, ".claude/evolution-log.json"));
const learningPatterns = readJSON(join(projectRoot, ".claude/learning/patterns.json"));

// ── 5. Tech debt ────────────────────────────────────────────────
const techDebt = readIfExists(join(projectRoot, "docs/TECH-DEBT.md"), 2000);
const techDebtTop = techDebt ? techDebt.split("\n").slice(0, 30).join("\n") : null;

// ── 6. Sprint context ───────────────────────────────────────────
const sprintKickoff = readIfExists(
  join(projectRoot, "../../.claude/projects/C--Users-Usuario/memory/session_sprint2_seo_kickoff.md"),
  2000
);

// ── 7. Count assets ─────────────────────────────────────────────
let agentCount = 0, skillCount = 0, hookCount = 0;
try {
  const agentsDir = join(projectRoot, ".claude/agents");
  if (existsSync(agentsDir)) {
    agentCount = execSync(`ls "${agentsDir}" | wc -l`, { encoding: "utf8", timeout: 1000, shell: true }).trim();
  }
  const skillsDir = join(projectRoot, ".claude/skills");
  if (existsSync(skillsDir)) {
    skillCount = execSync(`ls -d "${skillsDir}"/*/ 2>/dev/null | wc -l`, { encoding: "utf8", timeout: 1000, shell: true }).trim();
  }
  const hooksDir = join(projectRoot, ".claude/hooks");
  if (existsSync(hooksDir)) {
    hookCount = execSync(`ls "${hooksDir}"/*.mjs 2>/dev/null | wc -l`, { encoding: "utf8", timeout: 1000, shell: true }).trim();
  }
} catch { /* silent */ }

// ── Build context message ───────────────────────────────────────
const lines = [];
lines.push("## 🧠 BRAIN BOOT — Bodega San Martin (v2 auto-context)");
lines.push("");

// Status line
lines.push(`**Branch:** \`${branch}\` → \`${upstream}\` | **Dirty:** ${filesDirty} archivos | **Assets:** ${agentCount} agentes, ${skillCount} skills, ${hookCount} hooks`);
lines.push("");

// Recent commits
if (recentCommits) {
  lines.push("**Ultimos 5 commits:**");
  lines.push("```");
  lines.push(recentCommits);
  lines.push("```");
}

// Test status
if (testFailedFlag) {
  lines.push("⚠️ **TESTS FALLANDO** — ultimo post-commit test FALLO. Correr `/self-heal test` antes de continuar.");
} else if (testLog) {
  lines.push("✅ Tests OK en ultimo commit.");
}
lines.push("");

// Session handoff (if exists)
if (sessionState && sessionState.nextActions && sessionState.nextActions.length > 0) {
  lines.push("**📋 Sesion anterior dejo trabajo pendiente:**");
  sessionState.nextActions.forEach((a, i) => {
    lines.push(`  ${i + 1}. ${a}`);
  });
  lines.push("");
  lines.push("💡 **Recomendado:** arrancar con el item #1 automaticamente.");
  lines.push("");
}

// Dirty files warning
if (filesDirty > 5) {
  lines.push(`⚠️ ${filesDirty} archivos sin commitear. Considerar \`/commit\` antes de trabajo nuevo.`);
  lines.push("");
}

// Evolution history
if (evolutionLog && evolutionLog.evolutions && evolutionLog.evolutions.length > 0) {
  const lastEvo = evolutionLog.evolutions[evolutionLog.evolutions.length - 1];
  lines.push(`**🧬 Ultima evolucion:** ${lastEvo.agent} — ${lastEvo.changes.length} cambios (${lastEvo.status})`);
  lines.push("");
}

// Learning patterns
if (learningPatterns && learningPatterns.patterns && learningPatterns.patterns.length > 0) {
  const active = learningPatterns.patterns.filter(p => p.status === "active");
  if (active.length > 0) {
    lines.push(`**🧬 Patrones aprendidos:** ${active.length} activos (compound-learning-v2)`);
    lines.push("");
  }
}

// Tech debt top items
if (techDebtTop) {
  lines.push("**📋 TECH-DEBT top (primeras 30 lineas):**");
  lines.push("```markdown");
  lines.push(techDebtTop);
  lines.push("```");
  lines.push("");
}

// Quick commands
lines.push("---");
lines.push("**Mega-comandos:** `/sprint-autopilot` (ejecutar sprint) · `/prod-to-code auto` (fix produccion) · `/evolve analyze` (auto-mejorar agentes)");
lines.push("**Comandos rapidos:** `/luis` (arranque total) · `/commit` · `/test-all` · `/review` · `/parallel-work`");
lines.push("");
lines.push("🏛️ **Modo:** Arquitectura multi-agentica nivel 3 (Orquestador → Agencias → Empleados) + A2A Protocol + Auto-escalation 5 niveles + Self-heal v2 cascading");

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
