#!/usr/bin/env node
/**
 * rename-bodega-san-martin.mjs
 *
 * Reemplaza la marca legacy "Bodega San Martín" / "Bodega San Martin" por
 * "Buleje" en todos los archivos (.ts/.tsx/.md) del proyecto, excepto:
 *   - README/CHANGELOG histórico
 *   - Comentarios que explicitan legacy origin
 *   - node_modules, .next, .claude/worktrees
 *
 * Mantiene contextos donde "Bodega" (sustantivo común) es legítimo.
 * Solo reemplaza la MARCA completa.
 *
 * Uso:
 *   node scripts/rename-bodega-san-martin.mjs           (dry-run)
 *   node scripts/rename-bodega-san-martin.mjs --apply   (escribe)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");

// Solo reemplazamos la MARCA completa (no "bodega" sola, que es sustantivo).
const REPLACEMENTS = [
  { from: /Bodega San Martín/g, to: "Buleje" },
  { from: /Bodega San Martin/g, to: "Buleje" },
  { from: /bodega san martín/g, to: "Buleje" },
  { from: /bodega san martin/g, to: "Buleje" },
  { from: /BodegaSanMartin/g, to: "Buleje" },
];

const EXCLUDES = [
  "node_modules/",
  ".next/",
  ".claude/worktrees/",
  "storybook-static/",
  "prisma/migrations/",
  "lib/generated/",
  "scripts/rename-bodega-san-martin.mjs",
];

const files = execSync(
  `grep -rlE "Bodega San Mart[ií]n|bodega san mart[ií]n|BodegaSanMartin" --include="*.ts" --include="*.tsx" --include="*.md" --include="*.json" app components lib packages 2>/dev/null || true`,
  { cwd: ROOT, encoding: "utf8" },
)
  .split("\n")
  .filter((f) => f && !EXCLUDES.some((e) => f.includes(e)));

console.log(`Files con "Bodega San Martín": ${files.length}`);

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
