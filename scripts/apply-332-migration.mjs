// Aplica la migración 332 (ficha completa del beneficiario de adelantos:
// identidad SUNAT/RENIEC, contacto, datos bancarios y baja lógica). Idempotente.
// Uso: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-332-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/332-adelanto-vencimiento.sql", "utf8");

/**
 * DIRECT_URL primero, con fallback al POOLER.
 *
 * El fallback tiene que ser por ERROR DE CONEXIÓN, no por ausencia: `DIRECT_URL`
 * suele estar DEFINIDA y aun así `db.<ref>.supabase.co` no resolver (gotcha
 * conocido del repo). Este DDL es simple —ADD COLUMN IF NOT EXISTS— así que
 * pasa por pgBouncer sin problema.
 */
const candidatas = [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(Boolean);
if (candidatas.length === 0) { console.error("❌ Falta DIRECT_URL/DATABASE_URL"); process.exit(1); }

async function conectar() {
  let ultimo;
  for (const connectionString of candidatas) {
    const cli = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
      await cli.connect();
      console.log(`Conectado por ${connectionString === process.env.DIRECT_URL ? "DIRECT_URL" : "el pooler"}.`);
      return cli;
    } catch (e) {
      ultimo = e;
      console.log(`  (no se pudo por ${connectionString === process.env.DIRECT_URL ? "DIRECT_URL" : "el pooler"}: ${e.message})`);
      await cli.end().catch(() => {});
    }
  }
  throw ultimo;
}

const main = async () => {
  const c = await conectar();
  for (const stmt of sql.split(/;\s*\n(?=(?:--|ALTER|CREATE|DO))/)) {
    const s = stmt.trim();
    if (!s || s.replace(/--[^\n]*/g, "").trim() === "") continue;
    await c.query(s.endsWith(";") ? s : `${s};`);
  }
  const cols = await c.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'Adelanto' AND column_name = 'fechaVencimiento'`,
  );
    console.log(`Columnas (${cols.rows.length}/1):`, cols.rows.map((r) => r.column_name).join(", ") || "NINGUNA");
  await c.end();
  console.log("✅ Migración 332 aplicada. Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => { console.error("❌", e.message); process.exit(1); });
