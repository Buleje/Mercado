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

// ── Pendiente real = la PRIMERA entrada de SESSION_HANDOFF.md ────
// Antes salía de `session-state.json → nextActions`, que nadie reescribía:
// stop-checkpoint lo arrastraba con `...existingState` y cada sesión arrancaba
// (hasta 2026-09-23) con los pendientes de ABRIL (drag&drop, Plan Fundador).
// El handoff es lo que la sesión anterior escribió a mano: título + su lista
// «Para retomar». Más de 7 días sin tocarse = ya no es «la sesión anterior».
try {
  const handoffPath = join(projectRoot, "SESSION_HANDOFF.md");
  const edadDias = (Date.now() - statSync(handoffPath).mtimeMs) / 86_400_000;
  if (edadDias < 7) {
    const bloque = readFileSync(handoffPath, "utf8").split(/^# SESSION HANDOFF/m)[1] ?? "";
    const titulo = bloque.split("\n")[0].replace(/^\s*[—-]\s*/, "").trim();
    const desde = bloque.search(/para retomar/i);
    const pasos = (desde >= 0 ? bloque.slice(desde) : bloque)
      .split("\n")
      .filter((l) => /^\d+\.\s/.test(l))
      .slice(0, 3)
      .map((l) => (l.length > 220 ? `${l.slice(0, 217)}…` : l));
    if (titulo) {
      lines.push("");
      lines.push(`**📋 Handoff (${titulo}):**`);
      pasos.forEach((p) => lines.push(`  ${p}`));
      lines.push("  → detalle en `SESSION_HANDOFF.md` (sólo la primera entrada está vigente).");
    }
  }
} catch {}

if (filesDirty > 5) {
  lines.push("");
  lines.push(`⚠️ ${filesDirty} archivos sin commitear. Considerar \`/commit\`.`);
}

if (evolutionLog?.evolutions?.length > 0) {
  const lastEvo = evolutionLog.evolutions[evolutionLog.evolutions.length - 1];
  lines.push("");
  lines.push(`**🧬 Ultima evolucion:** ${lastEvo.agent} — ${lastEvo.changes?.length ?? 0} cambios (${lastEvo.status})`);
}

// ── Paralelismo de la sesión anterior ──────────────────────────
// Medido 2026-09-19 «1,00 por mensaje» era un artefacto del conteo por línea;
// recontado por `message.id` (2026-09-23): 1,20 histórico, 11,9 % con 2+.
// El wall-clock ≈ número de TANDAS, así que la cifra va acá arriba.
try {
  const out = execSync(`node ${join(projectRoot, "scripts/medir-paralelismo.mjs")} --json`, {
    encoding: "utf8", timeout: 4000,
  });
  const p = JSON.parse(out);
  if (p.llamadas > 20) {
    const enMeta = p.ratio >= p.meta;
    lines.push("");
    lines.push(
      `**⚡ Paralelismo (sesión anterior):** ${p.ratio.toFixed(2)} tool-calls/mensaje ` +
      `${enMeta ? "✅" : `⚠️ meta ${p.meta}`} · ${p.pctMulti}% de mensajes con 2+ llamadas · ` +
      `${p.ratioAgente.toFixed(2)} subagentes por tanda`
    );
    if (!enMeta) {
      lines.push("  → lo independiente viaja JUNTO en un mensaje (lecturas, greps, gates, agentes con archivos disjuntos).");
    }
  }
} catch {}

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
