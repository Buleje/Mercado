// Aplica la migración 306 (cacao labor: insumos/costos + recurrencia). Idempotente.
// Uso: DIRECT_URL= DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-306-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/306-cacao-labor-insumos-recurrencia.sql", "utf8");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("❌ Falta DIRECT_URL/DATABASE_URL (usá DOTENV_CONFIG_PATH=.env.local)");
  process.exit(1);
}
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const main = async () => {
  await c.connect();
  await c.query(sql);
  const cols = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='CacaoParcelaLabor' AND column_name IN ('insumo','dosis','costo','recurrenteDias')`,
  );
  console.log("Columnas nuevas:", cols.rows.map((r) => r.column_name).join(", ") || "NONE");
  await c.end();
  console.log("✅ Migración 306 aplicada.  Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => { console.error("❌", e.message); process.exit(1); });
