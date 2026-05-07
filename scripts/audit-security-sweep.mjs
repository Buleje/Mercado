#!/usr/bin/env node
/**
 * scripts/audit-security-sweep.mjs
 * Sprint 1 — Security Sweep Audit
 *
 * Recorre app/api/** excepto marketplace/ y delivery/ y reporta:
 *   A) POST/PATCH/PUT/DELETE sin rate limit (no `applyRateLimit`)
 *   B) Endpoints sin ninguna auth gate (no requireAdmin / requireCustomer /
 *      requirePartner / withApiHandler-auth) Y sin rate limit
 *   C) GET que retornan `customerPhone` completo (posible PII leak)
 *
 * Output: reports/security-sweep-2026-05-06.md
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API_DIR = path.join(ROOT, "app", "api");
const OUT_FILE = path.join(ROOT, "reports", "security-sweep-2026-05-06.md");

// ── helpers ──────────────────────────────────────────────────────────────────

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function walkDir(dir) {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      entries.push(...walkDir(full));
    } else if (stat.isFile() && name === "route.ts") {
      entries.push(full);
    }
  }
  return entries;
}

function rel(filePath) {
  return filePath.replace(ROOT + "/", "");
}

// Skipped subtrees
const SKIP_PREFIXES = [
  path.join(API_DIR, "marketplace"),
  path.join(API_DIR, "delivery"),
  path.join(API_DIR, "admin", "marketplace"),
  path.join(API_DIR, "admin", "delivery"),
];

// Endpoints that are legitimately public (webhooks, auth, cron, health)
const PUBLIC_ALLOWLIST = [
  "/api/auth/",
  "/api/webhooks/",
  "/api/stripe/webhook",
  "/api/cron/",
  "/api/health",
  "/api/newsletter",   // public subscribe
  "/api/contact",      // public contact form
  "/api/tracking",     // public tracking
  "/api/reviews",      // public read
  "/api/promotions",   // public GET (admin strips targetPhones)
  "/api/products",     // public catalogue
  "/api/v1/products",  // public catalogue v1
  "/api/suggestions",  // public search suggest
  "/api/locations",    // public locations
  "/api/t/",           // tenant-public APIs
  "/api/plan",         // public plan info
  "/api/changelog",    // public
  "/api/pricing",      // public
  "/api/barcode-lookup", // public scan
  "/api/cart",         // session-based, no admin gate
  "/api/orders",       // public POST (customer checkout), admin GET
  "/api/admin/log-error", // error boundary, no session yet
];

function isPublicAllowlisted(apiPath) {
  return PUBLIC_ALLOWLIST.some((p) => apiPath.startsWith(p));
}

// ── Auth detection ────────────────────────────────────────────────────────────
const AUTH_PATTERNS = [
  /requireAdmin\s*\(/,
  /requireCustomer\s*\(/,
  /requirePartner\s*\(/,
  /getCustomerSession\s*\(/,
  /withApiHandler\s*\(/,
  /getAdminSession\s*\(/,
  /checkAdminAuth\s*\(/,
];

const RATE_LIMIT_PATTERNS = [
  /applyRateLimit\s*\(/,
  /createRateLimiter\s*\(/,
  /createDistributedRateLimiter\s*\(/,
  /rateLimit\s*\(/,
];

const MUTATION_METHOD_PATTERNS = [
  /export\s+(?:async\s+)?function\s+POST\b/,
  /export\s+(?:async\s+)?function\s+PATCH\b/,
  /export\s+(?:async\s+)?function\s+PUT\b/,
  /export\s+(?:async\s+)?function\s+DELETE\b/,
  /export\s+const\s+POST\s*=/,
  /export\s+const\s+PATCH\s*=/,
  /export\s+const\s+PUT\s*=/,
  /export\s+const\s+DELETE\s*=/,
];

const GET_PATTERN = /export\s+(?:async\s+)?function\s+GET\b|export\s+const\s+GET\s*=/;

// PII: returning `customerPhone` directly (not sliced/masked) in a response
// Detects JSON.stringify / NextResponse.json calls that include customerPhone
// without slicing. We look for `customerPhone` in the file NOT followed by .slice
const PII_PHONE_PATTERN = /customerPhone(?!\s*\.\s*slice|\s*\?\.\s*slice)/;

// ── Main scan ─────────────────────────────────────────────────────────────────

const issues = {
  noRateLimitMutation: [],
  noAuthNoRateLimit: [],
  piiPhone: [],
};

let total = 0;

const allRoutes = walkDir(API_DIR);

for (const filePath of allRoutes) {
  // Skip exempted subtrees
  if (SKIP_PREFIXES.some((p) => filePath.startsWith(p))) continue;

  total++;
  const src = readFile(filePath);
  const apiPath = filePath.replace(path.join(ROOT, "app"), "").replace("/route.ts", "");

  const hasMutation = MUTATION_METHOD_PATTERNS.some((p) => p.test(src));
  const hasGet = GET_PATTERN.test(src);
  const hasAuth = AUTH_PATTERNS.some((p) => p.test(src));
  const hasRateLimit = RATE_LIMIT_PATTERNS.some((p) => p.test(src));
  const hasPiiPhone = PII_PHONE_PATTERN.test(src);

  // A) Mutations without rate limit
  if (hasMutation && !hasRateLimit) {
    const severity = hasAuth ? "MEDIUM" : "HIGH";
    issues.noRateLimitMutation.push({ file: rel(filePath), apiPath, severity, hasAuth });
  }

  // B) No auth + no rate limit (and not allowlisted)
  if (!hasAuth && !hasRateLimit && !isPublicAllowlisted(apiPath)) {
    issues.noAuthNoRateLimit.push({ file: rel(filePath), apiPath, severity: "CRITICAL" });
  }

  // C) GET with potential PII phone exposure (only if GET exists and no auth or public)
  if (hasGet && hasPiiPhone) {
    // Only flag if it's not a mutation-only file and has phone in GET context
    // Check if the file returns customerPhone in a list/GET context
    const getBlock = src.split(/export\s+(?:async\s+)?function\s+GET|export\s+const\s+GET/)[1] ?? "";
    if (PII_PHONE_PATTERN.test(getBlock)) {
      issues.piiPhone.push({ file: rel(filePath), apiPath, severity: "MEDIUM", hasAuth });
    }
  }
}

// ── Build report ──────────────────────────────────────────────────────────────

const now = new Date().toISOString().slice(0, 10);

const lines = [
  `# Security Sweep Report — ${now}`,
  "",
  `**Endpoints auditados:** ${total}  `,
  `**Issues críticos:** ${issues.noAuthNoRateLimit.length}  `,
  `**Mutations sin rate limit:** ${issues.noRateLimitMutation.length}  `,
  `**PII phone exposures:** ${issues.piiPhone.length}  `,
  "",
  "---",
  "",
  "## A) Mutations sin Rate Limit",
  "",
  "| Archivo | API Path | Severity | Auth presente |",
  "|---------|----------|----------|---------------|",
  ...issues.noRateLimitMutation.map(
    (i) => `| \`${i.file}\` | \`${i.apiPath}\` | ${i.severity} | ${i.hasAuth ? "si" : "NO"} |`
  ),
  "",
  "---",
  "",
  "## B) Sin Auth + Sin Rate Limit (no allowlisted)",
  "",
  "| Archivo | API Path | Severity |",
  "|---------|----------|----------|",
  ...issues.noAuthNoRateLimit.map(
    (i) => `| \`${i.file}\` | \`${i.apiPath}\` | ${i.severity} |`
  ),
  "",
  "---",
  "",
  "## C) GET con posible PII phone sin mascarar",
  "",
  "| Archivo | API Path | Severity | Auth presente |",
  "|---------|----------|----------|---------------|",
  ...issues.piiPhone.map(
    (i) => `| \`${i.file}\` | \`${i.apiPath}\` | ${i.severity} | ${i.hasAuth ? "si" : "NO"} |`
  ),
  "",
  "---",
  "",
  "> Generado por `scripts/audit-security-sweep.mjs`",
];

const report = lines.join("\n");
fs.writeFileSync(OUT_FILE, report, "utf8");
console.log(report);
console.log(`\nReporte guardado en: ${OUT_FILE}`);
