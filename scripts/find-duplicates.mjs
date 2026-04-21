#!/usr/bin/env node
/**
 * find-duplicates — audita archivos `.tsx`/`.ts` con el mismo basename pero en
 * rutas distintas. Encuentra shadows peligrosos como:
 *
 *   components/RecentlyViewed.tsx          ← usado por tienda single-tenant
 *   components/store/RecentlyViewed.tsx    ← usado por marketplace
 *
 * Visto en prod: el bug de `item.price.toFixed is not a function` era porque el
 * fix se aplicaba al primer archivo y el crasheo venía del segundo.
 *
 * Uso:
 *   node scripts/find-duplicates.mjs
 *   node scripts/find-duplicates.mjs --json       # machine-readable
 *
 * Salida: tabla ordenada por frecuencia (más duplicados primero).
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative, basename, extname, sep } from "node:path";

const ROOT = process.cwd();
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "storybook-static",
  "coverage",
  "playwright-report",
  "test-results",
  ".vercel",
  "android",
  "ios",
  "out",
]);

const asJson = process.argv.includes("--json");

/** Walk recursive, skipping ignored dirs. */
function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".next") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      walk(full, acc);
    } else {
      const ext = extname(e.name);
      if (EXTENSIONS.has(ext)) acc.push(full);
    }
  }
  return acc;
}

const all = walk(ROOT);
const byBase = new Map();
for (const file of all) {
  const key = basename(file);
  // Ignora `index.tsx` / `page.tsx` / `route.ts` / `layout.tsx` / `test`
  // porque son nombres legítimos duplicables por convención de Next.
  if (
    key === "index.ts" ||
    key === "index.tsx" ||
    key === "page.tsx" ||
    key === "page.ts" ||
    key === "layout.tsx" ||
    key === "route.ts" ||
    key === "loading.tsx" ||
    key === "error.tsx" ||
    key === "not-found.tsx" ||
    key === "default.tsx" ||
    key === "template.tsx" ||
    key === "middleware.ts" ||
    key === "types.ts" ||
    key === "utils.ts" ||
    key.endsWith(".test.tsx") ||
    key.endsWith(".test.ts") ||
    key.endsWith(".spec.tsx") ||
    key.endsWith(".spec.ts") ||
    key.endsWith(".stories.tsx") ||
    key.endsWith(".d.ts")
  ) {
    continue;
  }
  if (!byBase.has(key)) byBase.set(key, []);
  byBase.get(key).push(relative(ROOT, file).replaceAll(sep, "/"));
}

const duplicates = [...byBase.entries()]
  .filter(([, paths]) => paths.length > 1)
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

if (asJson) {
  console.log(JSON.stringify(Object.fromEntries(duplicates), null, 2));
  process.exit(duplicates.length > 0 ? 1 : 0);
}

if (duplicates.length === 0) {
  console.log("✅ find-duplicates: no shadows detected.");
  process.exit(0);
}

console.log(`⚠️  find-duplicates: ${duplicates.length} basename(s) duplicado(s):\n`);
for (const [name, paths] of duplicates) {
  console.log(`  ${name}  (${paths.length})`);
  for (const p of paths) console.log(`    - ${p}`);
  console.log();
}
process.exit(1);
