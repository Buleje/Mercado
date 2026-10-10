#!/usr/bin/env node
/**
 * evolve-autopilot-analyze.mjs — Motor determinístico del Autopilot Evolve.
 *
 * Corre desatendido (systemd --user timer, vía bsm-evolve-autopilot.sh). NO usa
 * la IA ni bypassa permisos: lee las métricas/patrones que el ecosistema ya
 * recolecta y produce un reporte priorizado de mejoras (PROPOSE-ONLY). El humano
 * revisa el reporte y decide correr `/evolve apply` / crear skills.
 *
 * Fuentes:
 *   .claude/agent-metrics.json      — telemetría de subagentes (hoy: vacía → finding)
 *   .claude/metrics/agents.jsonl    — dispatches crudos
 *   .claude/learning/patterns.json  — patrones detectados (co_edit_cluster, hot_file)
 *
 * Salidas:
 *   stdout                              — reporte humano (lo captura el log del wrapper)
 *   ~/.local/share/evolve-autopilot.report.md   — último reporte en markdown
 *   .claude/.state/evolve-autopilot-state.json   — patrones ya vistos (para deltas)
 *
 * Determinístico: sin Date.now()-randomness, sin red, sin deps externas.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";

const PROJECT = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const HOME = homedir();
const REPORT_MD = resolve(HOME, ".local/share/evolve-autopilot.report.md");
const STATE_FILE = resolve(PROJECT, ".claude/.state/evolve-autopilot-state.json");

const TOP_CLUSTERS = 15;
const TOP_HOTFILES = 15;
const MIN_CLUSTER_OCC = 3;
const MIN_HOTFILE_OCC = 10;

const now = new Date().toISOString();

function readJSON(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}
function readJSONL(path) {
  try {
    return readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ── Cargar fuentes ────────────────────────────────────────────────────────
const agentMetrics = readJSON(resolve(PROJECT, ".claude/agent-metrics.json"), null);
const dispatches = readJSONL(resolve(PROJECT, ".claude/metrics/agents.jsonl"));
const patternsDoc = readJSON(resolve(PROJECT, ".claude/learning/patterns.json"), { patterns: [] });
const patterns = Array.isArray(patternsDoc.patterns) ? patternsDoc.patterns : [];
const prevState = readJSON(STATE_FILE, { lastRun: null, knownPatternIds: [] });
const knownIds = new Set(prevState.knownPatternIds || []);

// ── Análisis 1: salud de la telemetría de agentes ─────────────────────────
const findings = [];
const dispatchesWithData = dispatches.filter(
  (d) => d.tokens_out != null || d.duration_ms != null || (d.agent && d.agent !== "unknown")
);
const telemetryHealthy = dispatchesWithData.length > 0;
if (!telemetryHealthy && dispatches.length > 50) {
  findings.push({
    priority: "high",
    type: "broken_telemetry",
    title: `Cost-logger de subagentes no captura datos (${dispatches.length} dispatches, todos agent="unknown" tokens=null)`,
    action:
      "Revisar subagent-cost-log.mjs: no resuelve el nombre del agente ni los tokens. Sin esto, /evolve no puede evaluar rendimiento de agentes (model up/downgrade, error rate).",
  });
}

// ── Análisis 2: co-edit clusters → candidatos a skill ─────────────────────
const clusters = patterns
  .filter((p) => p.type === "co_edit_cluster" && (p.occurrences || 0) >= MIN_CLUSTER_OCC)
  .filter((p) => p.status !== "done" && p.artifactGenerated !== "done")
  .map((p) => ({
    ...p,
    isNew: !knownIds.has(p.id),
    files: (p.files || []).filter((f) => !/node_modules|\.next\//.test(f)),
  }))
  .filter((p) => p.files.length >= 2)
  .sort((a, b) => (b.occurrences || 0) - (a.occurrences || 0))
  .slice(0, TOP_CLUSTERS);

// ── Análisis 3: hot files → candidatos a refactor/test ────────────────────
const hotFiles = patterns
  .filter((p) => p.type === "hot_file" && (p.occurrences || 0) >= MIN_HOTFILE_OCC)
  .map((p) => ({ ...p, isNew: !knownIds.has(p.id), file: (p.files || [])[0] || "?" }))
  .filter((p) => !/node_modules|\.next\//.test(p.file))
  .sort((a, b) => (b.occurrences || 0) - (a.occurrences || 0))
  .slice(0, TOP_HOTFILES);

// ── Deltas: patrones nuevos desde la última corrida ───────────────────────
const allCurrentIds = patterns.map((p) => p.id).filter(Boolean);
const newSinceLast = allCurrentIds.filter((id) => !knownIds.has(id));

// ── Construir reporte ─────────────────────────────────────────────────────
const L = [];
L.push(`# 🤖 Evolve Autopilot — reporte ${now}`);
L.push("");
L.push(`- Última corrida previa: ${prevState.lastRun || "(primera vez)"}`);
L.push(`- Patrones totales: **${patterns.length}** · nuevos desde la última corrida: **${newSinceLast.length}**`);
L.push(`- Dispatches de agentes registrados: ${dispatches.length} (con datos útiles: ${dispatchesWithData.length})`);
L.push("");

if (findings.length) {
  L.push("## ⚠️ Hallazgos de salud");
  for (const f of findings) {
    L.push(`- **[${f.priority.toUpperCase()}] ${f.title}**`);
    L.push(`  - ➜ ${f.action}`);
  }
  L.push("");
}

L.push(`## 🔗 Top co-edit clusters → candidatos a skill (occ ≥ ${MIN_CLUSTER_OCC})`);
if (!clusters.length) {
  L.push("_(ninguno por encima del umbral)_");
} else {
  L.push("| occ | nuevo | archivos | sugerencia |");
  L.push("|----:|:-----:|----------|------------|");
  for (const c of clusters) {
    const sug = (c.suggestedSkill || "").replace(/\s+/g, " ").slice(0, 80);
    L.push(`| ${c.occurrences} | ${c.isNew ? "🆕" : ""} | ${c.files.join("<br>")} | ${sug} |`);
  }
}
L.push("");

L.push(`## 🔥 Top hot files → candidatos a refactor/test (occ ≥ ${MIN_HOTFILE_OCC})`);
if (!hotFiles.length) {
  L.push("_(ninguno por encima del umbral)_");
} else {
  L.push("| occ | nuevo | archivo |");
  L.push("|----:|:-----:|---------|");
  for (const h of hotFiles) {
    L.push(`| ${h.occurrences} | ${h.isNew ? "🆕" : ""} | ${h.file} |`);
  }
}
L.push("");

L.push("## ▶️ Cómo actuar");
L.push("- Cluster con occ alto + archivos estables → `/evolve generate` o crear un skill que pre-cargue esos archivos.");
L.push("- Hot file con occ muy alto → candidato a extraer sub-componentes / agregar tests (ver code-quality §2).");
L.push("- Para que /evolve evalúe agentes (no solo patrones): arreglar el cost-logger (hallazgo arriba).");
L.push("- Este reporte es **propose-only**. Nada se modificó. Ejecutá las acciones vos cuando quieras.");
L.push("");

const report = L.join("\n");

// ── Persistir ─────────────────────────────────────────────────────────────
function ensureDir(p) {
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}
ensureDir(REPORT_MD);
ensureDir(STATE_FILE);
writeFileSync(REPORT_MD, report);
writeFileSync(
  STATE_FILE,
  JSON.stringify({ lastRun: now, knownPatternIds: allCurrentIds }, null, 0)
);

// stdout = lo captura el log del wrapper
console.log(report);
console.log(`\n[autopilot] reporte → ${REPORT_MD}`);
console.log(`[autopilot] estado → ${STATE_FILE} (${allCurrentIds.length} ids)`);
