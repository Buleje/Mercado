import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

const TARGET_DIRS = [
  path.join(ROOT, "app", "api"),
  path.join(ROOT, "lib", "db"),
];

// Allowlist: hardcoded tenantId:"main" is allowed ONLY in platform-level
// contexts (marketplace admin notifications, platform-wide crons, fallbacks).
// Each entry documents the reason via code comments in the referenced file.
const ALLOWED_BASELINE: Record<string, number> = {
  "app/api/admin/seed-peru-products/route.ts": 3,
  "app/api/contact/route.ts": 1,
  "app/api/cron/auto-backup/route.ts": 1,
  "app/api/cron/isolation-monitor/route.ts": 1,
  "app/api/cron/marketplace-sla-watchdog/route.ts": 1, // Platform-wide SLA watchdog cron — same pattern as marketplace-weekly-report
  "app/api/cron/marketplace-weekly-report/route.ts": 1,
  "app/api/daily-digest/route.ts": 1,                  // WhatsApp fallback when no tenant resolved
  // app/api/marketplace/drivers/apply/route.ts: FIX 2026-08-22 — estaba acá
  // como "cross-tenant intencional", pero verificado end-to-end (Playwright,
  // tenant real "mi-pollo") que cada tenant tiene su propio pool de
  // repartidores aislado. El hardcode a "main" mezclaba KYC de un negocio con
  // otro. Ahora usa x-tenant-id (inyectado por proxy.ts, no confiable del
  // cliente). Sacado del allowlist a propósito — que vuelva a aparecer acá
  // sería la regresión.
  "app/api/price-comparison/route.ts": 1,
  "lib/db/inventory.db.ts": 1,
};

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, out);
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(abs);
    }
  }

  return out;
}

