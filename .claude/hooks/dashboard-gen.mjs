#!/usr/bin/env node
/**
 * dashboard-gen.mjs — Regenerates dashboard.html with fresh metrics data.
 *
 * Run after metrics are updated:
 *   node .claude/hooks/dashboard-gen.mjs
 *
 * Reads metrics.json and embeds it into dashboard.html as inline JS.
 * This avoids CORS issues when opening dashboard from file:// protocol.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT = resolve(
  process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  "bodega-san-martin"
);
const METRICS_FILE = resolve(PROJECT, ".claude/hub-metrics/metrics.json");
const DASHBOARD_FILE = resolve(PROJECT, ".claude/hub-metrics/dashboard.html");

try {
  const metrics = readFileSync(METRICS_FILE, "utf8").trim();
  // Validate JSON
  JSON.parse(metrics);

  let html = readFileSync(DASHBOARD_FILE, "utf8");

  // Replace the METRICS_DATA line
  html = html.replace(
    /const METRICS_DATA = .+;/,
    `const METRICS_DATA = ${metrics};`
  );

  writeFileSync(DASHBOARD_FILE, html);
  console.log("Dashboard updated with fresh metrics data");
} catch (err) {
  console.error("Error updating dashboard:", err.message);
  process.exit(1);
}
