// Aplica la migración ADR-298 (dropshipping) vía DIRECT_URL. Idempotente.
// Uso: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-298-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/298-dropshipping.sql", "utf8");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error("❌ Falta DIRECT_URL/DATABASE_URL (usá DOTENV_CONFIG_PATH=.env.local)"); process.exit(1); }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const main = async () => {
  await c.connect();
  await c.query(sql);
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Product' AND column_name IN ('isDropship','dropshipSupplierId','supplierSku','supplierUrl')`);
  const tbl = await c.query(`SELECT to_regclass('public."DropshipFulfillment"') AS t`);
  const flag = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Settings' AND column_name='dropshipEnabled'`);
  console.log("Product dropship cols:", cols.rows.map(r => r.column_name).join(", ") || "NONE");
  console.log("DropshipFulfillment table:", tbl.rows[0].t || "MISSING");
  console.log("Settings.dropshipEnabled:", flag.rows[0]?.column_name || "MISSING");
  await c.end();
  console.log("✅ Migración ADR-298 aplicada.  Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => { console.error("❌", e.message); process.exit(1); });
