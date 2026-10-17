// Aplica la migración 373 (la libreta guarda zona del destinatario y placa de
// remolque del vehículo). Idempotente: se puede correr las veces que haga falta.
// Uso: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-373-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/373-libreta-zona-y-remolque.sql", "utf8");

/**
 * DIRECT_URL primero, con fallback al POOLER.
 *
 * El fallback tiene que ser por ERROR DE CONEXIÓN, no por ausencia: `DIRECT_URL`
 * suele estar DEFINIDA y aun así `db.<ref>.supabase.co` no resolver (gotcha
 * conocido del repo). Este DDL es `ADD COLUMN IF NOT EXISTS` puro, así que pasa
 * por pgBouncer sin problema.
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
      // Cerrar una conexión que nunca abrió puede tirar: da igual, ya se sabe
      // que no sirvió y lo que importa es probar la candidata siguiente.
      await cli.end().catch(() => {});
    }
  }
  throw ultimo;
}

const main = async () => {
  const c = await conectar();
  c.on("notice", (n) => console.log(`   ${n.message}`));
  await c.query(sql);

  const cols = await c.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE (table_name = 'ForestParty' AND column_name = 'zona')
         OR (table_name = 'ForestVehiculo' AND column_name = 'placaRemolque')
      ORDER BY table_name`,
  );
  console.log(
    `Columnas nuevas (${cols.rows.length}/2): ` +
      (cols.rows.map((r) => `${r.table_name}.${r.column_name}`).join(", ") || "NINGUNA"),
  );
  if (cols.rows.length !== 2) { await c.end(); console.error("❌ Falta alguna columna."); process.exit(1); }

  await c.end();
  console.log("✅ Migración 373 aplicada. Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => { console.error("❌", e.message); process.exit(1); });
