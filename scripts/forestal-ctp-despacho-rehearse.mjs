#!/usr/bin/env node
/**
 * forestal-ctp-despacho-rehearse.mjs — ENSAYO de la migración ADR-135 contra la DB REAL.
 *
 * Corre el SQL completo (DDL + backfill) dentro de una transacción, verifica las
 * invariantes CONTRA LOS DATOS REALES, y hace ROLLBACK SIEMPRE. No aplica nada.
 *
 * Además de "¿el SQL compila?", este ensayo prueba las DECISIONES del ADR:
 *
 *   §9  ⭐ I3 e I5 NO son redundantes — se construyen los dos escenarios y se
 *          mide que cada invariante atrapa exactamente lo que la otra deja pasar.
 *          Es la evidencia de la decisión (a): I3 NO se reemplaza, se complementa.
 *   §8     Postgres NO puede con: tenant, orientación, ni agregados ⇒ por qué los
 *          guards viven en la capa DB (mismo hallazgo que ADR-134 D3/D7, ahora
 *          medido para esta tabla).
 *   §10    HALLAZGO sobre ADR-134 ya aplicado (informativo, no gatea este SQL).
 *
 * Uso: node scripts/forestal-ctp-despacho-rehearse.mjs
 * Exit 0 = el SQL aplica limpio y las invariantes se cumplen ⇒ apto para apply-sql.mjs
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SQL_FILE = "scripts/forestal-ctp-despacho-origen-migration.sql";
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
/** Hallazgo informativo: se reporta pero NO gatea la aptitud de ESTE SQL. */
const warn = (label, detail = "") => console.log(`  ⚠️  ${label}${detail ? ` — ${detail}` : ""}`);

/** Espeja speciesKey()/productKey() de lib/db/forest-ctp.db.ts (trim→lower→espacios→'—'). */
const NORM = (col) => `COALESCE(NULLIF(lower(regexp_replace(trim(COALESCE(${col}, '')), '\\s+', ' ', 'g')), ''), '—')`;

/** Stock del ACTA por productKey — emula ForestCtpDB.assertStockDisponible (I3). */
const stockI3 = async (tenant, productType, species) => {
  const [r] = await q(
    `SELECT COALESCE(SUM(CASE WHEN "section"='produccion' THEN "quantity" ELSE 0 END),0)
          - COALESCE(SUM(CASE WHEN "section"='despacho'   THEN "quantity" ELSE 0 END),0) AS stock
     FROM "ForestCtpEntry"
     WHERE "tenantId" = $1 AND "deletedAt" IS NULL AND "status" = 'registrado'
       AND ${NORM('"productType"')}   = ${NORM("$2::text")}
       AND ${NORM('"speciesCommon"')} = ${NORM("$3::text")}`,
    [tenant, productType, species],
  );
  return Number(r.stock);
};

/** I4 · Σ origenes(despacho) ≤ despacho.quantity — devuelve las filas que la violan. */
const violacionesI4 = () => q(
  `SELECT d."id", d."lineNo", d."quantity" AS declarado, SUM(o."quantity") AS atribuido
   FROM "ForestCtpEntry" d JOIN "ForestCtpDespachoOrigen" o ON o."despachoEntryId" = d."id"
   GROUP BY d."id", d."lineNo", d."quantity"
   HAVING SUM(o."quantity") > d."quantity"`,
);

/** I5 · Σ origenes(corrida) ≤ produccion.quantity — el premio (una corrida no se despacha dos veces). */
const violacionesI5 = () => q(
  `SELECT p."id", p."lineNo", p."productType", p."quantity" AS producido, SUM(o."quantity") AS despachado
   FROM "ForestCtpEntry" p JOIN "ForestCtpDespachoOrigen" o ON o."produccionEntryId" = p."id"
   GROUP BY p."id", p."lineNo", p."productType", p."quantity"
   HAVING SUM(o."quantity") > p."quantity"`,
);

