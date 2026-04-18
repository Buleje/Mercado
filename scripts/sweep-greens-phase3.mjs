#!/usr/bin/env node
/**
 * ADR-074 Phase 3 — Bulk sweep de verdes non-brand a tokens semánticos.
 *
 * Scope: components/admin/** y app/admin/**
 * Excluye chart-theme.ts (palettes categóricas) y tenant-branding dinámico.
 *
 * Regla: token semántico --data-success ya vale teal Buleje (#00B4A6 / #2dd4bf).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const TARGETS = ["components/admin", "app/admin"];
const EXCLUDE_SUBSTR = ["chart-theme", "tenant-branding", "tenant-brand"];
const ALLOW_EXT = new Set([".tsx", ".ts", ".jsx", ".js"]);

// Rules: string.replace with RegExp. Each rule independent.
const RULES = [
  // text-emerald/green any shade 100..950 (with optional /opacity)
  { re: /\btext-(?:emerald|green)-(?:100|200|300|400|500|600|700|800|900|950)(?:\/\d+)?\b/g, to: "text-[var(--data-success)]" },
  // bg-emerald/green 50/100/200 (soft backgrounds) incl. /opacity
  { re: /\bbg-(?:emerald|green)-(?:50|100|200)(?:\/\d+)?\b/g, to: "bg-[var(--accent-soft)]" },
  // bg-emerald/green strong shades 300..700 incl. /opacity -> accent-soft
  { re: /\bbg-(?:emerald|green)-(?:300|400|500|600|700)(?:\/\d+)?\b/g, to: "bg-[var(--accent-soft)]" },
  // bg-emerald/green deep shades 800/900/950 incl. /opacity (usually dark mode) -> accent-muted
  { re: /\bbg-(?:emerald|green)-(?:800|900|950)(?:\/\d+)?\b/g, to: "bg-[var(--accent-muted)]" },
  // border-emerald/green any shade incl. /opacity
  { re: /\bborder-(?:emerald|green)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\/\d+)?\b/g, to: "border-[var(--data-success)]/30" },
  // ring-emerald/green any shade 100..900
  { re: /\bring-(?:emerald|green)-(?:100|200|300|400|500|600|700|800|900)(?:\/\d+)?\b/g, to: "ring-[var(--data-success)]/40" },
  // gradient directional classes (from/to/via)
  { re: /\bfrom-(?:emerald|green)-(?:50|100|200|300|400|500|600|700|800|900)(?:\/\d+)?\b/g, to: "from-[var(--data-success)]/20" },
  { re: /\bto-(?:emerald|green)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\/\d+)?\b/g, to: "to-[var(--data-success)]/10" },
  { re: /\bvia-(?:emerald|green)-(?:50|100|200|300|400|500|600|700|800|900)(?:\/\d+)?\b/g, to: "via-[var(--data-success)]/15" },
  // fill / stroke for SVG
  { re: /\bfill-(?:emerald|green)-(?:300|400|500|600|700)(?:\/\d+)?\b/g, to: "fill-[var(--data-success)]" },
  { re: /\bstroke-(?:emerald|green)-(?:300|400|500|600|700)(?:\/\d+)?\b/g, to: "stroke-[var(--data-success)]" },
  // decoration/outline
  { re: /\bdecoration-(?:emerald|green)-(?:300|400|500|600|700)(?:\/\d+)?\b/g, to: "decoration-[var(--data-success)]" },
  { re: /\boutline-(?:emerald|green)-(?:300|400|500|600|700)(?:\/\d+)?\b/g, to: "outline-[var(--data-success)]" },
  // shadow-emerald / shadow-green
  { re: /\bshadow-(?:emerald|green)-(?:300|400|500|600|700)(?:\/\d+)?\b/g, to: "shadow-[var(--data-success)]/20" },
  // divide-emerald / divide-green (list dividers)
  { re: /\bdivide-(?:emerald|green)-(?:100|200|300|400|500|600|700)(?:\/\d+)?\b/g, to: "divide-[var(--data-success)]/20" },
  // accent-emerald / accent-green (form accents)
  { re: /\baccent-(?:emerald|green)-(?:300|400|500|600|700)(?:\/\d+)?\b/g, to: "accent-[var(--data-success)]" },
  // placeholder-emerald
  { re: /\bplaceholder-(?:emerald|green)-(?:300|400|500|600|700)(?:\/\d+)?\b/g, to: "placeholder-[var(--data-success)]" },
];

function shouldSkip(filepath) {
  const low = relative(ROOT, filepath).toLowerCase().replaceAll(sep, "/");
  for (const s of EXCLUDE_SUBSTR) if (low.includes(s)) return true;
  return false;
}

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === ".turbo") continue;
      walk(p, acc);
    } else {
      const dot = name.lastIndexOf(".");
      if (dot < 0) continue;
      if (!ALLOW_EXT.has(name.slice(dot))) continue;
      acc.push(p);
    }
  }
  return acc;
}

let touched = 0;
let changes = 0;
const changedFiles = [];

for (const target of TARGETS) {
  const base = join(ROOT, target);
  const files = walk(base);
  for (const f of files) {
    if (shouldSkip(f)) continue;
    const src = readFileSync(f, "utf8");
    let out = src;
    let fileCount = 0;
    for (const { re, to } of RULES) {
      out = out.replace(re, () => { fileCount++; return to; });
    }
    if (out !== src) {
      writeFileSync(f, out, "utf8");
      touched++;
      changes += fileCount;
      changedFiles.push(relative(ROOT, f));
    }
  }
}

console.log(`Files modified: ${touched}`);
console.log(`Total substitutions: ${changes}`);
if (process.argv.includes("--verbose")) {
  for (const f of changedFiles) console.log(`  ${f}`);
}
