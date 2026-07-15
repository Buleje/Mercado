#!/usr/bin/env node
/**
 * apply-sql.mjs — aplica un archivo .sql contra Supabase vía el POOLER (DATABASE_URL).
 *
 * POR QUÉ EXISTE: `prisma migrate deploy` necesita DIRECT_URL, que desde WSL/esta red
 * resuelve ENOTFOUND (db.<ref>.supabase.co). El pooler (DATABASE_URL) sí responde.
 * Formaliza el patrón que ya usaban scripts/credit-requests-migration.sql y cía.
 *
 * Uso:
 *   node scripts/apply-sql.mjs scripts/mi-migracion.sql            # aplica (en transacción)
 *   node scripts/apply-sql.mjs scripts/mi-migracion.sql --dry-run  # imprime, no ejecuta
 *
 * Atómico: BEGIN → SQL → COMMIT. Cualquier error ⇒ ROLLBACK completo.
 * OJO: `CREATE INDEX CONCURRENTLY` NO puede correr en transacción — para eso usá --no-tx.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const noTx = process.argv.includes("--no-tx");

if (!file) {
  console.error("uso: node scripts/apply-sql.mjs <archivo.sql> [--dry-run] [--no-tx]");
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), file);
if (!fs.existsSync(sqlPath)) {
  console.error(`✗ no existe: ${sqlPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");

if (dryRun) {
  console.log(`── DRY RUN · ${file} ──\n`);
  console.log(sql);
  console.log(`\n── ${sql.split("\n").length} líneas · NO se ejecutó nada ──`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ falta DATABASE_URL en .env.local");
  process.exit(1);
}

const host = url.match(/@([^:/]+)/)?.[1] ?? "?";
console.log(`── aplicando ${file}\n   host: ${host}\n   modo: ${noTx ? "sin transacción" : "transacción atómica"}\n`);

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
const client = await pool.connect();
const t0 = Date.now();

try {
  if (!noTx) await client.query("BEGIN");
  await client.query(sql);
  if (!noTx) await client.query("COMMIT");
  console.log(`✓ aplicado en ${Date.now() - t0}ms`);
} catch (err) {
  if (!noTx) await client.query("ROLLBACK").catch(() => {});
  console.error(`✗ FALLÓ${noTx ? " (sin tx: puede haber quedado a medias)" : " — ROLLBACK aplicado, la DB quedó intacta"}`);
  console.error(`  ${err.message}`);
  if (err.position) console.error(`  posición: ${err.position}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end().catch(() => {});
}
