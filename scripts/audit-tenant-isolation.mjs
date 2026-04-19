#!/usr/bin/env node
/**
 * audit-tenant-isolation.mjs
 *
 * CI gate: escanea app/api y lib/db buscando queries Prisma directas que
 * NO incluyen `tenantId` en la clausula where.
 *
 * Uso:
 *   node scripts/audit-tenant-isolation.mjs
 *   npm run audit:tenant
 *
 * Exit 0  → sin violaciones
 * Exit 1  → al menos una violacion detectada (tabla markdown en stdout)
 *
 * Diseno: regex simple (no AST). Tolera falsos positivos — el objetivo es
 * bloquear regresiones obvias, no ser un type-checker.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── 1. Leer schema.prisma y detectar modelos SIN tenantId ──────────────────

function parseModelsWithoutTenantId(schemaPath) {
  const content = fs.readFileSync(schemaPath, "utf8");
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  const withoutTenant = new Set();
  let m;
  while ((m = modelRegex.exec(content)) !== null) {
    const [, name, body] = m;
    if (!body.includes("tenantId")) {
      withoutTenant.add(name);
    }
  }
  return withoutTenant;
}

// Modelos que nunca deben tener tenantId (tablas globales de plataforma)
const ALWAYS_EXEMPT = new Set([
  "SuperadminUser",
  "Tenant",
  "TenantInvitation",
  "AuditLog",
  "SystemSetting",
  "FeatureFlag",
  "MigrationHistory",
  "PlatformSetting",
  "CronDeadLetter",
  "CronHealthLog",
  "StripeWebhookQueue",
  "MpPendingPlan",
  // sub-items sin tenantId propio (heredan del parent)
  "OrderItem",
  "BundleItem",
  "PurchaseItem",
  "SaleItem",
  "ReturnItem",
  "FiadoCuota",
  "PrestamoCuota",
  "RecetaIngrediente",
  "ShoppingListItem",
  "PageBlock",
  "PageVersion",
  "Page",
  "Payment",
  "CashMovement",
  "SavedLocation",
  // marketplace / vendor (sin tenantId propio por diseno)
  "StoreProduct",
  "StorePermission",
  "SupplierPortal",
  "WholesaleOrder",
  "WholesaleOrderItem",
  "SupplierReturnItem",
  "VendorApplicationReview",
  "MarketplaceAbandonedCart",
  "DeliveryPartner",
  "RoadmapItemStatus",
  "ABTest",
  "AIMessage",
  "ChurnPlaybook",
  "ConteoFisicoItem",
  "CotizacionItem",
  "GuiaRemisionItem",
  "PrestamoDocumento",
  "SocioBillingCycle",  // sub-item de socio membership
]);

// ── 2. Operaciones Prisma que deberian llevar tenantId ─────────────────────

const PRISMA_OPS = [
  "findUnique",
  "findFirst",
  "findMany",
  "updateMany",
  "deleteMany",
  "update",
  "delete",
  "aggregate",
  "count",
  "groupBy",
];

// Regex: captura prisma.<Modelo>.<operacion>(
// No captura create/upsert/createMany porque en writes el tenantId va en data
const CALL_REGEX = /prisma\.(\w+)\.(findUnique|findFirst|findMany|updateMany|deleteMany|update|delete|aggregate|count|groupBy)\s*\(/g;

// ── 3. Analizador de ventana de contexto ──────────────────────────────────

/**
 * Dado el contenido del archivo y la posicion del match, extrae el bloque
 * de codigo hasta el cierre de parentesis correspondiente y verifica si
 * contiene `tenantId`.
 *
 * Estrategia: avanzar caracter a caracter contando parentesis abiertos
 * desde la posicion del '(' de apertura. Limite de 2000 chars para evitar
 * O(n^2) en archivos grandes.
 */
function extractCallBlock(content, matchIndex) {
  // Avanzar hasta el '(' de apertura
  let start = content.indexOf("(", matchIndex);
  if (start === -1) return content.slice(matchIndex, matchIndex + 300);

  let depth = 0;
  let i = start;
  const limit = Math.min(start + 3000, content.length);

  while (i < limit) {
    const ch = content[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        return content.slice(start, i + 1);
      }
    }
    i++;
  }
  // Si no cerramos, devolver ventana fija
  return content.slice(start, limit);
}

