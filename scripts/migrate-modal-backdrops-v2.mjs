#!/usr/bin/env node
/**
 * v2: migra overlays con `bg-black/XX` SIN `backdrop-blur-sm` al utility
 * `.modal-backdrop` (blanco 75% + blur 6px).
 *
 * Se salta archivos que usan fondo oscuro intencionalmente (scanners).
 *
 * Uso: node scripts/migrate-modal-backdrops-v2.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SKIP = new Set([
  "components/admin/BarcodeScanner.tsx",
  "components/admin/inventario/BarcodeScanner.tsx",
]);

const raw = execSync(
  'grep -rln "fixed inset-0.*bg-black/" components/admin --include="*.tsx"',
  { encoding: "utf8" }
).trim();

const files = raw.split(/\r?\n/)
  .filter(Boolean)
  .map(f => f.replaceAll("\\", "/"))
  .filter(f => !SKIP.has(f));

let totalReplacements = 0;
const touched = [];

for (const file of files) {
  let src = readFileSync(file, "utf8");
  const before = src;
  let local = 0;

  // Pattern 1: z-50 bg-black/X flex items-center justify-center [p-X]
  src = src.replace(
    /"fixed inset-0 z-50 bg-black\/(?:30|40|50|60) flex items-center justify-center( p-\d+)?"/g,
    (_m, p) => { local++; return `"modal-backdrop${p || " p-4"}"`; }
  );

  // Pattern 2: z-50 flex items-center justify-center bg-black/X [p-X]
  src = src.replace(
    /"fixed inset-0 z-50 flex items-center justify-center bg-black\/(?:30|40|50|60)( p-\d+)?"/g,
    (_m, p) => { local++; return `"modal-backdrop${p || " p-4"}"`; }
  );

  // Pattern 3: sin z-index
  src = src.replace(
    /"fixed inset-0 bg-black\/(?:30|40|50|60) flex items-center justify-center( p-\d+)?"/g,
    (_m, p) => { local++; return `"modal-backdrop${p || " p-4"}"`; }
  );

  // Pattern 4: z-9000 bg-black/X flex items-center justify-center [p-X]
  src = src.replace(
    /"fixed inset-0 z-9000 bg-black\/(?:30|40|50|60) flex items-center justify-center( p-\d+)?"/g,
    (_m, p) => { local++; return `"modal-backdrop${p || " p-4"}" style={{ zIndex: 9000 }}`; }
  );

  // Pattern 5: z-60 bg-black/X flex items-center justify-center
  src = src.replace(
    /"fixed inset-0 z-60 bg-black\/(?:30|40|50|60) flex items-center justify-center( p-\d+)?"/g,
    (_m, p) => { local++; return `"modal-backdrop${p || " p-4"}" style={{ zIndex: 60 }}`; }
  );

  if (src !== before) {
    writeFileSync(file, src);
    totalReplacements += local;
    touched.push({ file, n: local });
  }
}

console.log(`${touched.length} archivos tocados · ${totalReplacements} reemplazos`);
for (const { file, n } of touched) console.log(`  ${n}x ${file}`);

// Verificar leftovers (patrones no reconocidos)
const leftover = execSync(
  'grep -rln "fixed inset-0.*bg-black/" components/admin --include="*.tsx" 2>/dev/null || true',
  { encoding: "utf8" }
).trim().split(/\r?\n/).filter(l => {
  if (!l) return false;
  const n = l.replaceAll("\\", "/");
  return !SKIP.has(n);
});

if (leftover.length) {
  console.log(`\nQuedan ${leftover.length} archivos con patrones no reconocidos (revisar manualmente):`);
  leftover.slice(0, 20).forEach(l => console.log(`  ${l}`));
}
