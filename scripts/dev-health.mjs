#!/usr/bin/env node
/**
 * dev:health — dashboard one-shot pre-deploy / pre-commit.
 *
 * Corre en secuencia:
 *   1. tsc --noEmit      → errores de tipos
 *   2. lint               → errores ESLint
 *   3. vitest run         → tests unitarios
 *   4. dev:duplicates     → shadows
 *   5. dev:dangers:check  → integridad skills
 *
 * Formato: tabla con ✓ / ✗ por check + tiempo. Exit 1 si alguno falla crítico,
 * 0 si todo verde. Checks no-bloqueantes (duplicates) se marcan ⚠ pero no cortan.
 *
 * Uso:
 *   npm run dev:health
 *   SKIP_TESTS=1 npm run dev:health   # omite vitest (fast)
 *   ONLY=tsc,lint npm run dev:health  # solo esos
 */

import { spawnSync } from "node:child_process";

const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const SKIP_TESTS = process.env.SKIP_TESTS === "1";

const CHECKS = [
  {
    id: "tsc",
    label: "TypeScript check",
    cmd: ["npx", "tsc", "--noEmit", "--skipLibCheck"],
    critical: true,
  },
  {
    id: "lint",
    label: "ESLint",
    cmd: ["npx", "eslint", "--max-warnings", "200"],
    critical: true,
  },
  {
    id: "tests",
    label: "Unit tests (vitest)",
    cmd: ["npx", "vitest", "run", "--passWithNoTests"],
    critical: true,
    skip: SKIP_TESTS,
  },
  {
    id: "dangers",
    label: "Danger zones skills integrity",
    cmd: ["node", "scripts/check-zone-skills.mjs"],
    critical: true,
  },
  {
    id: "duplicates",
    label: "Shadow duplicates audit",
    cmd: ["node", "scripts/find-duplicates.mjs"],
    critical: false,
  },
];

function run(check) {
  const t0 = Date.now();
  const res = spawnSync(check.cmd[0], check.cmd.slice(1), {
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    windowsHide: true,
  });
  const ms = Date.now() - t0;
  const ok = res.status === 0;
  const out = (res.stdout?.toString() ?? "").trim();
  const err = (res.stderr?.toString() ?? "").trim();
  return { id: check.id, label: check.label, ok, ms, out, err, critical: check.critical };
}

const results = [];
const startAll = Date.now();

for (const check of CHECKS) {
  if (ONLY && !ONLY.includes(check.id)) continue;
  if (check.skip) {
    console.log(`[SKIP] ${check.label}`);
    continue;
  }
  process.stdout.write(`[RUN]  ${check.label}... `);
  const r = run(check);
  results.push(r);
  const icon = r.ok ? "✓" : r.critical ? "✗" : "⚠";
  const color = r.ok ? "\x1b[32m" : r.critical ? "\x1b[31m" : "\x1b[33m";
  console.log(`${color}${icon}\x1b[0m (${(r.ms / 1000).toFixed(1)}s)`);
}

const totalMs = Date.now() - startAll;
const fails = results.filter((r) => !r.ok && r.critical);
const warns = results.filter((r) => !r.ok && !r.critical);

console.log("\n──────────────────────────────");
console.log(`Total: ${(totalMs / 1000).toFixed(1)}s`);
console.log(`  critical pass: ${results.filter((r) => r.ok).length}/${results.length}`);
if (warns.length > 0) {
  console.log(`  warnings: ${warns.length}`);
  for (const w of warns) console.log(`    - ${w.label}`);
}

if (fails.length > 0) {
  console.log(`\nFAILED (${fails.length}):`);
  for (const f of fails) {
    console.log(`\n=== ${f.label} ===`);
    if (f.out) console.log(f.out.split("\n").slice(-20).join("\n"));
    if (f.err) console.log(f.err.split("\n").slice(-10).join("\n"));
  }
  process.exit(1);
}

console.log("\n✅ dev:health OK — listo para commit/deploy.");
process.exit(0);
