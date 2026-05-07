#!/usr/bin/env node
/**
 * force-apply-critical-migrations.mjs
 *
 * Aplica el SQL crudo de las 4 migraciones críticas que están marcadas como
 * aplicadas en _prisma_migrations PERO cuyas tablas no existen en DB
 * (drift detectado por check-schema-drift.mjs).
 *
 * Migraciones target:
 *   - 20260418000000_add_subscription_bodega_al_mes
 *   - 20260418120000_add_gift_cards_hmac
 *   - 20260418152307_add_vendor_application_workflow
 *   - 20260418202046_add_socio_buleje_membership
 *
 * SAFETY:
 *   - Ejecuta cada CREATE TABLE / CREATE INDEX por separado
 *   - Ignora errores "already exists" (idempotente)
 *   - Cualquier otro error aborta esa migration y continúa con la siguiente
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const C = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", bold: "\x1b[1m", dim: "\x1b[2m",
};
const c = (color, s) => `${C[color]}${s}${C.reset}`;

const TARGETS = [
  "20260418000000_add_subscription_bodega_al_mes",
  "20260418120000_add_gift_cards_hmac",
  "20260418152307_add_vendor_application_workflow",
  "20260418202046_add_socio_buleje_membership",
];

/**
 * Splitea el SQL en statements respetando bloques (no soporta funciones complejas,
 * pero suficiente para CREATE TABLE / ALTER / CREATE INDEX simples).
 */
function splitStatements(sql) {
  // Eliminar comentarios -- de cada línea
  const cleaned = sql.split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
  // Splitear por ; al final de línea (statement boundaries)
  return cleaned.split(/;\s*\n/).map((s) => s.trim()).filter((s) => s.length > 0);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL requerida");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const migDir = path.join(process.cwd(), "prisma", "migrations");

  let totalOk = 0, totalSkipped = 0, totalErr = 0;

  for (const m of TARGETS) {
    const sqlPath = path.join(migDir, m, "migration.sql");
    if (!fs.existsSync(sqlPath)) {
      console.log(c("yellow", `⚠ ${m}: sin migration.sql, skip`));
      continue;
    }
    const sql = fs.readFileSync(sqlPath, "utf8");
    const statements = splitStatements(sql);

    console.log("");
    console.log(c("cyan", c("bold", `▶ ${m} (${statements.length} statements)`)));

    let ok = 0, skipped = 0, err = 0;
    for (const stmt of statements) {
      try {
        await client.query(stmt);
        ok++;
      } catch (e) {
        const msg = e.message ?? "";
        if (/already exists|duplicate|exists.*skipping/i.test(msg)) {
          skipped++;
        } else {
          err++;
          // Imprimir primeras 80 chars del statement + error
          const preview = stmt.slice(0, 80).replace(/\s+/g, " ");
          console.log(c("red", `  ❌ "${preview}..." → ${msg}`));
        }
      }
    }

    const summary = [
      ok > 0 ? c("green", `✓ ${ok} ok`) : null,
      skipped > 0 ? c("yellow", `↷ ${skipped} skipped`) : null,
      err > 0 ? c("red", `✗ ${err} err`) : null,
    ].filter(Boolean).join(" · ");
    console.log(`  ${summary}`);

    totalOk += ok; totalSkipped += skipped; totalErr += err;
  }

  console.log("");
  console.log(c("bold", "─".repeat(60)));
  console.log(c("bold", "Total:"));
  console.log(`  ${c("green", `✓ ${totalOk}`)} statements OK`);
  console.log(`  ${c("yellow", `↷ ${totalSkipped}`)} ya existían (idempotente)`);
  if (totalErr > 0) console.log(`  ${c("red", `✗ ${totalErr}`)} errores`);

  await client.end();
}

main().catch((e) => {
  console.error(c("red", `FATAL: ${e.message}`));
  process.exit(1);
});
