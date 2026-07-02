// Aplica la migración 305 (cacao campo: polígono de la parcela). Idempotente.
// Uso: DIRECT_URL= DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-305-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/305-cacao-parcela-poligono.sql", "utf8");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("❌ Falta DIRECT_URL/DATABASE_URL (usá DOTENV_CONFIG_PATH=.env.local)");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const main = async () => {
  await c.connect();
  await c.query(sql);
  const col = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='CacaoParcela' AND column_name='poligono'`,
  );
  console.log("Columna poligono:", col.rows.length ? "OK" : "NONE");
  await c.end();
  console.log("✅ Migración 305 aplicada.  Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
