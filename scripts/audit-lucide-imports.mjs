#!/usr/bin/env node
/**
 * audit-lucide-imports — lista archivos que importan bulk de `lucide-react` o
 * directamente sin pasar por `@buleje/design-system/icons`.
 *
 * Objetivo: reducir bundle size. Cada import bulk trae el catálogo entero a
 * pesar de tree-shaking de Next — medido ~50-100 KB gzipped extra.
 *
 * Migración recomendada por archivo:
 *   - Si el icono existe en DS: `import { X } from "@buleje/design-system/icons"`.
 *   - Si no existe aún: mantener `lucide-react` pero pedir PR al DS para agregarlo.
 *
 * Uso:
 *   node scripts/audit-lucide-imports.mjs
 *   node scripts/audit-lucide-imports.mjs --by-icon   # ranking de iconos más usados
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const EXCLUDE_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "build",
  "storybook-static", "coverage", "playwright-report",
  "test-results", ".vercel", "android", "ios", "out",
]);

const BY_ICON = process.argv.includes("--by-icon");

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".git") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      walk(full, acc);
    } else if ([".ts", ".tsx"].includes(extname(e.name))) {
      acc.push(full);
    }
  }
  return acc;
}

const files = walk(process.cwd());
const offenders = [];
const iconCounts = new Map();

const rx = /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g;

for (const f of files) {
  let src;
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  let m;
  while ((m = rx.exec(src)) !== null) {
    const icons = m[1].split(",").map(s => s.trim().replace(/\s+as\s+\w+$/, "")).filter(Boolean);
    offenders.push({ file: f.replace(process.cwd(), "").replace(/\\/g, "/"), icons });
    for (const ic of icons) iconCounts.set(ic, (iconCounts.get(ic) ?? 0) + 1);
  }
}

if (BY_ICON) {
  const ranked = [...iconCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`audit-lucide-imports — ${iconCounts.size} iconos únicos, ${offenders.length} imports bulk\n`);
  console.log("TOP 30 iconos más usados (candidatos a promover al DS):\n");
  for (const [ic, n] of ranked.slice(0, 30)) {
    console.log(`  ${String(n).padStart(4)} × ${ic}`);
  }
  process.exit(0);
}

console.log(`audit-lucide-imports — ${offenders.length} archivos con import bulk de lucide-react:\n`);
for (const o of offenders.slice(0, 40)) {
  console.log(`  ${o.file}`);
  console.log(`    → ${o.icons.join(", ")}`);
}
if (offenders.length > 40) console.log(`  ... y ${offenders.length - 40} más.`);

console.log(`\nTotal iconos únicos: ${iconCounts.size}`);
console.log(`\nSugerencia: migrar los TOP iconos al DS (\`npm run dev:lucide:audit -- --by-icon\` para ranking).`);
console.log(`\nPatrón destino: import { X } from "@buleje/design-system/icons"`);
