// Aplica la migración 318b (ADR-318 addendum: el viaje distingue vehículo
// propio de flete de tercero, y guarda el nombre del conductor aunque no esté
// en la libreta). Idempotente: se puede correr las veces que haga falta.
// Uso: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/apply-318b-migration.mjs
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("prisma/manual-migrations/318b-forest-flete-tipo-transporte.sql", "utf8");

/**
 * DIRECT_URL primero, con fallback al POOLER.
 *
 * El fallback tiene que ser por ERROR DE CONEXIÓN, no por ausencia: `DIRECT_URL`
 * suele estar DEFINIDA y aun así `db.<ref>.supabase.co` no resolver (gotcha
 * conocido del repo). Este DDL es `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF
 * NOT EXISTS` puro, así que pasa por pgBouncer sin problema.
 */
const candidatas = [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(Boolean);
if (candidatas.length === 0) {
  console.error("❌ Falta DIRECT_URL/DATABASE_URL");
  process.exit(1);
}

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
      console.log(
        `  (no se pudo por ${connectionString === process.env.DIRECT_URL ? "DIRECT_URL" : "el pooler"}: ${e.message})`,
      );
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
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ForestFlete' AND column_name IN ('tipoTransporte', 'conductorNombre')
      ORDER BY column_name`,
  );
  console.log(`Columnas nuevas (${cols.rows.length}/2): ${cols.rows.map((r) => r.column_name).join(", ") || "NINGUNA"}`);

  const idx = await c.query(
    `SELECT indexname FROM pg_indexes
      WHERE tablename = 'ForestFlete' AND indexname = 'ForestFlete_tenantId_tipoTransporte_idx'`,
  );
  console.log(`Índice (${idx.rows.length}/1): ${idx.rows.map((r) => r.indexname).join(", ") || "NINGUNO"}`);

  /**
   * Los viajes que ya estaban anotados antes de que existiera la columna se
   * quedaron con el DEFAULT `privado` — que en el vocabulario del módulo
   * significa "vehículo propio, no genera deuda". Un viaje viejo con
   * transportista de tercero cargado NO es eso. Acá sólo se AVISA: cambiarlo
   * es una decisión de negocio, no del DDL, y este script se corre más de una
   * vez (un UPDATE ciego le pisaría a Brandon un `privado` puesto a mano).
   */
  const sospechosos = await c.query(
    `SELECT count(*)::int AS n FROM "ForestFlete"
      WHERE "deletedAt" IS NULL
        AND "tipoTransporte" = 'privado'
        AND ("transportistaId" IS NOT NULL OR NULLIF(btrim("transportistaNombre"), '') IS NOT NULL)`,
  );
  const n = sospechosos.rows[0].n;
  if (n > 0) {
    console.log(
      `⚠️  ${n} viaje(s) quedaron en 'privado' (propio) pero tienen transportista de tercero cargado.\n` +
        `   Revisalos en el módulo Fletes: si son fletes pagados, marcalos como "Flete (tercero)".`,
    );
  } else {
    console.log("Sin viajes 'privado' con transportista de tercero: nada que revisar.");
  }

  if (cols.rows.length !== 2 || idx.rows.length !== 1) {
    await c.end();
    console.error("❌ Falta alguna columna o el índice.");
    process.exit(1);
  }

  await c.end();
  console.log("✅ Migración 318b aplicada. Después: npx prisma generate + reiniciar dev.");
};
main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
