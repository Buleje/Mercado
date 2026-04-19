#!/usr/bin/env node
/**
 * remove-italic-from-display.mjs
 *
 * Quita `italic` de las clases tailwind donde aparece con `font-display`.
 * Razón: Instrument Serif regular ya se ve elegante sin italic. El italic
 * queda reservado para acentos específicos aplicados manualmente.
 *
 * Casos manejados:
 *   "font-display ... italic"       → "font-display ..."
 *   "italic ... font-display"       → "... font-display"
 *   "font-display italic"           → "font-display"
 *   "italic font-display"           → "font-display"
 *   "font-display text-xl italic"   → "font-display text-xl"
 *
 * Uso:
 *   node scripts/remove-italic-from-display.mjs           (dry-run)
 *   node scripts/remove-italic-from-display.mjs --apply   (escribe)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");

const files = execSync(
  `grep -rl "font-display" --include="*.tsx" --include="*.ts" app components 2>/dev/null || true`,
  { cwd: ROOT, encoding: "utf8" },
)
  .split("\n")
  .filter((f) => f && !f.includes("node_modules") && !f.includes(".next") && !f.includes(".claude/worktrees"));

console.log(`Files con font-display: ${files.length}`);

let changed = 0;
for (const rel of files) {
  const abs = join(ROOT, rel);
  const before = readFileSync(abs, "utf8");
  // Buscamos className con font-display Y italic en la misma string.
  // Solo procesamos si el string tiene font-display. Quitamos italic.
  let after = before;

  // Caso 1: dentro de className="...font-display...italic..."
  after = after.replace(
    /className=\{?\s*cn?\s*\(?\s*["`]([^"`]*font-display[^"`]*)["`]/g,
    (match, classes) => {
      if (!/\bitalic\b/.test(classes)) return match;
      const cleaned = classes
        .replace(/\bitalic\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      // preservar estructura original del match
      return match.replace(classes, cleaned);
    },
  );

  // Caso 2: className directo con backtick + templates, más simple.
  after = after.replace(
    /(className=["'`])([^"'`]*)(["'`])/g,
    (match, open, classes, close) => {
      if (!classes.includes("font-display") || !/\bitalic\b/.test(classes)) return match;
      const cleaned = classes.replace(/\s*\bitalic\b\s*/g, " ").replace(/\s+/g, " ").trim();
      return `${open}${cleaned}${close}`;
    },
  );

  if (before !== after) {
    if (APPLY) writeFileSync(abs, after, "utf8");
    changed++;
    console.log(`  ✓ ${rel}`);
  }
}

console.log(`\n${APPLY ? "APLICADO" : "DRY-RUN"}: ${changed} cambiados`);
