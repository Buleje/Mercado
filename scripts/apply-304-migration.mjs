// Aplica la migración 304 (cacao: manejo de campo — parcelas + labores). Idempotente.
// Uso: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-304-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/304-cacao-campo-parcelas.sql", "utf8");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("❌ Falta DIRECT_URL/DATABASE_URL (usá DOTENV_CONFIG_PATH=.env.local)");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const main = async () => {
  await c.connect();
  await c.query(sql);
  const t = await c.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name IN ('CacaoParcela','CacaoParcelaLabor')`,
  );
  console.log("Tablas nuevas:", t.rows.map((r) => r.table_name).join(", ") || "NONE");
  await c.end();
  console.log("✅ Migración 304 aplicada.  Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
