#!/usr/bin/env node
/**
 * regression-check.mjs — Post-deploy regression detector.
 *
 * Compares current build metrics against stored baseline.
 * Run by optimizer agent after each deploy:
 *   node .claude/hooks/regression-check.mjs
 *
 * Exit codes:
 *   0 = no regressions
 *   1 = regressions detected (output details)
 *
 * Baseline stored in .claude/hub-metrics/baseline.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const PROJECT = resolve(
  process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  "bodega-san-martin"
);
const BASELINE_FILE = resolve(PROJECT, ".claude/hub-metrics/baseline.json");

// Collect current metrics
function collectMetrics() {
  const metrics = {
    timestamp: new Date().toISOString(),
    bundleSize: 0,
    testCount: 0,
    coverage: 0,
  };

  // Bundle size (gzip total of .next/static/chunks)
  try {
    const output = execSync(
      'find .next/static/chunks -name "*.js" -exec gzip -c {} \\; | wc -c',
      { cwd: PROJECT, stdio: "pipe" }
    ).toString().trim();
    metrics.bundleSize = parseInt(output) || 0;
  } catch {
    // Build not available, skip
  }

  // Test count from vitest
  try {
    const output = execSync("npx vitest run --reporter=json 2>/dev/null || true", {
      cwd: PROJECT,
      stdio: "pipe",
      timeout: 120_000,
    }).toString();
    const json = JSON.parse(output);
    metrics.testCount = json.numTotalTests || 0;
  } catch {
    // Tests not runnable, skip
  }

  return metrics;
}

// Compare against baseline
function checkRegressions(current, baseline) {
  const issues = [];

  // Bundle size: warn if increased > 10%
  if (baseline.bundleSize > 0 && current.bundleSize > 0) {
    const delta = ((current.bundleSize - baseline.bundleSize) / baseline.bundleSize) * 100;
    if (delta > 10) {
      issues.push({
        metric: "bundleSize",
        baseline: `${Math.round(baseline.bundleSize / 1024)}KB`,
        current: `${Math.round(current.bundleSize / 1024)}KB`,
        delta: `+${delta.toFixed(1)}%`,
        severity: delta > 25 ? "critical" : "warning",
      });
    }
  }

  // Test count: should never decrease
  if (baseline.testCount > 0 && current.testCount < baseline.testCount) {
    issues.push({
      metric: "testCount",
      baseline: baseline.testCount,
      current: current.testCount,
      delta: `${current.testCount - baseline.testCount}`,
      severity: "warning",
    });
  }

  return issues;
}

// Main
const current = collectMetrics();

if (!existsSync(BASELINE_FILE)) {
  // First run — set baseline
  writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2));
  console.log(JSON.stringify({ status: "baseline_created", metrics: current }, null, 2));
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
const issues = checkRegressions(current, baseline);

// Update baseline
writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2));

const result = {
  status: issues.length > 0 ? "regressions_found" : "clean",
  timestamp: current.timestamp,
  baseline_from: baseline.timestamp,
  issues,
  metrics: { current, baseline },
};

console.log(JSON.stringify(result, null, 2));
process.exit(issues.length > 0 ? 1 : 0);