const mkLinea = async (tenant, section, productType, species, quantity, unit, lineNo) => {
  const [r] = await q(
    `INSERT INTO "ForestCtpEntry"
       ("id","tenantId","section","lineNo","entryDate","productType","speciesCommon","quantity","unit","status","createdBy","createdAt","updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7, 'registrado', 'rehearse:adr-135', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING "id"`,
    [tenant, section, lineNo, productType, species, quantity, unit],
  );
  return r.id;
};

const mkOrigen = (tenant, despachoId, produccionId, qty) => q(
  `INSERT INTO "ForestCtpDespachoOrigen" ("id","tenantId","despachoEntryId","produccionEntryId","quantity","createdBy")
   VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'rehearse:adr-135')`,
  [tenant, despachoId, produccionId, qty],
);

console.log(`\n── ENSAYO ADR-135 · ${SQL_FILE}`);
console.log(`   host: ${url.match(/@([^:/]+)/)?.[1] ?? "?"}`);
console.log(`   ⚠️  todo se REVIERTE al final — no se aplica nada\n`);

try {
  await client.query("BEGIN");

  // ── 0. Precondición: ADR-134 aplicado ───────────────────────────────────
  console.log("── PRECONDICIÓN (ADR-135 depende de ADR-134)");
  const pre = await q(`SELECT to_regclass('public."ForestCtpConsumo"') AS t`);
  check("ForestCtpConsumo existe (ADR-134 aplicado en prod)", pre[0].t !== null);
  const ya = await q(`SELECT to_regclass('public."ForestCtpDespachoOrigen"') AS t`);
  check("ForestCtpDespachoOrigen NO existe todavía (este SQL la crea)", ya[0].t === null,
    ya[0].t !== null ? "ya existe: el SQL es idempotente igual, pero revisá si alguien lo aplicó" : "");

  // ── 1. Estado ANTES ─────────────────────────────────────────────────────
  const [{ count: ctpAntes }] = await q(`SELECT COUNT(*)::int AS count FROM "ForestCtpEntry" WHERE "deletedAt" IS NULL`);
  const [{ count: consAntes }] = await q(`SELECT COUNT(*)::int AS count FROM "ForestCtpConsumo"`);
  console.log(`\n── ANTES: ${ctpAntes} ForestCtpEntry vivas · ${consAntes} ForestCtpConsumo (ADR-134)\n`);

  // ── 2. Aplicar el SQL completo ──────────────────────────────────────────
  const t0 = Date.now();
  await client.query(sql);
  console.log(`── SQL aplicado sin error (${Date.now() - t0}ms)\n`);

  // ── 3. DDL ──────────────────────────────────────────────────────────────
  console.log("── DDL");
  const cols = await q(
    `SELECT column_name, data_type, numeric_precision, numeric_scale FROM information_schema.columns
     WHERE table_name = 'ForestCtpDespachoOrigen' ORDER BY ordinal_position`);
  check("ForestCtpDespachoOrigen creada con 8 columnas", cols.length === 8, `${cols.length} columnas`);
  const qty = cols.find((c) => c.column_name === "quantity");
  check("quantity es DECIMAL(14,4) — acotada por ForestCtpEntry.quantity, no por ForestCtpConsumo",
    qty?.numeric_precision === 14 && qty?.numeric_scale === 4, `${qty?.numeric_precision},${qty?.numeric_scale}`);

  const fks = await q(
    `SELECT conname, convalidated, confdeltype FROM pg_constraint
     WHERE conname IN ('ForestCtpDespachoOrigen_despachoEntryId_fkey','ForestCtpDespachoOrigen_produccionEntryId_fkey')`);
  check("2 FKs creados y VALIDADOS", fks.length === 2 && fks.every((f) => f.convalidated),
    `${fks.filter((f) => f.convalidated).length}/2 validados`);
  check("despacho→CASCADE (detalle) · produccion→RESTRICT (cadena de custodia)",
    fks.find((f) => f.conname.includes("despachoEntryId"))?.confdeltype === "c" &&
    fks.find((f) => f.conname.includes("produccionEntryId"))?.confdeltype === "r");

  // ── 4. Backfill (D6) ────────────────────────────────────────────────────
  console.log("\n── BACKFILL");
  const origenes = await q(
    `SELECT o."quantity", o."createdBy",
            d."lineNo" AS despacho_line, d."quantity" AS despacho_qty, d."gtfNumber", d."destino",
            p."lineNo" AS produccion_line, p."quantity" AS produccion_qty, p."productType", p."speciesCommon"
     FROM "ForestCtpDespachoOrigen" o
     JOIN "ForestCtpEntry" d ON d."id" = o."despachoEntryId"
     JOIN "ForestCtpEntry" p ON p."id" = o."produccionEntryId"`);
  console.log(`  origenes creados: ${origenes.length}`);
  if (origenes.length) console.table(origenes);
  check("Backfill creó exactamente 1 origen (la línea de despacho demo)", origenes.length === 1);
  check("El origen es 4.0000 del despacho lineNo=1 → corrida lineNo=1 (Madera aserrada · Tornillo)",
    origenes.length === 1 && Number(origenes[0].quantity) === 4 &&
    origenes[0].despacho_line === 1 && origenes[0].produccion_line === 1);
  check("createdBy = 'backfill:adr-135' (distinguible de lo cargado a mano, para siempre)",
    origenes.every((o) => o.createdBy === "backfill:adr-135"));

  // ── 5. Invariantes I4 / I5 + fuga ───────────────────────────────────────
  console.log("\n── INVARIANTES");
  const i4 = await violacionesI4();
  check("I4 · Σ origenes ≤ despacho.quantity (no se atribuye más de lo despachado)", i4.length === 0,
    i4.length ? `${i4.length} despacho(s) sobre-atribuidos` : "0 violaciones");
  const i5 = await violacionesI5();
  check("I5 · Σ origenes ≤ produccion.quantity (una corrida no se despacha dos veces)", i5.length === 0,
    i5.length ? `${i5.length} corrida(s) sobre-despachadas` : "0 violaciones");

  const fuga = await q(
    `SELECT o."id" FROM "ForestCtpDespachoOrigen" o
     JOIN "ForestCtpEntry" d ON d."id" = o."despachoEntryId"
     JOIN "ForestCtpEntry" p ON p."id" = o."produccionEntryId"
     WHERE o."tenantId" <> d."tenantId" OR o."tenantId" <> p."tenantId"`);
  check("Fuga cross-tenant (origen/despacho/corrida mismo tenant)", fuga.length === 0);

  const cobertura = await q(
    `SELECT d."lineNo", d."quantity" AS despachado, d."gtfNumber",
            COALESCE((SELECT SUM(o."quantity") FROM "ForestCtpDespachoOrigen" o WHERE o."despachoEntryId" = d."id"),0) AS atribuido,
            d."quantity" - COALESCE((SELECT SUM(o."quantity") FROM "ForestCtpDespachoOrigen" o WHERE o."despachoEntryId" = d."id"),0) AS sin_atribuir
     FROM "ForestCtpEntry" d
     WHERE d."section" = 'despacho' AND d."deletedAt" IS NULL AND d."status" = 'registrado'`);
  console.log("\n  despachado vs atribuido (el hueco es explícito, no se esconde):");
  console.table(cobertura);
  check("El despacho demo queda 100% atribuido (residuo 0)",
    cobertura.length === 1 && Number(cobertura[0].sin_atribuir) === 0);

  const saldoCorrida = await q(
    `SELECT p."lineNo", p."quantity" AS producido,
            COALESCE((SELECT SUM(o."quantity") FROM "ForestCtpDespachoOrigen" o WHERE o."produccionEntryId" = p."id"),0) AS despachado,
            p."quantity" - COALESCE((SELECT SUM(o."quantity") FROM "ForestCtpDespachoOrigen" o WHERE o."produccionEntryId" = p."id"),0) AS sin_despachar
     FROM "ForestCtpEntry" p
     WHERE p."section" = 'produccion' AND p."deletedAt" IS NULL AND p."status" = 'registrado'`);
  console.log("\n  producido vs despachado por corrida:");
  console.table(saldoCorrida);
  check("A la corrida demo le quedan 2.2000 sin despachar (6.2 − 4.0)",
    saldoCorrida.some((r) => Number(r.sin_despachar) === 2.2));

  // ── 6. Datos preexistentes intactos (el acta legal, D2) ─────────────────
  console.log("\n── DATOS PREEXISTENTES (el acta legal, ADR-134 D2)");
  const [{ count: ctpDespues }] = await q(`SELECT COUNT(*)::int AS count FROM "ForestCtpEntry" WHERE "deletedAt" IS NULL`);
  const [{ count: consDespues }] = await q(`SELECT COUNT(*)::int AS count FROM "ForestCtpConsumo"`);
  check("Ninguna fila creada/borrada en ForestCtpEntry", ctpDespues === ctpAntes, `${ctpAntes} → ${ctpDespues}`);
  check("ADR-134 intacto: ningún ForestCtpConsumo tocado", consDespues === consAntes, `${consAntes} → ${consDespues}`);
  const acta = await q(
    `SELECT COUNT(*)::int AS n FROM "ForestCtpEntry"
     WHERE "section" = 'despacho' AND "lineNo" = 1 AND "gtfNumber" = '001-00000031'
       AND "destino" = 'Maderera Ucayali EIRL' AND "quantity" = 4.0000`);
  check("Acta del despacho intacta (gtfNumber + destino + quantity sin tocar)", acta[0].n === 1);

  // ── 7. Idempotencia ─────────────────────────────────────────────────────
  console.log("\n── IDEMPOTENCIA (2ª corrida del mismo SQL)");
  await client.query(sql);
  const [{ count: origenes2 }] = await q(`SELECT COUNT(*)::int AS count FROM "ForestCtpDespachoOrigen"`);
  check("2ª corrida no duplica origenes ni falla", origenes2 === origenes.length, `${origenes.length} → ${origenes2}`);

  // ── 8. Control negativo — ¿qué muerde Postgres y qué no? ────────────────
  console.log("\n── CONTROL NEGATIVO (¿los guards de Postgres muerden?)");
  const [despacho] = await q(`SELECT "id","tenantId" FROM "ForestCtpEntry" WHERE "section"='despacho' AND "deletedAt" IS NULL LIMIT 1`);
  const [produccion] = await q(`SELECT "id","quantity" FROM "ForestCtpEntry" WHERE "section"='produccion' AND "deletedAt" IS NULL LIMIT 1`);
  const T0 = despacho.tenantId;

  const rechaza = async (label, fn) => {
    await client.query("SAVEPOINT sp");
    try {
      await fn();
      await client.query("ROLLBACK TO SAVEPOINT sp");
      check(label, false, "NO fue rechazado (el guard no existe)");
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT sp");
      check(label, true, e.message.split("\n")[0].slice(0, 58));
    }
  };
  const aceptaIndebidamente = async (label, fn, moraleja) => {
    await client.query("SAVEPOINT sp");
    let paso = false;
    try { await fn(); paso = true; } catch { /* rechazado */ }
    await client.query("ROLLBACK TO SAVEPOINT sp");
    check(`⚠️  ${label}`, paso, paso ? moraleja : "inesperado: algo lo bloqueó");
  };

  await rechaza("CHECK quantity > 0 rechaza un origen de 0",
    () => mkOrigen(despacho.tenantId, despacho.id, produccion.id, 0));
  await rechaza("CHECK no-autoreferencia: una línea no puede salir de sí misma",
    () => mkOrigen(despacho.tenantId, despacho.id, despacho.id, 1));
  await rechaza("UNIQUE (despacho, produccion) rechaza duplicado",
    () => q(`INSERT INTO "ForestCtpDespachoOrigen" ("id","tenantId","despachoEntryId","produccionEntryId","quantity","createdBy")
             SELECT gen_random_uuid()::text, "tenantId", "despachoEntryId", "produccionEntryId", 1, 'test' FROM "ForestCtpDespachoOrigen" LIMIT 1`));
  await rechaza("FK rechaza produccionEntryId inexistente",
    () => mkOrigen(despacho.tenantId, despacho.id, "no-existe", 1));

  // Y lo que Postgres NO puede — la razón de ser de los guards en la capa DB.
  const [otroTenant] = await q(`SELECT DISTINCT "tenantId" FROM "WoodEntry" WHERE "tenantId" <> $1 LIMIT 1`, [despacho.tenantId]);
  if (otroTenant) {
    await aceptaIndebidamente(
      "Postgres NO impide citar una corrida de OTRO tenant",
      async () => {
        const ajena = await mkLinea(otroTenant.tenantId, "produccion", "Madera aserrada", "Tornillo", 50, "m3", 9100);
        await mkOrigen(despacho.tenantId, despacho.id, ajena, 1);
      },
      "confirmado: el FK deja pasar la fuga ⇒ guard app-level OBLIGATORIO (D3)",
    );
  }
  // OJO: la corrida tiene que ser una NUEVA. Contra `produccion.id` el backfill ya
  // creó un origen ⇒ lo rechazaría el UNIQUE, no un guard agregado, y el control
  // "probaría" algo que no es (falso negativo del ensayo).
  // Se le da quantity 999999 para que I5 (Σ≤corrida) NO se viole y el único
  // agregado en juego sea I4 (Σ origenes del despacho ≤ 4).
  await aceptaIndebidamente(
    "Postgres NO impide atribuir 999999 a un despacho de 4 (I4 agregada)",
    async () => {
      const otraCorrida = await mkLinea(T0, "produccion", "Madera aserrada", "Tornillo", 999999, "m3", 9200);
      await mkOrigen(despacho.tenantId, despacho.id, otraCorrida, 999999);
    },
    "confirmado: I4 es app-level o no existe",
  );
  await aceptaIndebidamente(
    "Postgres NO impide invertir la orientación (despacho←→producción)",
    () => mkOrigen(despacho.tenantId, produccion.id, despacho.id, 1),
    "confirmado: el guard de `section` es app-level (el FK sólo ve ForestCtpEntry)",
  );

  // ── 9. ⭐ I3 vs I5: ¿se solapan? — evidencia de la decisión (a) ─────────
  console.log("\n── ¿I3 e I5 SON REDUNDANTES? (decisión (a), medido en vez de argumentado)");
  const T = despacho.tenantId;

  // Escenario A — sobre-despacho SIN atribución: sólo I3 lo ve.
  const rA = await mkLinea(T, "produccion", "REHEARSE-A", "Tornillo", 6.2, "m3", 9001);
  const stockA = await stockI3(T, "REHEARSE-A", "Tornillo");
  const dA = await mkLinea(T, "despacho", "REHEARSE-A", "Tornillo", 100, "m3", 9002); // sin origenes
  const i5A = (await violacionesI5()).filter((v) => v.productType === "REHEARSE-A");
  check("A · I3 RECHAZA el despacho de 100 contra una producción de 6.2", stockA < 100, `stock=${stockA}, pedido=100`);
  check("A · I5 está CIEGO (sin atribución no hay nada que exceder)", i5A.length === 0,
    "⇒ reemplazar I3 por I5 dejaría pasar el sobre-despacho sin atribuir");

  // Escenario B — la MISMA corrida drenada por 2 despachos: I3 e I4 ciegos, I5 lo ve.
  const rB1 = await mkLinea(T, "produccion", "REHEARSE-B", "Tornillo", 6.2, "m3", 9003);
  const rB2 = await mkLinea(T, "produccion", "REHEARSE-B", "Tornillo", 10, "m3", 9004);
  const dB1 = await mkLinea(T, "despacho", "REHEARSE-B", "Tornillo", 6.2, "m3", 9005);
  const dB2 = await mkLinea(T, "despacho", "REHEARSE-B", "Tornillo", 10, "m3", 9006);
  // Los dos despachos citan la MISMA corrida (rB1). rB2 queda sin atribuir (el hueco).
  await mkOrigen(T, dB1, rB1, 6.2);
  await mkOrigen(T, dB2, rB1, 10);
  const stockB = await stockI3(T, "REHEARSE-B", "Tornillo");
  const i4B = (await violacionesI4()).filter((v) => [9005, 9006].includes(v.lineNo));
  const i5B = (await violacionesI5()).filter((v) => v.productType === "REHEARSE-B");
  check("B · I3 está CIEGO (producido 16.2 − despachado 16.2 = 0, el agregado cuadra)", stockB === 0, `stock=${stockB}`);
  check("B · I4 está CIEGO (cada despacho atribuye exactamente lo suyo: 6.2≤6.2 y 10≤10)", i4B.length === 0);
  check("B · I5 ATRAPA la corrida drenada 2 veces (16.2 sobre una corrida de 6.2)", i5B.length === 1,
    i5B.length === 1 ? `producido=${i5B[0].producido}, despachado=${i5B[0].despachado}` : "");
  console.log("  ⇒ VEREDICTO: cada una atrapa lo que la otra deja pasar. I3 mide el ACTA");
  console.log("    (agregado por producto), I5 mide el ÍNDICE (fila por fila). No se solapan:");
  console.log("    I3 se QUEDA, I4/I5 se AGREGAN. No hay dos nociones de stock — hay una sola");
  console.log("    (el acta) más una medida de cobertura de la atribución.");

  // ── 10. HALLAZGO sobre ADR-134 (informativo — no gatea este SQL) ────────
  console.log("\n── HALLAZGO en ADR-134 ya aplicado (consumos huérfanos de líneas muertas)");
  const fantasma = await q(
    `SELECT w."gtfNumber", w."volumeM3",
            COALESCE(SUM(c."volumeM3"),0) AS consumido_segun_availableSource,
            COALESCE(SUM(CASE WHEN e."deletedAt" IS NULL AND e."status"='registrado' THEN c."volumeM3" ELSE 0 END),0) AS consumido_segun_saldos
     FROM "WoodEntry" w
     JOIN "ForestCtpConsumo" c ON c."woodEntryId" = w."id"
     JOIN "ForestCtpEntry"   e ON e."id" = c."ctpEntryId"
     WHERE w."deletedAt" IS NULL
     GROUP BY w."id", w."gtfNumber", w."volumeM3"
     HAVING COALESCE(SUM(c."volumeM3"),0)
         <> COALESCE(SUM(CASE WHEN e."deletedAt" IS NULL AND e."status"='registrado' THEN c."volumeM3" ELSE 0 END),0)`);
  if (fantasma.length === 0) {
    console.log("  ✓ 0 ingresos con consumos de líneas muertas");
  } else {
    console.table(fantasma);
    warn(`${fantasma.length} ingreso(s) bloqueados por consumos de líneas BORRADAS/ANULADAS`,
      "saldos() los da libres, availableSource()/I2 los dan agotados ⇒ las dos capas se contradicen");
    console.log("     El consumo sobrevive al soft-delete/anulación de su línea y sigue comiendo");
    console.log("     el ingreso ⇒ esa madera queda invisible en el picker PARA SIEMPRE.");
    console.log("     Fix (ADR-135 D8): filtrar por el estado de la línea padre en el groupBy de");
    console.log("     I2 (setConsumos) y availableSource. El puente de ADR-135 NO repite el bug:");
    console.log("     I4/I5 cuentan sólo líneas vivas y registradas.");
  }

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
