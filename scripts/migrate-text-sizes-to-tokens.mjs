#!/usr/bin/env node
/**
 * migrate-text-sizes-to-tokens.mjs
 *
 * Reemplaza tamaños de texto arbitrarios por tokens del DS (ADR-070).
 *   text-[10px]  → text-[length:var(--ts-2xs)]
 *   text-[9px]   → text-[length:var(--ts-2xs)]
 *   text-[11px]  → text-[length:var(--ts-2xs)]
 *   text-[13px]  → text-xs (13px ≈ 12-14)
 *
 * Uso:
 *   node scripts/migrate-text-sizes-to-tokens.mjs           (dry-run)
 *   node scripts/migrate-text-sizes-to-tokens.mjs --apply   (escribe)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");

const REPLACEMENTS = [
  { from: /text-\[10px\]/g, to: "text-[length:var(--ts-2xs)]" },
  { from: /text-\[9px\]/g, to: "text-[length:var(--ts-2xs)]" },
  { from: /text-\[11px\]/g, to: "text-[length:var(--ts-2xs)]" },
];

const files = execSync(
  `grep -rEl "text-\\[9px\\]|text-\\[10px\\]|text-\\[11px\\]" --include="*.tsx" --include="*.ts" app components 2>/dev/null || true`,
  { cwd: ROOT, encoding: "utf8" },
)
  .split("\n")
  .filter((f) => f && !f.includes("node_modules") && !f.includes(".next") && !f.includes(".claude/worktrees"));

console.log(`Files con tamaños arbitrarios: ${files.length}`);

let changed = 0;
for (const rel of files) {
  const abs = join(ROOT, rel);
  const before = readFileSync(abs, "utf8");
  let after = before;
  for (const { from, to } of REPLACEMENTS) {
    after = after.replace(from, to);
  }
  if (before !== after) {
    if (APPLY) writeFileSync(abs, after, "utf8");
    changed++;
    console.log(`  ✓ ${rel}`);
  }
}

console.log(`\n${APPLY ? "APLICADO" : "DRY-RUN"}: ${changed} cambiados`);
