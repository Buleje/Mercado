#!/usr/bin/env node
/**
 * forestal-ctp-migration-rehearse.mjs — ENSAYO de la migración ADR-134 contra la DB REAL.
 *
 * Corre el SQL completo (DDL + backfill) dentro de una transacción, verifica las
 * invariantes CONTRA LOS DATOS REALES, y hace ROLLBACK SIEMPRE. No aplica nada.
 *
 * Por qué existe: `--dry-run` de apply-sql.mjs sólo imprime el archivo. Eso no
 * prueba que el DDL compile, ni que el backfill matchee lo que el ADR dice que
 * matchea, ni que las invariantes se cumplan. Esto sí — y sin tocar prod.
 *
 * Postgres hace DDL transaccional ⇒ CREATE TABLE / ALTER / INSERT revierten enteros.
 *
 * Uso: node scripts/forestal-ctp-migration-rehearse.mjs
 * Exit 0 = el SQL aplica limpio y las invariantes se cumplen ⇒ apto para apply-sql.mjs
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SQL_FILE = "scripts/forestal-ctp-fk-costos-migration.sql";
const sql = fs.readFileSync(path.resolve(process.cwd(), SQL_FILE), "utf8");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ falta DATABASE_URL en .env.local");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
const client = await pool.connect();
const q = async (s, p) => (await client.query(s, p)).rows;

let failed = 0;
const check = (label, pass, detail = "") => {
  if (!pass) failed++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};

console.log(`\n── ENSAYO ADR-134 · ${SQL_FILE}`);
console.log(`   host: ${url.match(/@([^:/]+)/)?.[1] ?? "?"}`);
console.log(`   ⚠️  todo se REVIERTE al final — no se aplica nada\n`);

try {
  await client.query("BEGIN");

  // ── Estado ANTES ────────────────────────────────────────────────────────
  const [{ count: ctpAntes }] = await q(`SELECT COUNT(*)::int AS count FROM "ForestCtpEntry" WHERE "deletedAt" IS NULL`);
  const [{ count: woodAntes }] = await q(`SELECT COUNT(*)::int AS count FROM "WoodEntry" WHERE "deletedAt" IS NULL`);
  console.log(`── ANTES: ${ctpAntes} ForestCtpEntry vivas · ${woodAntes} WoodEntry vivas\n`);

  // ── Aplicar el SQL completo ─────────────────────────────────────────────
  const t0 = Date.now();
  await client.query(sql);
  console.log(`── SQL aplicado sin error (${Date.now() - t0}ms)\n`);

  // ── 1. DDL ──────────────────────────────────────────────────────────────
  console.log("── DDL");
  const cols = await q(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name = 'WoodEntry'        AND column_name IN ('supplierId','costoTotal','moneda'))
       OR (table_name = 'ForestCtpEntry'   AND column_name IN ('costoProceso','moneda'))
       OR  table_name = 'ForestCtpConsumo'`);
  check("WoodEntry: supplierId + costoTotal + moneda", cols.filter((c) => c.table_name === "WoodEntry").length === 3);
  check("ForestCtpEntry: costoProceso + moneda", cols.filter((c) => c.table_name === "ForestCtpEntry").length === 2);
  check("ForestCtpConsumo creada", cols.filter((c) => c.table_name === "ForestCtpConsumo").length >= 9);

  // El FK escalar descartado NO debe existir (rev. 2 · D5)
  const escalar = await q(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ForestCtpEntry' AND column_name IN ('woodEntryId','costoMateriaPrima','costoTotal')`);
  check("FK escalar woodEntryId + costos derivados NO se crean (D5/D6)", escalar.length === 0,
    escalar.length ? `${escalar.length} columna(s) fantasma de la rev.1` : "");

  const fks = await q(`
    SELECT conname, convalidated FROM pg_constraint
    WHERE conname IN ('ForestCtpConsumo_ctpEntryId_fkey','ForestCtpConsumo_woodEntryId_fkey','WoodEntry_supplierId_fkey')`);
  check("3 FKs creados y VALIDADOS", fks.length === 3 && fks.every((f) => f.convalidated),
    `${fks.filter((f) => f.convalidated).length}/3 validados`);

  // ── 2. Backfill ─────────────────────────────────────────────────────────
  console.log("\n── BACKFILL");
  const consumos = await q(`
    SELECT c."tenantId", c."volumeM3", c."createdBy", c."costoUnitarioSnap",
           e."section", e."lineNo", e."gtfIngreso", e."speciesCommon", e."volumeInputM3",
           w."gtfNumber", w."speciesCommonName", w."volumeM3" AS wood_vol
    FROM "ForestCtpConsumo" c
    JOIN "ForestCtpEntry" e ON e."id" = c."ctpEntryId"
    JOIN "WoodEntry"      w ON w."id" = c."woodEntryId"`);
  console.log(`  consumos creados: ${consumos.length}`);
  if (consumos.length) console.table(consumos);
  check("Backfill creó exactamente 1 consumo (lo medido en el ADR)", consumos.length === 1);
  check("El consumo es 8.4500 m³ de la GTF 001-0000120 / Tornillo",
    consumos.length === 1 && Number(consumos[0].volumeM3) === 8.45 && consumos[0].gtfNumber === "001-0000120");
  check("Costo arranca NULL (factura llega después — D6)",
    consumos.every((c) => c.costoUnitarioSnap === null));
  check("La línea de despacho NO recibió consumos",
    consumos.every((c) => c.section === "produccion"));

  // ── 3. Invariantes (D7) ─────────────────────────────────────────────────
  console.log("\n── INVARIANTES");
  const i1 = await q(`
    SELECT e."id", e."lineNo", e."volumeInputM3", SUM(c."volumeM3") AS atribuido
    FROM "ForestCtpEntry" e JOIN "ForestCtpConsumo" c ON c."ctpEntryId" = e."id"
    GROUP BY e."id", e."lineNo", e."volumeInputM3"
    HAVING SUM(c."volumeM3") > e."volumeInputM3"`);
  check("I1 · Σ consumos ≤ volumeInputM3 (la atribución no excede lo declarado)", i1.length === 0,
    i1.length ? `${i1.length} línea(s) sobre-atribuidas` : "0 violaciones");

  const i2 = await q(`
    SELECT w."id", w."gtfNumber", w."volumeM3", SUM(c."volumeM3") AS consumido
    FROM "WoodEntry" w JOIN "ForestCtpConsumo" c ON c."woodEntryId" = w."id"
    GROUP BY w."id", w."gtfNumber", w."volumeM3"
    HAVING SUM(c."volumeM3") > w."volumeM3"`);
  check("I2 · Σ consumos ≤ WoodEntry.volumeM3 (un ingreso no se consume dos veces)", i2.length === 0,
    i2.length ? `${i2.length} ingreso(s) sobre-consumidos` : "0 violaciones");

  const fuga = await q(`
    SELECT c."id" FROM "ForestCtpConsumo" c
    JOIN "ForestCtpEntry" e ON e."id" = c."ctpEntryId"
    JOIN "WoodEntry"      w ON w."id" = c."woodEntryId"
    WHERE c."tenantId" <> e."tenantId" OR c."tenantId" <> w."tenantId"`);
  check("Fuga cross-tenant (consumo/línea/ingreso mismo tenant)", fuga.length === 0);

  const sinAtribuir = await q(`
    SELECT e."lineNo", e."gtfIngreso", e."volumeInputM3",
           e."volumeInputM3" - COALESCE((SELECT SUM(c."volumeM3") FROM "ForestCtpConsumo" c WHERE c."ctpEntryId" = e."id"), 0) AS sin_atribuir
    FROM "ForestCtpEntry" e
    WHERE e."section" = 'produccion' AND e."deletedAt" IS NULL AND e."volumeInputM3" IS NOT NULL`);
  console.log("\n  volumen declarado vs atribuido:");
  console.table(sinAtribuir);
  check("La línea demo queda 100% atribuida (residuo 0)",
    sinAtribuir.length === 1 && Number(sinAtribuir[0].sin_atribuir) === 0);

  // ── 4. Datos preexistentes intactos ─────────────────────────────────────
  console.log("\n── DATOS PREEXISTENTES (el acta legal, D2)");
  const [{ count: ctpDespues }] = await q(`SELECT COUNT(*)::int AS count FROM "ForestCtpEntry" WHERE "deletedAt" IS NULL`);
  const [{ count: woodDespues }] = await q(`SELECT COUNT(*)::int AS count FROM "WoodEntry" WHERE "deletedAt" IS NULL`);
  check("Ninguna fila creada/borrada en ForestCtpEntry", ctpDespues === ctpAntes, `${ctpAntes} → ${ctpDespues}`);
  check("Ninguna fila creada/borrada en WoodEntry", woodDespues === woodAntes, `${woodAntes} → ${woodDespues}`);
  const acta = await q(`
    SELECT COUNT(*)::int AS n FROM "WoodEntry" WHERE "deletedAt" IS NULL AND ("providerName" IS NULL OR "providerName" = '')`);
  check("providerName intacto en todas (NOT NULL, D2)", acta[0].n === 0);
  const gtf = await q(`SELECT COUNT(*)::int AS n FROM "ForestCtpEntry" WHERE "lineNo" = 1 AND section = 'produccion' AND "gtfIngreso" = '001-0000120'`);
  check("gtfIngreso intacto (el texto nunca se toca)", gtf[0].n === 1);

  // ── 5. Idempotencia — correr el SQL de nuevo ────────────────────────────
  console.log("\n── IDEMPOTENCIA (2ª corrida del mismo SQL)");
  await client.query(sql);
  const [{ count: consumos2 }] = await q(`SELECT COUNT(*)::int AS count FROM "ForestCtpConsumo"`);
  check("2ª corrida no duplica consumos ni falla", consumos2 === consumos.length, `${consumos.length} → ${consumos2}`);

  // ── 6. Las invariantes MUERDEN (control negativo) ───────────────────────
  //     Si un test de invariante nunca falla, no está probando nada.
  console.log("\n── CONTROL NEGATIVO (¿los guards de Postgres muerden?)");
  const woodId = await q(`SELECT "id", "tenantId" FROM "WoodEntry" WHERE "deletedAt" IS NULL LIMIT 1`);
  const ctpId = await q(`SELECT "id" FROM "ForestCtpEntry" WHERE section = 'produccion' LIMIT 1`);

  const rechaza = async (label, sqlBad) => {
    await client.query("SAVEPOINT sp");
    try {
      await client.query(sqlBad);
      await client.query("ROLLBACK TO SAVEPOINT sp");
      check(label, false, "NO fue rechazado (el guard no existe)");
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT sp");
      check(label, true, e.message.split("\n")[0].slice(0, 60));
    }
  };

  await rechaza("CHECK volumeM3 > 0 rechaza un consumo de 0",
    `INSERT INTO "ForestCtpConsumo" ("id","tenantId","ctpEntryId","woodEntryId","volumeM3","createdBy")
     VALUES (gen_random_uuid()::text, '${woodId[0].tenantId}', '${ctpId[0].id}', '${woodId[0].id}', 0, 'test')`);
  await rechaza("UNIQUE (ctpEntryId, woodEntryId) rechaza duplicado",
    `INSERT INTO "ForestCtpConsumo" ("id","tenantId","ctpEntryId","woodEntryId","volumeM3","createdBy")
     SELECT gen_random_uuid()::text, "tenantId", "ctpEntryId", "woodEntryId", 1, 'test' FROM "ForestCtpConsumo" LIMIT 1`);
  await rechaza("FK rechaza woodEntryId inexistente",
    `INSERT INTO "ForestCtpConsumo" ("id","tenantId","ctpEntryId","woodEntryId","volumeM3","createdBy")
     VALUES (gen_random_uuid()::text, '${woodId[0].tenantId}', '${ctpId[0].id}', 'no-existe', 1, 'test')`);
  await rechaza("CHECK congelado coherente rechaza snap sin fecha",
    `INSERT INTO "ForestCtpConsumo" ("id","tenantId","ctpEntryId","woodEntryId","volumeM3","createdBy","costoUnitarioSnap")
     VALUES (gen_random_uuid()::text, '${woodId[0].tenantId}', '${ctpId[0].id}', '${woodId[0].id}', 1, 'test', 100)`);

  // Y el que Postgres NO puede atrapar — la razón de ser de D3/D7.
  await client.query("SAVEPOINT sp2");
  const otro = await q(`SELECT "id","tenantId" FROM "WoodEntry" WHERE "tenantId" <> $1 LIMIT 1`, [woodId[0].tenantId]);
  if (otro.length) {
    let leaked = false;
    try {
      await client.query(
        `INSERT INTO "ForestCtpConsumo" ("id","tenantId","ctpEntryId","woodEntryId","volumeM3","createdBy")
         VALUES (gen_random_uuid()::text, $1, $2, $3, 1, 'test')`,
        [woodId[0].tenantId, ctpId[0].id, otro[0].id],
      );
      leaked = true;
    } catch { /* rechazado */ }
    await client.query("ROLLBACK TO SAVEPOINT sp2");
    check("⚠️  Postgres NO impide el consumo cross-tenant (por eso D3: guard en la capa DB)", leaked,
      leaked ? "confirmado: el FK deja pasar la fuga ⇒ el guard app-level es OBLIGATORIO" : "inesperado: algo lo bloqueó");
  }

  // Sobre-consumo agregado: Postgres tampoco lo atrapa (por eso D7 en la capa DB)
  await client.query("SAVEPOINT sp3");
  let over = false;
  try {
    await client.query(
      `INSERT INTO "ForestCtpConsumo" ("id","tenantId","ctpEntryId","woodEntryId","volumeM3","createdBy")
       VALUES (gen_random_uuid()::text, $1, $2, $3, 999999, 'test')`,
      [woodId[0].tenantId, ctpId[0].id, (await q(`SELECT "id" FROM "WoodEntry" WHERE "tenantId" = $1 AND "deletedAt" IS NULL AND "id" NOT IN (SELECT "woodEntryId" FROM "ForestCtpConsumo") LIMIT 1`, [woodId[0].tenantId]))[0]?.id ?? woodId[0].id],
    );
    over = true;
  } catch { /* ignore */ }
  await client.query("ROLLBACK TO SAVEPOINT sp3");
  check("⚠️  Postgres NO impide consumir 999999 m³ de un ingreso de 8.45 (por eso D7: I1/I2 en la capa DB)", over,
    over ? "confirmado: la invariante agregada es app-level o no existe" : "inesperado");

  console.log(`\n${failed === 0 ? "✓ ENSAYO OK — el SQL es apto para apply-sql.mjs" : `✗ ${failed} check(s) fallaron — NO aplicar`}`);
} catch (err) {
  console.error(`\n✗ el SQL falló: ${err.message}`);
  failed++;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  console.log("↩  ROLLBACK ejecutado — la DB quedó exactamente como estaba\n");
  client.release();
  await pool.end().catch(() => {});
  process.exit(failed === 0 ? 0 : 1);
}
