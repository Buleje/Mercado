/**
 * apply-product-modifiers-migration.mjs
 *
 * Aplica la migration 20260425230000_product_modifiers directamente al DB
 * (DATABASE_URL via pgBouncer) usando el cliente pg, registrandola luego en
 * _prisma_migrations para que `prisma migrate status` la vea como aplicada.
 *
 * Necesario porque DIRECT_URL no resuelve desde la red local — patron
 * consolidado en scripts/register-store-migration.mjs.
 *
 * Uso: node scripts/apply-product-modifiers-migration.mjs
 */
import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MIGRATION_NAME = "20260425230000_product_modifiers";
const MIGRATION_DIR = path.join("prisma", "migrations", MIGRATION_NAME);
const SQL_PATH = path.join(MIGRATION_DIR, "migration.sql");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const sql = fs.readFileSync(SQL_PATH, "utf8");
console.log(`Applying migration: ${MIGRATION_NAME} (${sql.length} bytes)`);

// Split por bloques DO $$ … $$ porque pg.Client no soporta multi-statement
// con dollar-quoted strings cuando se mezcla con CREATE TABLE en una sola
// query. Aplicamos el SQL completo via $1 que lo ejecuta secuencialmente.
await client.query(sql);
console.log("✓ migration applied");

// Registrar en _prisma_migrations para sync con prisma migrate status
const checksum = crypto.createHash("sha256").update(sql).digest("hex");
const id = crypto.randomUUID();
const now = new Date();

await client.query(
  `INSERT INTO "_prisma_migrations"
     (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
   VALUES ($1, $2, $3, $4, NULL, NULL, $3, 1)
   ON CONFLICT (id) DO NOTHING;`,
  [id, checksum, now, MIGRATION_NAME],
);

const { rows } = await client.query(
  `SELECT migration_name, finished_at, applied_steps_count
   FROM "_prisma_migrations" WHERE migration_name = $1;`,
  [MIGRATION_NAME],
);
console.log("Registered:", rows);

// Sanity check
const tables = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_name IN ('ProductModifierGroup', 'ProductModifierOption');
`);
console.log("Tables:", tables.rows.map((r) => r.table_name));

const orderItemColumn = await client.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'OrderItem' AND column_name = 'modifiersJson';
`);
console.log(
  "OrderItem.modifiersJson:",
  orderItemColumn.rows.length > 0 ? "✓ exists" : "MISSING",
);

await client.end();
console.log("✓ done");
