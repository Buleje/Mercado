#!/usr/bin/env node
/**
 * pre-compact-skill-suggester — antes de compactar el contexto, identifica
 * qué skills SÍ vale la pena mantener cargados post-compact.
 *
 * Cómo funciona:
 * - Lee el transcript de la sesión actual (si está disponible vía env)
 * - Detecta qué skills se invocaron (via /skill o auto-routing)
 * - Detecta keywords frecuentes que apuntan a un dominio
 * - Imprime al stderr top-5 skills a "keep loaded" + razón
 *
 * El operador (Claude) lee esto en el próximo turno tras compact y decide
 * qué skills re-cargar manualmente.
 *
 * NOTA: este hook NO modifica el contexto — solo informa. La compactación
 * la hace el harness; este es advice-only.
 */
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SKILLS_DIR = path.join(PROJECT_ROOT, ".claude", "skills");
const TELEMETRY_FILE = path.join(PROJECT_ROOT, ".claude", ".skill-usage.jsonl");

// Keywords → skill mapping (top mappings, mantener corto)
const KEYWORD_HINTS = {
  // dominio
  checkout: ["checkout-squad", "outcome-evaluator"],
  pago: ["checkout-squad", "outcome-evaluator"],
  yape: ["checkout-squad"],
  fiado: ["multi-tenant-guard"],
  marketplace: ["bsm-typography-rules", "bsm-design-system"],
  pedido: ["bsm-design-system"],
  // database
  database: ["db-sanity", "migration-planner", "outcome-evaluator"],
  prisma: ["migration-planner", "db-sanity"],
  schema: ["migration-planner", "audit-first"],
  migration: ["migration-planner", "bulk-safe-migrate"],
  // performance/perf
  performance: ["health-check", "deploy-check"],
  lento: ["health-check"],
  // seguridad
  security: ["multi-tenant-guard"],
  auth: ["multi-tenant-guard", "audit-first"],
  // ui
  dark: ["bsm-design-system", "bsm-typography-rules"],
  responsive: ["bsm-design-system", "bsm-typography-rules"],
  ui: ["bsm-design-system", "bsm-typography-rules"],
  // operativos
  deploy: ["deploy-check", "verify"],
  test: ["test-all", "fix-tests", "verify"],
  commit: ["commit", "review"],
  pr: ["pr-describer", "review"],
  // agentic
  parallel: ["turbo-parallel", "parallel-work", "agentic-loops"],
  agent: ["agentic-loops", "multi-agent-bg"],
  // memoria
  memory: ["dreaming", "session-handoff"],
};

function readPayload() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getTranscriptText(payload) {
  // PreCompact payload tiene tipicamente { transcript_path, ... }
  const tp = payload?.transcript_path;
  if (tp && fs.existsSync(tp)) {
    try {
      const stat = fs.statSync(tp);
      // No leer más de 200KB del tail (los últimos turns importan más)
      const sz = stat.size;
      const start = Math.max(0, sz - 200_000);
      const fd = fs.openSync(tp, "r");
      const buf = Buffer.alloc(sz - start);
      fs.readSync(fd, buf, 0, sz - start, start);
      fs.closeSync(fd);
      return buf.toString("utf8");
    } catch {}
  }
  return "";
}

function getTelemetryUsage() {
  if (!fs.existsSync(TELEMETRY_FILE)) return {};
  const counts = {};
  try {
    const data = fs.readFileSync(TELEMETRY_FILE, "utf8");
    const cutoff = Date.now() - 6 * 60 * 60 * 1000; // últimas 6h
    for (const line of data.split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.t < cutoff) continue;
        counts[rec.skill] = (counts[rec.skill] || 0) + 1;
      } catch {}
    }
  } catch {}
  return counts;
}

function detectKeywords(text) {
  const t = text.toLowerCase();
  const hits = {};
  for (const [kw, skills] of Object.entries(KEYWORD_HINTS)) {
    const re = new RegExp(`\\b${kw}\\b`, "g");
    const matches = t.match(re);
    if (matches && matches.length > 0) {
      for (const sk of skills) {
        hits[sk] = (hits[sk] || 0) + matches.length;
      }
    }
  }
  return hits;
}

function rankSkills({ usage, keywords }) {
  const scores = {};
  // Telemetría pesa 3x
  for (const [sk, n] of Object.entries(usage)) {
    scores[sk] = (scores[sk] || 0) + n * 3;
  }
  // Keywords pesan 1x
  for (const [sk, n] of Object.entries(keywords)) {
    scores[sk] = (scores[sk] || 0) + n;
  }
  return Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
}

function skillExists(name) {
  return fs.existsSync(path.join(SKILLS_DIR, name, "SKILL.md"));
}

function main() {
  const payload = readPayload();
  const text = getTranscriptText(payload);
  const usage = getTelemetryUsage();
  const keywords = detectKeywords(text);
  const top = rankSkills({ usage, keywords });

  if (top.length === 0) {
    process.exit(0);
  }

  const lines = [
    "",
    "💡 pre-compact-skill-suggester — top-5 skills a re-cargar tras compact:",
  ];
  for (const [sk, score] of top) {
    if (!skillExists(sk)) continue;
    const why = usage[sk]
      ? `${usage[sk]} usos recientes${keywords[sk] ? ` + ${keywords[sk]} keywords` : ""}`
      : `${keywords[sk]} keywords en contexto`;
    lines.push(`   • ${sk}  —  ${why}`);
  }
  lines.push(
    "   (info-only — el operador decide post-compact si re-carga)",
    ""
  );
  console.error(lines.join("\n"));
  process.exit(0);
}

try {
  main();
} catch {
  process.exit(0);
}
