#!/usr/bin/env node
/**
 * Migra colores hardcoded en Tailwind arbitrary values a tokens del design system.
 * SOLO replaza classes Tailwind — NO toca recharts `fill="#..."` ni strings en JSON.
 * Uso: node scripts/migrate-admin-colors.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const REPLACEMENTS = [
  // Primary / brand (teal)
  { from: /text-\[#00B4A6\]/g, to: "text-primary" },
  { from: /bg-\[#00B4A6\]/g, to: "bg-primary" },
  { from: /border-\[#00B4A6\]/g, to: "border-primary" },
  { from: /ring-\[#00B4A6\]/g, to: "ring-primary" },
  { from: /stroke-\[#00B4A6\]/g, to: "stroke-primary" },
  { from: /fill-\[#00B4A6\]/g, to: "fill-primary" },
  { from: /hover:bg-\[#00B4A6\]/g, to: "hover:bg-primary" },
  { from: /hover:text-\[#00B4A6\]/g, to: "hover:text-primary" },
  { from: /hover:border-\[#00B4A6\]/g, to: "hover:border-primary" },

  // Primary dark
  { from: /hover:bg-\[#245a41\]/g, to: "hover:bg-primary-dark" },
  { from: /hover:bg-\[#009690\]/g, to: "hover:bg-primary-dark" },

  // Warning orange #f97316 → var(--data-warning)
  { from: /text-\[#f97316\]/g, to: "text-[var(--data-warning)]" },
  { from: /bg-\[#f97316\]/g, to: "bg-[var(--data-warning)]" },
  { from: /border-\[#f97316\]/g, to: "border-[var(--data-warning)]" },
  { from: /ring-\[#f97316\]/g, to: "ring-[var(--data-warning)]" },
  { from: /hover:bg-\[#f97316\]/g, to: "hover:bg-[var(--data-warning)]" },
  { from: /hover:text-\[#f97316\]/g, to: "hover:text-[var(--data-warning)]" },

  // Error red #e63946 → var(--data-error)
  { from: /text-\[#e63946\]/g, to: "text-[var(--data-error)]" },
  { from: /bg-\[#e63946\]/g, to: "bg-[var(--data-error)]" },
  { from: /border-\[#e63946\]/g, to: "border-[var(--data-error)]" },

  // Dark mode brand tint #2dd4bf → primary dark variant
  { from: /dark:text-\[#2dd4bf\]/g, to: "dark:text-primary" },
  { from: /dark:bg-\[#2dd4bf\]/g, to: "dark:bg-primary" },
];

// Enumeracion directa de colores (bash-safe)
const GREP_COLORS = ["#00B4A6", "#f97316", "#245a41", "#009690", "#2dd4bf", "#e63946"];
const grepArgs = GREP_COLORS.map(c => `-e "${c}"`).join(" ");
const files = execSync(
  `grep -rln ${grepArgs} components/admin --include="*.tsx" 2>/dev/null || true`,
  { encoding: "utf8" }
).trim().split(/\r?\n/).filter(Boolean);

let totalReplacements = 0;
const touched = [];

for (const file of files) {
  let src = readFileSync(file, "utf8");
  const before = src;
  let localCount = 0;

  for (const { from, to } of REPLACEMENTS) {
    const matches = src.match(from);
    if (matches) {
      src = src.replace(from, to);
      localCount += matches.length;
    }
  }

  if (src !== before) {
    writeFileSync(file, src);
    totalReplacements += localCount;
    touched.push({ file, n: localCount });
  }
}

console.log(`✓ ${touched.length} archivos tocados · ${totalReplacements} reemplazos`);

// Stats top 10 de archivos con mas cambios
const top = [...touched].sort((a, b) => b.n - a.n).slice(0, 10);
console.log(`\nTop 10 archivos:`);
for (const { file, n } of top) console.log(`  ${n}× ${file}`);

console.log(`\nNota: recharts fill="#XXXXXX" NO se tocan (necesitan string literal).`);
