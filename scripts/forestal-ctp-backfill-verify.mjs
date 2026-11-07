#!/usr/bin/env node
/**
 * forestal-ctp-backfill-verify.mjs — observabilidad de la migración ADR-134 (rev. 2).
 *
 * Corre ANTES (--snapshot: backup de las filas afectadas) y DESPUÉS del backfill.
 * Las métricas críticas son las que Postgres NO puede garantizar por sí solo:
 *   · la fuga cross-tenant (el aislamiento del repo es app-level, no RLS) — D3
 *   · las invariantes agregadas I1/I2 (un CHECK no puede sumar cross-tabla) — D7
 * Un FK y un CHECK garantizan la FORMA. La POLÍTICA la garantiza la capa DB,
 * y esto es lo que detecta si se rompió.
 *
 * Uso:
 *   node scripts/forestal-ctp-backfill-verify.mjs --snapshot   # dump JSON pre-migración
 *   node scripts/forestal-ctp-backfill-verify.mjs              # verificar estado
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const snapshot = process.argv.includes("--snapshot");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
const client = await pool.connect();
const q = async (sql) => (await client.query(sql)).rows;

try {
  // ── SNAPSHOT: son ~5 filas; un JSON es un backup real y honesto ──────────
  if (snapshot) {
    const hasConsumo = (
      await q(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'ForestCtpConsumo'`)
    )[0].n > 0;
    const data = {
      takenAt: new Date().toISOString(),
      woodEntry: await q(`SELECT * FROM "WoodEntry" ORDER BY "createdAt"`),
      forestCtpEntry: await q(`SELECT * FROM "ForestCtpEntry" ORDER BY "createdAt"`),
      // La tabla puente tiene datos PROPIOS (la atribución) — el rollback la dropea.
      forestCtpConsumo: hasConsumo ? await q(`SELECT * FROM "ForestCtpConsumo" ORDER BY "createdAt"`) : [],
    };
    const out = path.resolve(process.cwd(), `reports/forestal-ctp-snapshot-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(data, null, 2));
    console.log(
      `✓ snapshot: ${data.woodEntry.length} WoodEntry + ${data.forestCtpEntry.length} ForestCtpEntry + ${data.forestCtpConsumo.length} ForestCtpConsumo`,
    );
    console.log(`  → ${out}`);
    process.exit(0);
  }

  // ── ¿Corrió ya el EXPAND? ────────────────────────────────────────────────
  const [{ has_table }] = await q(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'ForestCtpConsumo'
    ) AS has_table`);
  if (!has_table) {
    console.log("✗ La tabla ForestCtpConsumo no existe — el EXPAND no corrió todavía.");
    console.log("  → node scripts/forestal-ctp-migration-rehearse.mjs   (ensayo, revierte)");
    console.log("  → node scripts/apply-sql.mjs scripts/forestal-ctp-fk-costos-migration.sql");
    process.exit(1);
  }

  let failed = 0;
  const check = (label, rows, ok, detail) => {
    const pass = ok(rows);
    if (!pass) failed++;
    console.log(`${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail(rows)}` : ""}`);
    if (!pass && rows.length) console.table(rows.slice(0, 10));
  };

  console.log("\n── ADR-134 (rev. 2) · verificación post-backfill ──\n");

  // 1. Cobertura de atribución: qué % del volumen declarado está atribuido a
  //    ingresos concretos. NO es un error que sea <100% (D7: la atribución es
  //    parcial por diseño) — es la cola de trabajo.
  const cob = await q(`
    SELECT
      COUNT(*)::int AS lineas,
      COUNT(*) FILTER (WHERE atribuido > 0)::int AS con_atribucion,
      COALESCE(SUM("volumeInputM3"), 0) AS declarado_m3,
      COALESCE(SUM(atribuido), 0)       AS atribuido_m3
    FROM (
      SELECT e."volumeInputM3",
             COALESCE((SELECT SUM(c."volumeM3") FROM "ForestCtpConsumo" c WHERE c."ctpEntryId" = e."id"), 0) AS atribuido
      FROM "ForestCtpEntry" e
      WHERE e.section = 'produccion' AND e."deletedAt" IS NULL AND e.status = 'registrado'
        AND e."volumeInputM3" IS NOT NULL
    ) t`);
  const { lineas, con_atribucion, declarado_m3, atribuido_m3 } = cob[0];
  const pct = Number(declarado_m3) ? Math.round((Number(atribuido_m3) / Number(declarado_m3)) * 100) : 0;
  console.log(`· Cobertura de atribución: ${con_atribucion}/${lineas} líneas · ${atribuido_m3}/${declarado_m3} m³ (${pct}%)`);
  console.log(`  (meta: >90% a 30 días con datos reales. <100% NO es error: D7 permite atribución parcial)`);

  // 2. Volumen sin atribuir = cola de repesca manual, no un bug.
  const sinAtribuir = await q(`
    SELECT e."tenantId", e."lineNo", e."gtfIngreso", e."speciesCommon", e."volumeInputM3",
           e."volumeInputM3" - COALESCE((SELECT SUM(c."volumeM3") FROM "ForestCtpConsumo" c WHERE c."ctpEntryId" = e."id"), 0) AS sin_atribuir
    FROM "ForestCtpEntry" e
    WHERE e.section = 'produccion' AND e."deletedAt" IS NULL AND e.status = 'registrado'
      AND e."volumeInputM3" IS NOT NULL
      AND e."volumeInputM3" > COALESCE((SELECT SUM(c."volumeM3") FROM "ForestCtpConsumo" c WHERE c."ctpEntryId" = e."id"), 0)
    ORDER BY sin_atribuir DESC LIMIT 10`);
  console.log(`· Líneas con volumen sin atribuir (repesca manual): ${sinAtribuir.length}`);
  if (sinAtribuir.length) console.table(sinAtribuir);

  // 3. CRÍTICO — I2: un ingreso consumido más de lo que entró.
  //    Ésta es LA métrica del módulo: es exactamente el patrón de blanqueo de
  //    madera que fiscaliza SERFOR (atribuir producción a un ingreso legal que
  //    no da el volumen). Postgres NO puede atraparlo (D7).
  check(
    "I2 · Sobre-consumo de ingreso (CRÍTICO — patrón de blanqueo)",
    await q(`
      SELECT w."id" AS wood_id, w."tenantId", w."gtfNumber", w."speciesCommonName",
             w."volumeM3" AS ingreso_m3, SUM(c."volumeM3") AS consumido_m3
      FROM "WoodEntry" w
      JOIN "ForestCtpConsumo" c ON c."woodEntryId" = w."id"
      GROUP BY w."id", w."tenantId", w."gtfNumber", w."speciesCommonName", w."volumeM3"
      HAVING SUM(c."volumeM3") > w."volumeM3"`),
    (r) => r.length === 0,
    (r) => `${r.length} ingreso(s) consumidos por encima de su volumen`,
  );

  // 4. CRÍTICO — I1: la atribución excede lo declarado en la línea.
  check(
    "I1 · Sobre-atribución de línea (CRÍTICO)",
    await q(`
      SELECT e."id" AS ctp_id, e."tenantId", e."lineNo", e."volumeInputM3" AS declarado_m3,
             SUM(c."volumeM3") AS atribuido_m3
      FROM "ForestCtpEntry" e
      JOIN "ForestCtpConsumo" c ON c."ctpEntryId" = e."id"
      GROUP BY e."id", e."tenantId", e."lineNo", e."volumeInputM3"
      HAVING e."volumeInputM3" IS NULL OR SUM(c."volumeM3") > e."volumeInputM3"`),
    (r) => r.length === 0,
    (r) => `${r.length} línea(s) con atribución > declarado (o sin declarado)`,
  );

  // 5. CRÍTICO — fuga cross-tenant. Los 3 extremos deben coincidir.
  //    El FK NO la previene (D3/R2). Verificado empíricamente en el ensayo.
  check(
    "Fuga cross-tenant consumo↔línea↔ingreso (CRÍTICO)",
    await q(`
      SELECT c."id" AS consumo_id, c."tenantId" AS consumo_tenant,
             e."tenantId" AS linea_tenant, w."tenantId" AS ingreso_tenant
      FROM "ForestCtpConsumo" c
      JOIN "ForestCtpEntry" e ON e."id" = c."ctpEntryId"
      JOIN "WoodEntry"      w ON w."id" = c."woodEntryId"
      WHERE c."tenantId" <> e."tenantId" OR c."tenantId" <> w."tenantId"`),
    (r) => r.length === 0,
    (r) => `${r.length} consumo(s) cruzan tenants`,
  );

  check(
    "Fuga cross-tenant Supplier (CRÍTICO)",
    await q(`
      SELECT w."id" AS wood_id, w."tenantId" AS wood_tenant, s."tenantId" AS sup_tenant
      FROM "WoodEntry" w
      JOIN "Supplier" s ON s."id" = w."supplierId"
      WHERE w."tenantId" <> s."tenantId"`),
    (r) => r.length === 0,
    (r) => `${r.length} filas apuntan a Supplier de otro tenant`,
  );

  // 6. Consumos contra ingresos soft-deleted — el FK no lo ve (borrado lógico).
  check(
    "Consumos que citan un ingreso borrado",
    await q(`
      SELECT c."id" AS consumo_id, w."gtfNumber"
      FROM "ForestCtpConsumo" c JOIN "WoodEntry" w ON w."id" = c."woodEntryId"
      WHERE w."deletedAt" IS NOT NULL`),
    (r) => r.length === 0,
    (r) => `${r.length} consumo(s) apuntan a un WoodEntry soft-deleted`,
  );

  // 7. FKs validados (NOT VALID sin VALIDATE = no garantiza nada)
  check(
    "FKs validados (convalidated)",
    await q(`
      SELECT conname, convalidated FROM pg_constraint
      WHERE conname IN ('ForestCtpConsumo_ctpEntryId_fkey', 'ForestCtpConsumo_woodEntryId_fkey', 'WoodEntry_supplierId_fkey')`),
    (r) => r.length === 3 && r.every((c) => c.convalidated),
    (r) => `${r.filter((c) => c.convalidated).length}/3 validados`,
  );

  // 8. Costo: cuántos consumos siguen sin costo porque la factura no llegó (D6).
  //    NO es error — es el estado normal en Perú entre la corrida y la factura.
  //    Lo que se mide es el LAG: si crece, la carga de facturas se está atrasando.
  const costo = await q(`
    SELECT
      COUNT(*)::int AS consumos,
      COUNT(*) FILTER (WHERE c."congeladoAt" IS NOT NULL)::int AS congelados,
      COUNT(*) FILTER (WHERE c."congeladoAt" IS NULL AND w."costoTotal" IS NULL)::int AS sin_costo_aun,
      COUNT(*) FILTER (WHERE c."congeladoAt" IS NULL AND w."costoTotal" IS NOT NULL)::int AS costo_vivo
    FROM "ForestCtpConsumo" c JOIN "WoodEntry" w ON w."id" = c."woodEntryId"`);
  const k = costo[0];
  console.log(`· Costo: ${k.congelados} congelados · ${k.costo_vivo} vivos (on-read) · ${k.sin_costo_aun} sin factura aún (D6: normal)`);

  // 9. Congelados que quedaron incoherentes con el ingreso (auditoría del cierre)
  check(
    "Congelados coherentes (snap ⇔ fecha)",
    await q(`
      SELECT "id" FROM "ForestCtpConsumo"
      WHERE ("costoUnitarioSnap" IS NULL) <> ("congeladoAt" IS NULL)`),
    (r) => r.length === 0,
    (r) => `${r.length} consumo(s) con congelado a medias`,
  );

  // 10. Mezcla de monedas en una misma línea ⇒ el costo derivado sería una suma
  //     de peras con manzanas. Hoy imposible (todo PEN), pero la métrica avisa.
  check(
    "Sin mezcla de monedas por línea",
    await q(`
      SELECT e."id" AS ctp_id, COUNT(DISTINCT w."moneda")::int AS monedas
      FROM "ForestCtpEntry" e
      JOIN "ForestCtpConsumo" c ON c."ctpEntryId" = e."id"
      JOIN "WoodEntry" w ON w."id" = c."woodEntryId"
      GROUP BY e."id" HAVING COUNT(DISTINCT w."moneda") > 1`),
    (r) => r.length === 0,
    (r) => `${r.length} línea(s) mezclan monedas`,
  );

  // 11. Ambigüedad latente (D1): 1 GTF ⇒ N WoodEntry por especie.
  //     >0 ⇒ el backfill automático ya no puede resolver esos casos: sólo el picker.
  const amb = await q(`
    SELECT "tenantId", "gtfNumber", lower(trim("speciesCommonName")) AS especie, COUNT(*)::int AS n
    FROM "WoodEntry" WHERE "deletedAt" IS NULL
    GROUP BY 1, 2, 3 HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 10`);
  console.log(`· Ambigüedad latente (gtfNumber+especie duplicado): ${amb.length}`);
  if (amb.length) {
    console.table(amb);
    console.log("  ↳ El backfill los deja sin atribuir a propósito. Se resuelven con el picker de la UI.");
  }

  // 12. Cobertura de Supplier (medido 2026-07-15: 0 matches — esperado)
  const sup = await q(`
    SELECT COUNT(*)::int AS total, COUNT("supplierId")::int AS con_fk
    FROM "WoodEntry" WHERE "deletedAt" IS NULL`);
  console.log(`· Cobertura FK Supplier: ${sup[0].con_fk}/${sup[0].total} (providerName intacto en todos)`);

  console.log(`\n${failed === 0 ? "✓ TODO OK" : `✗ ${failed} check(s) fallaron`}\n`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (err) {
  console.error(`✗ error: ${err.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end().catch(() => {});
}
