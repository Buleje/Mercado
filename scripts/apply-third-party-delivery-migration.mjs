// One-shot: aplica la migración 20260516111954_tenant_use_third_party_delivery
// usando DIRECT_URL. Registra en _prisma_migrations para que prisma no quede
// out-of-sync.
//
// Uso: node -r dotenv/config scripts/apply-third-party-delivery-migration.mjs dotenv_config_path=.env.local
import pg from "pg";
import crypto from "node:crypto";
import fs from "node:fs";

const MIG_NAME = "20260516111954_tenant_use_third_party_delivery";
const SQL_PATH = `prisma/migrations/${MIG_NAME}/migration.sql`;
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("No DIRECT_URL/DATABASE_URL");

const sql = fs.readFileSync(SQL_PATH, "utf8");
const checksum = crypto.createHash("sha256").update(sql).digest("hex");

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

// 1) Apply DDL (idempotente — IF NOT EXISTS).
await c.query(sql);
console.log("✓ DDL aplicado");

// 2) Confirmar columna existe.
const colCheck = await c.query(`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name='Tenant' AND column_name='useThirdPartyDelivery'
`);
console.log("Column:", colCheck.rows[0] ?? "NO ENCONTRADA");

// 3) Registrar en _prisma_migrations si no existe.
const existing = await c.query(
  `SELECT id, finished_at FROM _prisma_migrations WHERE migration_name = $1`,
  [MIG_NAME],
);
if (existing.rows.length === 0) {
  await c.query(
    `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
     VALUES ($1, $2, $3, NOW(), NOW(), 1)`,
    [crypto.randomUUID(), checksum, MIG_NAME],
  );
  console.log("✓ Registro insertado en _prisma_migrations");
} else if (existing.rows[0].finished_at === null) {
  await c.query(
    `UPDATE _prisma_migrations SET finished_at = NOW(), applied_steps_count = 1, checksum = $1 WHERE migration_name = $2`,
    [checksum, MIG_NAME],
  );
  console.log("✓ Registro existente marcado como finished");
} else {
  console.log("→ ya estaba registrado");
}

await c.end();
console.log("✅ Migración aplicada y registrada");
