// Aplica la migración 349 (ForestCtpPaquete: el paquete de producto terminado
// con su código, su presentación y sus dimensiones).
// Idempotente: se puede correr las veces que haga falta.
// Uso: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-349-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/349-ctp-paquetes-produccion.sql", "utf8");

/**
 * DIRECT_URL primero, con fallback al POOLER.
 *
 * El fallback tiene que ser por ERROR DE CONEXIÓN, no por ausencia: `DIRECT_URL`
 * suele estar DEFINIDA y aun así `db.<ref>.supabase.co` no resolver (gotcha
 * conocido del repo). Este DDL es simple —ADD COLUMN / CREATE INDEX IF NOT
 * EXISTS— así que pasa por pgBouncer sin problema.
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
  // El bloque DO lleva `;` adentro: se manda entero, no partido por statement.
  c.on("notice", (n) => console.log(`   ${n.message}`));
  await c.query(sql);

  const cols = await c.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ForestCtpPaquete' ORDER BY column_name`,
  );
  const idx = await c.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'ForestCtpPaquete' ORDER BY indexname`,
  );
  console.log(`ForestCtpPaquete: ${cols.rows.length} columnas · ${idx.rows.length} índices`);
  console.log("  ", cols.rows.map((r) => r.column_name).join(", ") || "NINGUNA");

  await c.end();
  console.log("✅ Migración 349 aplicada. Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => { console.error("❌", e.message); process.exit(1); });
