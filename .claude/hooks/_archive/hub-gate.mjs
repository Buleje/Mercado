#!/usr/bin/env node
/**
 * hub-gate.mjs — Gate automatico para transiciones entre Hubs.
 *
 * El Director lo invoca via Bash despues de que un Hub completa:
 *   node .claude/hooks/hub-gate.mjs build    → lint + tsc
 *   node .claude/hooks/hub-gate.mjs quality  → test + build
 *   node .claude/hooks/hub-gate.mjs ops      → health check
 *
 * Exit codes:
 *   0 = gate passed
 *   1 = gate failed (output dice que fallo)
 *   2 = invalid arguments
 *
 * Referencia: ADR-057 Hub & Spoke Architecture
 */
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(
  process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  "bodega-san-martin"
);

const hub = process.argv[2];

if (!hub || !["build", "quality", "ops"].includes(hub)) {
  console.error("Usage: node hub-gate.mjs <build|quality|ops>");
  process.exit(2);
}

const GATES = {
  build: [
    { cmd: "npm run lint", label: "ESLint" },
    { cmd: "npx tsc --noEmit", label: "TypeScript" },
  ],
  quality: [
    { cmd: "npm run test -- --run", label: "Vitest" },
    { cmd: "npm run build", label: "Next.js Build" },
  ],
  ops: [
    { cmd: "echo 'Health check placeholder — observer verifies in production'", label: "Health Check" },
  ],
};

const gates = GATES[hub];
const results = [];
let allPassed = true;

for (const gate of gates) {
  try {
    execSync(gate.cmd, {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
      timeout: 300_000, // 5 min max per gate
    });
    results.push({ label: gate.label, status: "PASS" });
  } catch (err) {
    allPassed = false;
    const stderr = err.stderr?.toString().slice(-500) || "";
    const stdout = err.stdout?.toString().slice(-500) || "";
    results.push({
      label: gate.label,
      status: "FAIL",
      error: stderr || stdout || "Unknown error",
    });
  }
}

// Output results as JSON for Director to parse
const output = {
  hub,
  passed: allPassed,
  timestamp: new Date().toISOString(),
  gates: results,
};

console.log(JSON.stringify(output, null, 2));
process.exit(allPassed ? 0 : 1);
