#!/usr/bin/env node
/**
 * migrate-admin-csrf.mjs
 *
 * Migra fetches del admin para inyectar el header `x-csrf-token` automaticamente
 * via el helper `csrfHeaders()` de @/lib/csrf-client.
 *
 * Hace 2 transformaciones en cada archivo:
 *   1. Agrega import si no existe.
 *   2. Reemplaza `headers: { "Content-Type": "application/json" }` por
 *      `headers: csrfHeaders({ "Content-Type": "application/json" })`.
 *
 * Uso:
 *   node scripts/migrate-admin-csrf.mjs               # solo reporta
 *   node scripts/migrate-admin-csrf.mjs --apply       # aplica cambios
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Tier 1 — componentes admin con mutations frecuentes (ver docs/CSRF_MIGRATION.md)
const TIER_1 = [
  "components/admin/CouponsTab.tsx",
  "components/admin/TeamTab.tsx",
  "components/admin/ProductsAdminTab.tsx",
  "components/admin/ShiftControlTab.tsx",
  "components/admin/SalesOrdersTab.tsx",
  "components/admin/FiadosModule.tsx",
  "components/admin/CashRegisterTab.tsx",
  "components/admin/CRMTab.tsx",
  "components/admin/pos/PuntoCompraView.tsx",
  "components/admin/BackupRestoreTab.tsx",
  "components/admin/AdminUsersTab.tsx",
  "components/admin/AdminChatTab.tsx",
];

const HEADER_PATTERN = /headers:\s*\{\s*"Content-Type":\s*"application\/json"\s*\}/g;
const HEADER_REPLACEMENT = `headers: csrfHeaders({ "Content-Type": "application/json" })`;

const IMPORT_LINE = `import { csrfHeaders } from "@/lib/csrf-client";`;

async function migrateFile(relPath, apply) {
  const fullPath = join(ROOT, relPath);
  let content;
  try {
    content = await readFile(fullPath, "utf8");
  } catch {
    return { path: relPath, status: "missing", changes: 0 };
  }

  // Skip si ya esta migrado
  if (content.includes("csrfHeaders") || content.includes("useAdminFetch")) {
    return { path: relPath, status: "already-migrated", changes: 0 };
  }

  const matches = content.match(HEADER_PATTERN);
  if (!matches) {
    return { path: relPath, status: "no-mutations", changes: 0 };
  }

  let next = content.replace(HEADER_PATTERN, HEADER_REPLACEMENT);

  // Insertar import despues del ultimo import existente
  const lastImportMatch = [...next.matchAll(/^import .+;$/gm)].pop();
  if (lastImportMatch) {
    const insertAt = lastImportMatch.index + lastImportMatch[0].length;
    next = next.slice(0, insertAt) + "\n" + IMPORT_LINE + next.slice(insertAt);
  } else {
    next = IMPORT_LINE + "\n" + next;
  }

  if (apply) {
    await writeFile(fullPath, next, "utf8");
  }

  return { path: relPath, status: apply ? "migrated" : "would-migrate", changes: matches.length };
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`[csrf-migrate] ${apply ? "APLICANDO" : "SOLO REPORTE"}`);

  const results = [];
  for (const f of TIER_1) {
    const r = await migrateFile(f, apply);
    results.push(r);
  }

  console.table(results);

  const totalChanges = results.reduce((sum, r) => sum + r.changes, 0);
  console.log(
    `\n[csrf-migrate] ${results.filter((r) => r.changes > 0).length} archivos${apply ? " migrados" : " a migrar"} · ${totalChanges} reemplazos totales.`,
  );

  if (!apply && totalChanges > 0) {
    console.log(`\nPara aplicar: node scripts/migrate-admin-csrf.mjs --apply`);
  }
}

main().catch((e) => {
  console.error("[csrf-migrate] error:", e);
  process.exit(1);
});
