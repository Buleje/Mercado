#!/usr/bin/env node
/**
 * Ensayo de la migración del contrato (ADR-421) — NO escribe nada.
 *
 * Corre, dentro de UNA transacción que termina siempre en ROLLBACK:
 *   1) el EXPAND  (20260918190000_forest_contrato_eje/migration.sql)
 *   2) el SEMBRADO (adr-421-sembrar-contratos.sql, fase MIGRATE)
 *   3) los conteos de verificación sobre el tenant real
 * y después lo deshace todo. En Postgres el DDL es transaccional, así que al
 * salir la base queda exactamente como estaba.
 *
 * Por qué existe: un script que llama al parser no prueba nada (regla
 * `verificacion-de-verdad` §1). Esto corre el SQL de verdad contra la base de
 * verdad y muestra los números que van a quedar — antes de aplicarlo.
 *
 * Uso:  node scripts/adr-421-rehearse-contrato.mjs
 *       node scripts/adr-421-rehearse-contrato.mjs --tenant <tenantId>
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

const TENANT_DEFECTO = "cmpxiv6p4000bohvzwl6bnfpv"; // inversiones-agroforestales-blas-sociedad-anonima
const idx = process.argv.indexOf("--tenant");
const tenantId = idx > -1 ? process.argv[idx + 1] : TENANT_DEFECTO;

const expand = fs.readFileSync(
  path.resolve(process.cwd(), "prisma/migrations/20260918190000_forest_contrato_eje/migration.sql"),
  "utf8",
);
const sembrado = fs.readFileSync(
  path.resolve(process.cwd(), "prisma/migrations/adr-421-sembrar-contratos.sql"),
  "utf8",
);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ falta DATABASE_URL en .env.local");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
const c = await pool.connect();

const tablas = [
  "WoodEntry",
  "ForestCtpEntry",
  "ForestLoteAserrio",
  "Expense",
  "Adelanto",
  "ForestFlete",
  "ForestCuentaMov",
];

let salida = 0;
try {
  await c.query("BEGIN");

  const t0 = Date.now();
  await c.query(expand);
  console.log(`1 · EXPAND aplicado en ${Date.now() - t0} ms`);

  const t1 = Date.now();
  await c.query(sembrado);
  console.log(`2 · SEMBRADO aplicado en ${Date.now() - t1} ms\n`);

  const contratos = await c.query(
    `SELECT "codigoNorm", "titularNombre", "tipo" FROM "ForestContrato" WHERE "tenantId" = $1 ORDER BY "codigoNorm"`,
    [tenantId],
  );
  console.log(`Contratos que quedarían en el tenant: ${contratos.rowCount}`);
  for (const r of contratos.rows) {
    console.log(`   ${r.codigoNorm.padEnd(30)} ${String(r.tipo ?? "—").padEnd(9)} ${r.titularNombre}`);
  }

  console.log("\nImputación por tabla (con contrato / total del tenant):");
  for (const t of tablas) {
    const r = await c.query(
      `SELECT count(*) FILTER (WHERE "contratoId" IS NOT NULL)::int con, count(*)::int total
         FROM "${t}" WHERE "tenantId" = $1`,
      [tenantId],
    );
    const { con, total } = r.rows[0];
    console.log(`   ${t.padEnd(20)} ${String(con).padStart(4)} / ${String(total).padStart(4)}`);
  }

  const huerfanos = await c.query(
    `SELECT count(*)::int n FROM "WoodEntry" w
      WHERE w."contratoId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "ForestContrato" c WHERE c.id = w."contratoId" AND c."tenantId" = w."tenantId")`,
  );
  console.log(`\nVínculos a un contrato de OTRO tenant (tiene que ser 0): ${huerfanos.rows[0].n}`);
  if (huerfanos.rows[0].n !== 0) salida = 1;
} catch (e) {
  console.error("✗ el ensayo falló:", e.message);
  salida = 1;
} finally {
  await c.query("ROLLBACK");
  console.log("\n↩ ROLLBACK: la base quedó como estaba (0 filas escritas).");
  c.release();
  await pool.end();
}

process.exit(salida);
