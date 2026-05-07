#!/usr/bin/env node
// Audit script: lista endpoints write (POST/PATCH/PUT/DELETE) sin requireActiveSubscription guard
// Excluye: auth, billing, superadmin, marketplace público, public, healthcheck.
// Uso: node scripts/audit-billing-coverage.mjs [--json]
// Ejemplo reporte: node scripts/audit-billing-coverage.mjs > reports/billing-coverage-$(date +%Y-%m-%d).md

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "app", "api");
const JSON_MODE = process.argv.includes("--json");

const EXCLUDE_PATHS = [
  "auth/",
  "billing/",
  "superadmin/",
  "marketplace/",   // mayoria es público — auditar uno por uno si se necesita
  "health",
  "csrf",
  "webhook",        // eventos externos, no usuario autenticado
  "settings/route", // GET público, PUT requiere admin pero no billing
];

const WRITE_VERBS = ["POST", "PATCH", "PUT", "DELETE"];

/** Genera severidad: DELETE sin guard es critico, POST/PATCH alto */
function severity(verbs) {
  if (verbs.includes("DELETE")) return "CRITICO";
  if (verbs.includes("POST") || verbs.includes("PATCH") || verbs.includes("PUT")) return "ALTO";
  return "MEDIO";
}

async function* walkRoutes(dir) {
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const item of items) {
    const full = join(dir, item.name);
    if (item.isDirectory()) yield* walkRoutes(full);
    else if (item.name === "route.ts" || item.name === "route.tsx") yield full;
  }
}

async function analyzeRoute(filePath) {
  const content = await readFile(filePath, "utf8");

  const verbs = WRITE_VERBS.filter((v) =>
    new RegExp(`export\\s+async\\s+function\\s+${v}\\b`).test(content)
  );

  return {
    filePath,
    verbs,
    hasGuard: /requireActiveSubscription\s*\(/.test(content),
    hasRequireAdmin: /requireAdmin\s*\(/.test(content),
    hasPlanCheck: /checkPlan\s*\(|assertPlan\s*\(|plan\s*===/.test(content),
  };
}

async function main() {
  const missing = [];
  const covered = [];
  const skipped = [];
  const readOnly = [];

  for await (const file of walkRoutes(ROOT)) {
    const relativePath = file.replace(ROOT + "/", "").replace(ROOT + "\\", "");

    if (EXCLUDE_PATHS.some((prefix) => relativePath.startsWith(prefix))) {
      skipped.push(relativePath);
      continue;
    }

    const result = await analyzeRoute(file);

    if (result.verbs.length === 0) {
      readOnly.push(relativePath);
      continue;
    }

    // Endpoints públicos (sin requireAdmin) no necesitan billing guard
    if (!result.hasRequireAdmin) {
      readOnly.push(relativePath + " [público]");
      continue;
    }

    const entry = {
      path: relativePath,
      verbs: result.verbs,
      severity: severity(result.verbs),
      hasPlanCheck: result.hasPlanCheck,
    };

    if (result.hasGuard) {
      covered.push(entry);
    } else {
      missing.push(entry);
    }
  }

  // Ordenar por severidad
  const ORDER = { CRITICO: 0, ALTO: 1, MEDIO: 2 };
  missing.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  const total = missing.length + covered.length;
  const coveragePct = total > 0 ? Math.round((covered.length / total) * 100) : 100;
  const timestamp = new Date().toISOString();

  if (JSON_MODE) {
    console.log(JSON.stringify({ timestamp, coveragePct, missing, covered, skipped }, null, 2));
    return;
  }

  // ── Reporte Markdown ────────────────────────────────────────────────────────
  const lines = [];
  const out = (...args) => lines.push(args.join(" "));

  out(`# Audit billing-coverage — ${timestamp}`);
  out("");
  out("## Resumen");
  out("");
  out(`| Metrica | Valor |`);
  out(`|---------|-------|`);
  out(`| Cobertura total | **${coveragePct}%** (${covered.length}/${total}) |`);
  out(`| Con guard | ${covered.length} |`);
  out(`| SIN guard (write + admin) | **${missing.length}** |`);
  out(`| Solo-GET o publicos | ${readOnly.length} |`);
  out(`| Excluidos (auth/billing/superadmin/marketplace) | ${skipped.length} |`);
  out("");

  if (missing.length > 0) {
    const criticos = missing.filter((m) => m.severity === "CRITICO");
    const altos = missing.filter((m) => m.severity === "ALTO");

    out(`## Endpoints sin requireActiveSubscription`);
    out("");

    if (criticos.length > 0) {
      out(`### Severidad CRITICO (${criticos.length})`);
      out("");
      out("| Endpoint | Verbos | Plan-check alternativo |");
      out("|----------|--------|----------------------|");
      for (const m of criticos) {
        out(`| \`${m.path}\` | ${m.verbs.join(", ")} | ${m.hasPlanCheck ? "si (parcial)" : "no"} |`);
      }
      out("");
    }

    if (altos.length > 0) {
      out(`### Severidad ALTO (${altos.length})`);
      out("");
      out("| Endpoint | Verbos | Plan-check alternativo |");
      out("|----------|--------|----------------------|");
      for (const m of altos) {
        out(`| \`${m.path}\` | ${m.verbs.join(", ")} | ${m.hasPlanCheck ? "si (parcial)" : "no"} |`);
      }
      out("");
    }
  } else {
    out("## Cobertura al 100% — no se encontraron gaps");
    out("");
  }

  out(`## Endpoints con guard (${covered.length})`);
  out("");
  out("| Endpoint | Verbos |");
  out("|----------|--------|");
  for (const c of covered) {
    out(`| \`${c.path}\` | ${c.verbs.join(", ")} |`);
  }
  out("");
  out("---");
  out(`*Generado por \`scripts/audit-billing-coverage.mjs\` — ${timestamp}*`);

  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
