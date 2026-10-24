// Aplica la migración 309 (cacao: monitoreo fitosanitario). Idempotente.
// Uso: DIRECT_URL= DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-309-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/309-cacao-sanidad.sql", "utf8");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error("❌ Falta DIRECT_URL/DATABASE_URL"); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const main = async () => {
  await c.connect();
  await c.query(sql);
  const t = await c.query(`SELECT to_regclass('public."CacaoSanidad"') AS tbl`);
  console.log("Tabla CacaoSanidad:", t.rows[0].tbl ? "OK" : "NONE");
  await c.end();
  console.log("✅ Migración 309 aplicada.  Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => { console.error("❌", e.message); process.exit(1); });
