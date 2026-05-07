#!/usr/bin/env node
/**
 * audit-cross-tenant.mjs
 *
 * Escanea app/api/**\/*.ts y lib/db/*.ts buscando queries Prisma con
 * `findUnique` / `findFirst` que filtran por `id` SIN incluir `tenantId`.
 *
 * Estas queries son candidatas a cross-tenant data leakage: si un atacante
 * conoce el UUID de un recurso ajeno puede leerlo sin tener el tenantId.
 *
 * Uso:
 *   node scripts/audit-cross-tenant.mjs
 *   node scripts/audit-cross-tenant.mjs > reports/cross-tenant-audit.json
 *
 * Severity:
 *   - "high"   → archivo en app/api/ (endpoint publico)
 *   - "medium" → archivo en lib/db/ (capa de datos interna)
 *
 * Tablas globales excluidas (no tienen tenantId por diseño):
 *   Customer, Tenant, AdminUser, SuperadminUser, StripeWebhookQueue
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Tablas globales excluidas ────────────────────────────────────────────────

const EXEMPT_MODELS = new Set([
  "customer",
  "tenant",
  "adminuser",
  "superadminuser",
  "stripwebhookqueue",
  "stripewebhookqueue",
  // Plataforma SaaS global
  "platformsetting",
  "systemsetting",
  "featureflag",
  "migrationhistory",
  "crondeadletter",
  "cronhealthlog",
  "tenantinvitation",
  "mppendingplan",
]);

// ─── Regex principal ──────────────────────────────────────────────────────────
//
// Captura: prisma.<model>.findUnique(  o  prisma.<model>.findFirst(
// Solo las variantes con `id` en el where (sin tenantId).
//
// Estrategia: regex para detectar el inicio de la llamada; luego extrae el
// bloque de argumentos con balance de llaves para analizar su contenido.

const CALL_REGEX =
  /prisma\.([a-zA-Z]+)\.(findUnique|findFirst)\s*\(\s*\{/g;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrae el bloque completo de la llamada Prisma (balance de llaves).
 * Devuelve el texto desde el `{` de apertura hasta el `}` de cierre.
 */
function extractCallBlock(content, matchStart) {
  // matchStart apunta al `{` que viene despues del `(`
  const openBrace = content.indexOf("{", matchStart);
  if (openBrace === -1) return "";

  let depth = 0;
  let i = openBrace;
  for (; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return content.slice(openBrace, i + 1);
}

/**
 * Verifica si el bloque tiene una clausula `where` que incluya `id` (o `id:`)
 * pero NO incluye `tenantId`.
 */
function blockIsVulnerable(block) {
  // Debe tener un where con `id`
  const hasIdFilter = /\bwhere\s*:\s*\{[^}]*\bid\s*:/.test(block) ||
    /\bwhere\s*:\s*\{\s*id\s*[,}]/.test(block);

  if (!hasIdFilter) return false;

  // Debe NO tener tenantId
  const hasTenantId = /\btenantId\b/.test(block);
  return !hasTenantId;
}

/** Colecta recursivamente archivos .ts y .tsx en un directorio. */
function collectFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, results);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/** Determina la severity segun la ruta del archivo. */
function getSeverity(relPath) {
  if (relPath.startsWith("app/api/")) return "high";
  if (relPath.startsWith("lib/db/")) return "medium";
  return "medium";
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");
  const findings = [];

  CALL_REGEX.lastIndex = 0;
  let m;

  while ((m = CALL_REGEX.exec(content)) !== null) {
    const rawModel = m[1]; // ej. "product", "order"
    const op = m[2]; // "findUnique" | "findFirst"
    const matchIndex = m.index;

    // Normalizar a lowercase para comparar con EXEMPT_MODELS
    if (EXEMPT_MODELS.has(rawModel.toLowerCase())) continue;

    const block = extractCallBlock(content, matchIndex);
    if (!block) continue;

    if (!blockIsVulnerable(block)) continue;

    const lineNum = content.slice(0, matchIndex).split("\n").length;
    const querySnippet = block.replace(/\s+/g, " ").slice(0, 150);

    findings.push({
      file: relPath,
      line: lineNum,
      query: `prisma.${rawModel}.${op} — ${querySnippet}${block.length > 150 ? "..." : ""}`,
      severity: getSeverity(relPath),
    });
  }

  return findings;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const scanDirs = [
    path.join(ROOT, "app", "api"),
    path.join(ROOT, "lib", "db"),
  ];

  const allFiles = scanDirs.flatMap((d) => collectFiles(d));
  const allFindings = [];

  for (const f of allFiles) {
    try {
      const findings = scanFile(f);
      allFindings.push(...findings);
    } catch {
      // Saltar archivos que no se puedan leer
    }
  }

  // Si stdout es un TTY, imprimir resumen legible; sino, JSON puro
  const isJson = !process.stdout.isTTY;

  if (isJson) {
    process.stdout.write(JSON.stringify(allFindings, null, 2) + "\n");
  } else {
    if (allFindings.length === 0) {
      console.log(
        `[audit-cross-tenant] OK — 0 queries sospechosas encontradas en ${allFiles.length} archivos.`,
      );
      process.exit(0);
    }

    console.log(
      `\n[audit-cross-tenant] ${allFindings.length} query(s) sospechosa(s) (findUnique/findFirst por id sin tenantId):\n`,
    );

    // Tabla simple
    const high = allFindings.filter((f) => f.severity === "high");
    const medium = allFindings.filter((f) => f.severity === "medium");

    for (const severity of ["high", "medium"]) {
      const group = severity === "high" ? high : medium;
      if (group.length === 0) continue;
      console.log(`\n--- ${severity.toUpperCase()} (${group.length}) ---`);
      for (const f of group) {
        console.log(`  ${f.file}:${f.line}`);
        console.log(`    ${f.query.slice(0, 100)}`);
      }
    }

    console.log(
      `\n[audit-cross-tenant] Total: ${allFindings.length} | High: ${high.length} | Medium: ${medium.length}`,
    );
    console.log(
      "[audit-cross-tenant] Para guardar JSON: node scripts/audit-cross-tenant.mjs > reports/cross-tenant-audit.json",
    );
  }

  // Exit 1 si hay hallazgos high
  const hasHigh = allFindings.some((f) => f.severity === "high");
  process.exit(hasHigh ? 1 : 0);
}

main();