function countHardcodedMain(content: string): number {
  return (content.match(/tenantId\s*:\s*["']main["']/g) || []).length;
}

describe("Tenant guard - hardcoded tenantId main", () => {
  it("should block new hardcoded tenantId main usages", () => {
    const allFiles = TARGET_DIRS.flatMap((dir) => walkFiles(dir));
    const found: Record<string, number> = {};

    for (const file of allFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const count = countHardcodedMain(content);
      if (count > 0) {
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        found[rel] = count;
      }
    }

    const unexpected: string[] = [];
    for (const [file, count] of Object.entries(found)) {
      const allowed = ALLOWED_BASELINE[file] ?? 0;
      if (allowed === 0) {
        unexpected.push(`${file} -> ${count} hardcoded usage(s)`);
        continue;
      }
      if (count > allowed) {
        unexpected.push(`${file} -> ${count} usage(s), allowed ${allowed}`);
      }
    }

    expect(
      unexpected,
      `New hardcoded tenantId:\"main\" detected. Move to tenant context or update allowlist with justification:\n${unexpected.join("\n")}`,
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADR-457 §Excepciones — comparaciones `tenantId|slug|tenant.id|tenant.slug
// ===/!== "literal"` en TODO el árbol. Dos reglas:
//   1. `"main"` sólo puede BAJAR por archivo (línea base de abajo). El papel de
//      `main` (marketplace / negocio por defecto / tenant protegido) se pregunta
//      con los helpers de `lib/tenancy/`, no con un literal.
//   2. Un literal de NEGOCIO distinto de `main` (un id o slug de un cliente) = 0
//      fuera de `lib/tenancy/`. Lo que no es un negocio se declara en
//      NO_ES_NEGOCIO con su razón.
// ─────────────────────────────────────────────────────────────────────────────

const TREE_DIRS = ["app", "lib", "components", "contexts", "hooks"].map((d) => path.join(ROOT, d));
const TREE_FILES = [path.join(ROOT, "proxy.ts")];

const COMPARACION = /(?:tenantId|slug|tenant\.id|tenant\.slug)\s*[!=]==\s*(["'])([^"'\n]*)\1/g;
/**
 * `"main"` comparado con CUALQUIER cosa y de los dos lados: `s === "main"` (el
 * carrito), `headerTenant !== "main"`, `"main" === x`. El patrón de arriba sólo
 * veía `tenantId|slug|tenant.id|tenant.slug` a la izquierda, y la revisión de
 * seguridad del 01-10 encontró 7 formas que se le escapaban.
 */
const COMPARA_MAIN = /[!=]==\s*(["'])main\1|(["'])main\2\s*[!=]==/g;

/** Literales que no son un negocio: tipos de JS, y slugs de otro dominio (especie, categoría, host). */
const NO_ES_NEGOCIO: Record<string, string> = {
  string: "typeof x === \"string\"",
  number: "typeof",
  boolean: "typeof",
  object: "typeof",
  undefined: "typeof",
  function: "typeof",
  otro: "slug de ESPECIE forestal («Otro»), no de negocio",
  otras: "slug de categoría de producto, no de negocio",
  www: "subdominio www del host, no de negocio",
  superadmin: "centinela de plataforma en support/tickets (no es un negocio); pendiente de ordenar en ADR-457",
};

// Línea base ACTUAL de `"main"` (sólo puede bajar). Se mide sin comentarios.
const MAIN_BASELINE: Record<string, number> = {
  // Las 4 que quedan son excepciones de NEGOCIO (no de papel de `main`), con TODO a ADR-457:
  "app/api/admin/seed-peru-products/route.ts": 1, // siembra de la bodega de prueba → acción de superadmin / pieza
  "app/api/cron/daily-summary/route.ts": 1, // NOTIFY_PHONE de main → opción del dueño
  "app/api/cron/stock-alerts-notify/route.ts": 1, // idem
  "app/api/cron/supplier-scoring/route.ts": 1, // idem
};

function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function escanearArbol(): Array<{ file: string; literal: string }> {
  const files = [...TREE_DIRS.flatMap((d) => walkFiles(d)), ...TREE_FILES].filter(
    (f) => !f.includes(`${path.sep}generated${path.sep}`) && !f.includes("node_modules"),
  );
  const out: Array<{ file: string; literal: string }> = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const src = sinComentarios(fs.readFileSync(file, "utf-8"));
    /* Los de negocio por el patrón con nombre; los de `main` por el amplio (una sola vez cada uno). */
    for (const m of src.matchAll(COMPARACION)) if (m[2] !== "main") out.push({ file: rel, literal: m[2] });
    for (const _m of src.matchAll(COMPARA_MAIN)) out.push({ file: rel, literal: "main" });
  }
  return out;
}

describe("Tenant guard - comparaciones con literal en todo el árbol (ADR-457)", () => {
  const hallazgos = escanearArbol();

  it('"main" sólo puede bajar por archivo (usar lib/tenancy/)', () => {
    const cuenta: Record<string, number> = {};
    for (const h of hallazgos) {
      if (h.literal === "main" && !h.file.startsWith("lib/tenancy/")) cuenta[h.file] = (cuenta[h.file] ?? 0) + 1;
    }
    const excedidos = Object.entries(cuenta)
      .filter(([f, n]) => n > (MAIN_BASELINE[f] ?? 0))
      .map(([f, n]) => `${f} -> ${n}, permitido ${MAIN_BASELINE[f] ?? 0}`);
    expect(
      excedidos,
      `Comparación nueva contra "main". Usá esMarketplace / esTenantPorDefecto / esTenantProtegido de @/lib/tenancy/negocio-por-defecto:\n${excedidos.join("\n")}`,
    ).toEqual([]);
  });

  it("la línea base no queda inflada: si bajó, bajala (el techo sólo baja)", () => {
    const cuenta: Record<string, number> = {};
    for (const h of hallazgos) {
      if (h.literal === "main") cuenta[h.file] = (cuenta[h.file] ?? 0) + 1;
    }
    const holgados = Object.entries(MAIN_BASELINE)
      .filter(([f, n]) => (cuenta[f] ?? 0) < n)
      .map(([f, n]) => `${f}: base ${n}, hay ${cuenta[f] ?? 0}`);
    expect(holgados, `Bajá la línea base:\n${holgados.join("\n")}`).toEqual([]);
  });

  it("0 literales de negocio distintos de main fuera de lib/tenancy/", () => {
    const negocios = hallazgos
      .filter((h) => h.literal !== "main" && !(h.literal in NO_ES_NEGOCIO) && !h.file.startsWith("lib/tenancy/"))
      .map((h) => `${h.file} -> "${h.literal}"`);
    expect(
      negocios,
      `Un id/slug de negocio escrito en el código. Va como dato (pieza / opción del dueño), no como literal (ADR-457):\n${negocios.join("\n")}`,
    ).toEqual([]);
  });
});
