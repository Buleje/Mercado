// Aplica la migración 327 (ventana y titular del lote). Idempotente.
// Uso: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-327-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/327-lote-ventana-titular.sql", "utf8");
// DIRECT_URL primero, pero con fallback al POOLER: el DNS de `db.<ref>.supabase.co`
// no resuelve en algunas redes (gotcha conocido del repo) y este DDL es simple
// —ALTER TABLE ADD COLUMN IF NOT EXISTS— así que pasa por pgBouncer sin problema.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error("❌ Falta DIRECT_URL/DATABASE_URL"); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const main = async () => {
  await c.connect();
  await c.query(sql);
  const cols = await c.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'ForestProdLote'
       AND column_name IN ('fechaInicio','fechaFin','titularId','titularNombre')
     ORDER BY column_name`,
  );
  console.log("Columnas:", cols.rows.map((r) => r.column_name).join(", ") || "NINGUNA");
  await c.end();
  console.log("✅ Migración 327 aplicada. Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => { console.error("❌", e.message); process.exit(1); });
