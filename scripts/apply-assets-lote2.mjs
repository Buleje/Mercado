// Aplica la migración assets_lote2 vía pg (prisma migrate no corre acá).
// Uso: node -r dotenv/config scripts/apply-assets-lote2.mjs dotenv_config_path=.env.local
import pg from "pg";
import { readFileSync } from "node:fs";

const dir = readFileSync("/tmp/migdir2.txt", "utf8").trim();
const sql = readFileSync(`${dir}/migration.sql`, "utf8");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL/DIRECT_URL"); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Asset' AND column_name IN ('purchaseDate','salvageValue','lat','lng')`);
  const t = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('AssetOperator','AssetDocument','AssetPhoto','AssetClientRate')`);
  console.log("✅ Migración lote 2 aplicada");
  console.log("Asset cols nuevas:", cols.rows.map(r => r.column_name).join(", "));
  console.log("Tablas nuevas:", t.rows.map(r => r.table_name).join(", "));
} catch (e) { console.error("❌", e.message); process.exit(1); } finally { await client.end(); }
