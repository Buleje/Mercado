#!/usr/bin/env node
/**
 * hub-metrics-persist.mjs — Persiste metricas de rendimiento de Hubs.
 *
 * Invocado por el Director despues de cada Hub completion:
 *   node .claude/hooks/hub-metrics-persist.mjs <json-data>
 *
 * json-data format:
 * {
 *   "hub": "build|quality|ops",
 *   "agent": "backend",
 *   "task": "Add fiado endpoint",
 *   "tokens": 12000,
 *   "time_ms": 45000,
 *   "success": true,
 *   "gate_passed": true,
 *   "errors": []
 * }
 *
 * Writes to .claude/hub-metrics/metrics.json
 * Referencia: ADR-057
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(
  process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  "bodega-san-martin"
);
const METRICS_DIR = resolve(PROJECT_ROOT, ".claude/hub-metrics");
const METRICS_FILE = resolve(METRICS_DIR, "metrics.json");

// Parse input
const input = process.argv[2];
if (!input) {
  console.error("Usage: node hub-metrics-persist.mjs '<json-data>'");
  process.exit(2);
}

let data;
try {
  data = JSON.parse(input);
} catch {
  console.error("Invalid JSON input");
  process.exit(2);
}

// Read existing metrics
let metrics;
try {
  metrics = JSON.parse(readFileSync(METRICS_FILE, "utf8"));
} catch {
  // Initialize if doesn't exist
  mkdirSync(METRICS_DIR, { recursive: true });
  metrics = {
    version: 2,
    hubs: {
      build: { sessions: 0, success: 0, tokens: 0, time_ms: 0, gate_pass: 0, gate_total: 0 },
      quality: { sessions: 0, success: 0, tokens: 0, time_ms: 0, gate_pass: 0, gate_total: 0 },
      ops: { sessions: 0, success: 0, tokens: 0, time_ms: 0, gate_pass: 0, gate_total: 0 },
    },
    agents: {},
    sprints: [],
    learnings: { build: [], quality: [], ops: [] },
  };
}

const hub = data.hub;
if (!hub || !metrics.hubs[hub]) {
  console.error("Invalid hub:", hub);
  process.exit(2);
}

// Update hub-level metrics
const h = metrics.hubs[hub];
h.sessions += 1;
if (data.success) h.success += 1;
h.tokens += data.tokens || 0;
h.time_ms += data.time_ms || 0;
if (data.gate_passed !== undefined) {
  h.gate_total += 1;
  if (data.gate_passed) h.gate_pass += 1;
}

// Update agent-level metrics
const agent = data.agent;
if (agent) {
  if (!metrics.agents[agent]) {
    metrics.agents[agent] = { hub, tasks: 0, tokens: 0, errors: 0, time_ms: 0 };
  }
  const a = metrics.agents[agent];
  a.tasks += 1;
  a.tokens += data.tokens || 0;
  a.time_ms += data.time_ms || 0;
  if (data.errors && data.errors.length > 0) {
    a.errors += data.errors.length;
  }
}

// Record learnings from errors
if (data.errors && data.errors.length > 0) {
  const learnings = metrics.learnings[hub] || [];
  for (const err of data.errors) {
    learnings.push({
      date: new Date().toISOString(),
      task: data.task || "unknown",
      error: typeof err === "string" ? err : JSON.stringify(err),
    });
  }
  // Keep only last 50 learnings per hub
  metrics.learnings[hub] = learnings.slice(-50);
}

// Write back
writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
console.log(`Metrics updated: ${hub}/${agent || "hub-level"} — tokens:${data.tokens || 0} success:${data.success}`);
