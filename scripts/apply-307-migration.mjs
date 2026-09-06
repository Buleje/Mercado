// Aplica la migración 307 (cacao: trazabilidad Cosecha→Acopio). Idempotente.
// Uso: DIRECT_URL= DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-307-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/307-cacao-cosecha-acopio.sql", "utf8");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error("❌ Falta DIRECT_URL/DATABASE_URL"); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const main = async () => {
  await c.connect();
  await c.query(sql);
  const a = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='CacaoLote' AND column_name IN ('parcelaId','parcelaCodigo')`);
  const b = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='CacaoParcelaLabor' AND column_name='loteId'`);
  console.log("CacaoLote:", a.rows.map((r) => r.column_name).join(", ") || "NONE", "| Labor.loteId:", b.rows.length ? "OK" : "NONE");
  await c.end();
  console.log("✅ Migración 307 aplicada.  Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => { console.error("❌", e.message); process.exit(1); });
