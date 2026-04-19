#!/usr/bin/env node
/**
 * migrate-lucide-to-ds.mjs
 *
 * Reemplaza `import { ... } from "lucide-react"` por
 * `import { ... } from "@buleje/design-system/icons"` SOLO cuando
 * todos los íconos importados están exportados por el DS.
 *
 * Si algún ícono no está en el DS (y existe en lucide), el archivo
 * se deja intacto y se reporta para revisar.
 *
 * Uso:
 *   node scripts/migrate-lucide-to-ds.mjs           (dry-run)
 *   node scripts/migrate-lucide-to-ds.mjs --apply   (escribe cambios)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");

// 1. Extraer íconos exportados por el DS
const dsIconsPath = join(ROOT, "packages/design-system/src/icons.ts");
const dsContent = readFileSync(dsIconsPath, "utf8");
const dsIcons = new Set();
// Capturar nombres en export { A, B, C, ... }
const exportBlock = dsContent.match(/export\s*\{([\s\S]+?)\}\s*from\s*["']lucide-react["']/);
if (!exportBlock) {
  console.error("No se pudo parsear el bloque export de DS icons.");
  process.exit(1);
}
for (const line of exportBlock[1].split("\n")) {
  // Ignora comentarios y líneas vacías
  const cleaned = line.replace(/\/\/.*$/, "").trim().replace(/,$/, "");
  if (!cleaned) continue;
  // Puede tener alias: "ShoppingCart as Cart"
  const name = cleaned.split(/\s+as\s+/)[0].trim();
  if (/^[A-Z][A-Za-z0-9]*$/.test(name)) dsIcons.add(name);
}
console.log(`DS exports ${dsIcons.size} íconos.`);

// 2. Encontrar archivos que importan de lucide-react
const files = execSync(
  `grep -rl "from \\"lucide-react\\"" --include="*.tsx" --include="*.ts" app components 2>/dev/null || true`,
  { cwd: ROOT, encoding: "utf8" },
)
  .split("\n")
  .filter((f) => f && !f.includes("node_modules") && !f.includes(".next") && !f.includes(".claude/worktrees"));

console.log(`Files usando lucide-react directo: ${files.length}`);

let migrated = 0;
let skipped = 0;
const skippedDetails = [];

for (const rel of files) {
  const abs = join(ROOT, rel);
  const content = readFileSync(abs, "utf8");

  // Solo consideramos import { ... } from "lucide-react" (no type-only ni default)
  const importMatch = content.match(
    /import\s*\{\s*([\s\S]+?)\s*\}\s*from\s*["']lucide-react["']/,
  );
  if (!importMatch) {
    skipped++;
    skippedDetails.push({ file: rel, reason: "import no parseable" });
    continue;
  }

  // Extraer nombres
  const raw = importMatch[1];
  const names = raw
    .split(",")
    .map((s) => s.replace(/\/\/.*$/, "").trim())
    .filter(Boolean)
    // lidiar con "type Foo" y "Foo as Bar"
    .map((n) => n.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
    .filter((n) => /^[A-Z][A-Za-z0-9]*$/.test(n));

  const missing = names.filter((n) => !dsIcons.has(n));
  if (missing.length > 0) {
    skipped++;
    skippedDetails.push({ file: rel, reason: `missing en DS: ${missing.join(", ")}` });
    continue;
  }

  // Todos los íconos están en DS → migrar
  const next = content.replace(
    /from\s*["']lucide-react["']/,
    'from "@buleje/design-system/icons"',
  );
  if (next === content) {
    skipped++;
    continue;
  }

  if (APPLY) {
    writeFileSync(abs, next, "utf8");
  }
  migrated++;
  console.log(`  ✓ ${rel}`);
}

console.log(`\n${APPLY ? "APLICADO" : "DRY-RUN"}: ${migrated} migrados, ${skipped} saltados`);

if (skippedDetails.length > 0 && skippedDetails.length <= 20) {
  console.log("\nSaltados:");
  for (const s of skippedDetails) {
    console.log(`  · ${s.file} — ${s.reason}`);
  }
}
