#!/usr/bin/env node
/**
 * session-start-context.mjs — SessionStart hook (matcher: startup).
 *
 * Carga contexto fresco del proyecto Bodega San Martín al arrancar cada
 * sesión de Claude Code. Output va a stdout y Claude lo absorbe como
 * contexto adicional (ver docs hooks, campo "additionalContext").
 *
 * Lee:
 *  1. Últimos 5 commits (qué se hizo recientemente)
 *  2. git status (cambios sin commitear)
 *  3. Rama actual + upstream
 *  4. .husky/.last-test-run.log tail (resultado del post-commit hook)
 *  5. docs/TECH-DEBT.md primeras 40 líneas (ítems calientes)
 *  6. Presencia del checkpoint activo si existe
 *  7. Score de madurez del setup (si existe el archivo .claude/skills/self-improvement/EVOLUTION_LOG.md)
 *
 * Todo corre rápido (< 2s). Nada bloqueante.
 * Exit 0 siempre. Output JSON con hookSpecificOutput.additionalContext.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";

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

// ── Recolectar contexto ─────────────────────────────────────────────────
const branch = runGit("branch --show-current") || "(desconocido)";
const upstream = runGit("rev-parse --abbrev-ref @{upstream}") || "(sin upstream)";
const recentCommits = runGit("log --oneline -5");
const statusPorcelain = runGit("status --porcelain");
const filesDirty = statusPorcelain
  ? statusPorcelain.split("\n").filter((l) => l.trim()).length
  : 0;

const testLog = readIfExists(
  join(projectRoot, ".husky/.last-test-run.log"),
  2048
);
const testFailedFlag = existsSync(
  join(projectRoot, ".husky/.last-test-run.FAILED")
);

const techDebt = readIfExists(join(projectRoot, "docs/TECH-DEBT.md"), 2400);
const techDebtFirstLines = techDebt
  ? techDebt.split("\n").slice(0, 40).join("\n")
  : null;

const evolutionLog = readIfExists(
  join(projectRoot, ".claude/skills/self-improvement/EVOLUTION_LOG.md"),
  1500
);

// ── Construir mensaje ──────────────────────────────────────────────────
const lines = [];
lines.push("## 📍 Bodega San Martín — contexto fresco (SessionStart hook)");
lines.push("");
lines.push(`**Branch:** \`${branch}\` → \`${upstream}\``);
lines.push(`**Cambios sin commitear:** ${filesDirty} archivos`);
lines.push("");
if (recentCommits) {
  lines.push("**Últimos 5 commits:**");
  lines.push("```");
  lines.push(recentCommits);
  lines.push("```");
  lines.push("");
}

if (testLog) {
  lines.push(
    `**Post-commit test anterior:** ${testFailedFlag ? "❌ FALLÓ" : "✅ OK"} (log en \`.husky/.last-test-run.log\`)`
  );
  lines.push("");
}

if (filesDirty > 0) {
  lines.push(
    `⚠️  **Hay ${filesDirty} archivos con cambios sin commitear.** Considerá \`/checkpoint\` o \`/commit\` antes de empezar trabajo nuevo sobre otro módulo.`
  );
  lines.push("");
}

if (evolutionLog) {
  lines.push("**Últimas lecciones del EVOLUTION_LOG** (self-improvement skill):");
  lines.push("```");
  lines.push(evolutionLog.slice(0, 800));
  lines.push("```");
  lines.push("");
}

if (techDebtFirstLines) {
  lines.push("**Top de TECH-DEBT.md** (primeras 40 líneas):");
  lines.push("```markdown");
  lines.push(techDebtFirstLines);
  lines.push("```");
  lines.push("");
}

lines.push(
  "📚 Comandos rápidos: `/bodega-context-loader full` · `/test-all` · `/checkpoint` · `/agent-team` · `/audit-first`"
);
lines.push("");
lines.push(
  "🏛️ Recordá: operás en **arquitectura multi-agéntica nivel 3** (Orquestador → Agencias → Empleados) con A2A Protocol. Ver `~/.claude/projects/C--Users-Usuario/memory/feedback_multi_agent_hierarchy_level3.md`"
);

const additionalContext = lines.join("\n");

// ── Output JSON spec-compliant ──────────────────────────────────────────
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
