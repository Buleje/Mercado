// Aplica la migración 318 (Fletes forestales). Idempotente.
// Uso: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-318-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/318-forest-flete.sql", "utf8");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error("❌ Falta DIRECT_URL/DATABASE_URL"); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const main = async () => {
  await c.connect();
  await c.query(sql);
  const tables = await c.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_name IN ('ForestFlete')`,
  );
  console.log("Tablas:", tables.rows.map((r) => r.table_name).join(", ") || "NONE");
  await c.end();
  console.log("✅ Migración 318 aplicada. Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => { console.error("❌", e.message); process.exit(1); });