/**
 * Retorna true si el bloque parece incluir tenantId en la clausula where.
 * Busca tanto la clave `tenantId` como spreads comunes (`...where`, `...filter`).
 */
function blockHasTenantId(block) {
  if (/tenantId/.test(block)) return true;
  // Spread que podria incluir tenantId (falso negativo aceptable)
  if (/\.\.\.\s*\w*(where|filter|query|params|conditions)\b/i.test(block)) return true;
  return false;
}

// ── 4. Recolector de archivos ─────────────────────────────────────────────

function collectFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, results);
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

// ── 5. Scanner principal ──────────────────────────────────────────────────

function scanFile(filePath, modelsWithoutTenant) {
  const content = fs.readFileSync(filePath, "utf8");
  const violations = [];
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");

  let m;
  CALL_REGEX.lastIndex = 0;

  while ((m = CALL_REGEX.exec(content)) !== null) {
    const rawModel = m[1];
    const op = m[2];
    const matchIndex = m.index;

    // Normalizar: Prisma usa camelCase en el cliente (ej. savedLocation)
    // Queremos comparar con el nombre PascalCase del schema
    const modelPascal = rawModel.charAt(0).toUpperCase() + rawModel.slice(1);

    // Eximir si el modelo no tiene tenantId en el schema
    if (modelsWithoutTenant.has(modelPascal)) continue;

    // Eximir si el modelo esta en la lista de siempre-exentos
    if (ALWAYS_EXEMPT.has(modelPascal)) continue;

    // Eximir operaciones de lectura sin where (count sin where es OK para totales)
    // Solo reportar si hay un bloque where sin tenantId
    const block = extractCallBlock(content, matchIndex);

    // Si el bloque no tiene clausula where en absoluto, skip
    // (puede ser un create, o un count total sin filtro — revisable manualmente)
    const hasWhere = /\bwhere\s*:/.test(block) || /\bwhere\s*\(/.test(block);
    if (!hasWhere) continue;

    // Verificar si tenantId esta presente
    if (!blockHasTenantId(block)) {
      // Calcular numero de linea
      const lineNum = content.slice(0, matchIndex).split("\n").length;
      violations.push({
        file: relPath,
        line: lineNum,
        model: rawModel,
        op,
        snippet: block.replace(/\s+/g, " ").slice(0, 120) + (block.length > 120 ? "..." : ""),
      });
    }
  }

  return violations;
}

// ── 6. Main ───────────────────────────────────────────────────────────────

function main() {
  const schemaPath = path.join(ROOT, "prisma", "schema.prisma");

  if (!fs.existsSync(schemaPath)) {
    console.error("[audit-tenant] ERROR: prisma/schema.prisma no encontrado");
    process.exit(2);
  }

  const modelsWithoutTenant = parseModelsWithoutTenantId(schemaPath);

  // Directorios a escanear
  const scanDirs = [
    path.join(ROOT, "app", "api"),
    path.join(ROOT, "lib", "db"),
  ];

  const allFiles = scanDirs.flatMap((d) => collectFiles(d));
  const allViolations = [];

  for (const f of allFiles) {
    const v = scanFile(f, modelsWithoutTenant);
    allViolations.push(...v);
  }

  // ── Reporte ──

  const total = allViolations.length;

  if (total === 0) {
    console.log("[audit-tenant] OK — 0 violaciones de aislamiento multi-tenant detectadas.");
    console.log(`[audit-tenant] Archivos escaneados: ${allFiles.length}`);
    process.exit(0);
  }

  // Formato solicitado: "archivo:linea — mensaje"
  console.log(`\n[audit-tenant] ATENCION — ${total} posible(s) violacion(es) de tenantId encontrada(s):\n`);

  for (const v of allViolations) {
    console.log(`${v.file}:${v.line} — prisma.${v.model}.${v.op} sin tenantId`);
  }

  // Tabla markdown para CI logs
  console.log("\n\n| Archivo | Linea | Modelo | Operacion |");
  console.log("|---------|-------|--------|-----------|");
  for (const v of allViolations) {
    console.log(`| \`${v.file}\` | ${v.line} | \`${v.model}\` | \`${v.op}\` |`);
  }

  console.log(`\n[audit-tenant] Total: ${total} violacion(es). Archivos escaneados: ${allFiles.length}`);
  console.log("[audit-tenant] Agrega tenantId al where o agrega el modelo a ALWAYS_EXEMPT si es una tabla global.");
  process.exit(1);
}

main();
