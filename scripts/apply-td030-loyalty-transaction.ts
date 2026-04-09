/**
 * scripts/apply-td030-loyalty-transaction.ts
 *
 * TD-030 — Crear modelo LoyaltyTransaction (append-only ledger)
 *
 * Aplica la migración aditiva de TD-030 según el plan:
 *   docs/migration-plan-ola1-2026-04-09.md (sección 7)
 *
 * Pasos que ejecuta:
 *   1. CREATE TABLE IF NOT EXISTS "LoyaltyTransaction" (+FK → Customer.phone)
 *   2. CREATE INDEX CONCURRENTLY x3 (uno por uno, fuera de transacción)
 *   3. Backfill histórico sintético desde Customer.loyaltyPoints
 *      (1 fila 'legacy-backfill' por cada Customer con loyaltyPoints > 0,
 *       con NOT EXISTS check idempotente)
 *   4. Validaciones finales:
 *      - rowcount table
 *      - SUM(amount) por cliente == Customer.loyaltyPoints
 *      - sin tenantId nulls/empty
 *      - 3/3 índices visibles en pg_indexes
 *
 * Modos:
 *   npx tsx scripts/apply-td030-loyalty-transaction.ts            (dry-run default)
 *   npx tsx scripts/apply-td030-loyalty-transaction.ts --execute  (real apply)
 *
 * Conexión:
 *   Usa DATABASE_URL del .env.local y fuerza el puerto a 5432 (pooler session mode).
 *   Session mode es imprescindible para CREATE INDEX CONCURRENTLY
 *   (transaction mode / puerto 6543 lo rechaza).
 *
 * Idempotencia:
 *   - CREATE TABLE IF NOT EXISTS
 *   - CREATE INDEX CONCURRENTLY IF NOT EXISTS
 *   - Backfill con NOT EXISTS (reason='legacy-backfill' como marca)
 *   → seguro correr múltiples veces.
 *
 * Rollback:
 *   DROP TABLE IF EXISTS "LoyaltyTransaction" CASCADE;
 *
 * Referencias:
 *   - docs/migration-plan-ola1-2026-04-09.md (sección 7)
 *   - docs/adr/020-ola1-migration-plan.md
 *   - scripts/apply-ola1-indices.ts (patrón base)
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = !process.argv.includes("--execute");

// ────────────────────────────────────────────────────────────────────────
// SQL statements
// ────────────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "LoyaltyTransaction" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "customerPhone"  TEXT NOT NULL,
  "amount"         INTEGER NOT NULL,
  "reason"         TEXT NOT NULL,
  "referenceId"    TEXT,
  "balanceAfter"   INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"      TEXT,
  CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoyaltyTransaction_customerPhone_fkey"
    FOREIGN KEY ("customerPhone") REFERENCES "Customer"("phone")
    ON DELETE CASCADE ON UPDATE CASCADE
)
`.trim();

type IndexSpec = {
  name: string;
  description: string;
  sql: string;
};

const INDEXES: IndexSpec[] = [
  {
    name: "idx_loyaltytxn_tenant_createdat",
    description: "Listado global del tenant ordenado por fecha desc",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_loyaltytxn_tenant_createdat" ON "LoyaltyTransaction" ("tenantId", "createdAt" DESC)`,
  },
  {
    name: "idx_loyaltytxn_customer_createdat",
    description: "Historial de 1 cliente ordenado por fecha desc",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_loyaltytxn_customer_createdat" ON "LoyaltyTransaction" ("customerPhone", "createdAt" DESC)`,
  },
  {
    name: "idx_loyaltytxn_tenant_reason",
    description: "Reportes por razón (earn/redeem/legacy-backfill)",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_loyaltytxn_tenant_reason" ON "LoyaltyTransaction" ("tenantId", "reason")`,
  },
];

// Backfill: 1 fila 'legacy-backfill' por cada Customer con loyaltyPoints > 0.
// Idempotente vía NOT EXISTS filtrando por reason='legacy-backfill'.
// cuid-like id determinístico (substring md5 del phone) para re-runs estables.
const BACKFILL_SQL = `
INSERT INTO "LoyaltyTransaction" (
  "id",
  "tenantId",
  "customerPhone",
  "amount",
  "reason",
  "balanceAfter",
  "createdBy",
  "createdAt"
)
SELECT
  'legacy_' || substr(md5(c.phone || c."tenantId"), 1, 20) AS id,
  c."tenantId",
  c.phone AS "customerPhone",
  c."loyaltyPoints" AS amount,
  'legacy-backfill' AS reason,
  c."loyaltyPoints" AS "balanceAfter",
  'system' AS "createdBy",
  NOW() - INTERVAL '1 day' AS "createdAt"
FROM "Customer" c
WHERE c."loyaltyPoints" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "LoyaltyTransaction" lt
    WHERE lt."customerPhone" = c.phone
      AND lt.reason = 'legacy-backfill'
  )
`.trim();

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 TD-030 — Crear LoyaltyTransaction (append-only ledger)\n");
  console.log("   Plan: docs/migration-plan-ola1-2026-04-09.md (sección 7)");
  console.log("   ADR:  docs/adr/020-ola1-migration-plan.md\n");
  console.log(`   Modo: ${DRY_RUN ? "🟡 DRY-RUN (no toca DB)" : "🔴 EXECUTE (aplica en DB)"}\n`);

  if (DRY_RUN) {
    console.log("📋 Plan de ejecución (sin aplicar):\n");
    console.log("   PASO 1: CREATE TABLE IF NOT EXISTS \"LoyaltyTransaction\"");
    console.log("           (+FK → Customer.phone ON DELETE CASCADE)");
    console.log("   PASO 2: CREATE INDEX CONCURRENTLY x3");
    for (const idx of INDEXES) {
      console.log(`           · ${idx.name}`);
    }
    console.log("   PASO 3: Backfill 'legacy-backfill' por cada Customer con loyaltyPoints > 0");
    console.log("   PASO 4: Validaciones (rowcount, SUM(amount), tenantId leaks, 3/3 índices)\n");
    console.log("   Para aplicar: npx tsx scripts/apply-td030-loyalty-transaction.ts --execute");
    return;
  }

  // ── Conexión ──
  const poolerUrl = process.env.DATABASE_URL;
  if (!poolerUrl) {
    console.log("❌ DATABASE_URL no está en .env.local");
    process.exit(1);
  }

  const parsed = new URL(poolerUrl);
  if (!parsed.hostname.includes("pooler.supabase.com")) {
    console.log(`❌ DATABASE_URL no apunta al pooler de Supabase: ${parsed.hostname}`);
    process.exit(1);
  }

  const sessionPort = 5432;
  console.log(`🔎 Usando pooler Supabase en modo session: ${parsed.hostname}:${sessionPort}`);
  console.log("   (puerto 6543 = transaction mode, incompatible con CONCURRENTLY)\n");

  let Client;
  try {
    Client = (await import("pg")).Client;
  } catch {
    console.log("❌ Paquete 'pg' no instalado. Ejecutar: npm install pg --save-dev");
    process.exit(1);
  }

  const client = new Client({
    host: parsed.hostname,
    port: sessionPort,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    ssl: { rejectUnauthorized: false },
  });

  console.log("🔌 Conectando...");
  try {
    await client.connect();
    console.log("   ✅ Conexión establecida\n");
  } catch (err) {
    console.log(`   ❌ Conexión falló: ${(err as Error).message}`);
    process.exit(1);
  }

  try {
    // ────────────────────────────────────────────────────────
    // PASO 1: CREATE TABLE
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 1/4 — CREATE TABLE \"LoyaltyTransaction\"");

    const tableExistsBefore = await client.query(
      `SELECT to_regclass('"public"."LoyaltyTransaction"') IS NOT NULL AS exists`,
    );
    if (tableExistsBefore.rows[0].exists) {
      console.log("   ⏭️  Tabla ya existía, saltando CREATE");
    } else {
      const t0 = Date.now();
      await client.query(CREATE_TABLE_SQL);
      console.log(`   ✅ Tabla creada en ${Date.now() - t0}ms`);
    }

    const tableExistsAfter = await client.query(
      `SELECT to_regclass('"public"."LoyaltyTransaction"') IS NOT NULL AS exists`,
    );
    if (!tableExistsAfter.rows[0].exists) {
      throw new Error("CREATE TABLE reportó éxito pero to_regclass no ve la tabla");
    }
    console.log("   🔍 Verificado vía to_regclass\n");

    // ────────────────────────────────────────────────────────
    // PASO 2: CREATE INDEX CONCURRENTLY x3
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 2/4 — CREATE INDEX CONCURRENTLY x3\n");

    for (const [i, spec] of INDEXES.entries()) {
      console.log(`   [${i + 1}/3] ${spec.name}`);
      console.log(`        ${spec.description}`);

      const existsRes = await client.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = 'public'`,
        [spec.name],
      );
      if (existsRes.rowCount && existsRes.rowCount > 0) {
        console.log("        ⏭️  Ya existía, saltando\n");
        continue;
      }

      const t0 = Date.now();
      try {
        await client.query(spec.sql);
        console.log(`        ✅ Creado en ${Date.now() - t0}ms\n`);
      } catch (err) {
        const msg = (err as Error).message;
        console.log(`        ❌ Falló: ${msg}`);
        console.log(
          "\n🛑 Deteniendo ejecución. Si el índice quedó INVALID:\n" +
            `   DROP INDEX CONCURRENTLY IF EXISTS "${spec.name}";`,
        );
        await client.end();
        process.exit(1);
      }
    }

    // ────────────────────────────────────────────────────────
    // PASO 3: Backfill
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 3/4 — Backfill 'legacy-backfill' desde Customer.loyaltyPoints\n");

    const snapshotBefore = await client.query(
      `SELECT COUNT(*)::int AS customers_with_points,
              COALESCE(SUM("loyaltyPoints"), 0)::int AS total_points
         FROM "Customer"
        WHERE "loyaltyPoints" > 0`,
    );
    const customersWithPoints = snapshotBefore.rows[0].customers_with_points;
    const totalPoints = snapshotBefore.rows[0].total_points;
    console.log(`   📊 Customers con loyaltyPoints > 0: ${customersWithPoints}`);
    console.log(`   📊 Total puntos acumulados:          ${totalPoints}\n`);

    const t0 = Date.now();
    const insertRes = await client.query(BACKFILL_SQL);
    console.log(
      `   ✅ INSERT ejecutado: ${insertRes.rowCount ?? 0} filas nuevas en ${Date.now() - t0}ms\n`,
    );

    // ────────────────────────────────────────────────────────
    // PASO 4: Validaciones
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 4/4 — Validaciones\n");

    const val1 = await client.query(
      `SELECT COUNT(DISTINCT "customerPhone")::int AS backfilled
         FROM "LoyaltyTransaction"
        WHERE reason = 'legacy-backfill'`,
    );
    const backfilled = val1.rows[0].backfilled;
    const v1Ok = backfilled === customersWithPoints;
    console.log(
      `   ${v1Ok ? "✅" : "❌"} Validación 1: backfill cubre todos los clientes (${backfilled}/${customersWithPoints})`,
    );

    const val2 = await client.query(
      `SELECT COUNT(*)::int AS mismatched
         FROM (
           SELECT c.phone
             FROM "Customer" c
             LEFT JOIN "LoyaltyTransaction" lt ON lt."customerPhone" = c.phone
            WHERE c."loyaltyPoints" > 0
            GROUP BY c.phone, c."loyaltyPoints"
           HAVING c."loyaltyPoints" != COALESCE(SUM(lt.amount), 0)
         ) AS sub`,
    );
    const mismatched = val2.rows[0].mismatched;
    const v2Ok = mismatched === 0;
    console.log(
      `   ${v2Ok ? "✅" : "❌"} Validación 2: SUM(amount) = loyaltyPoints por cliente (${mismatched} mismatches)`,
    );

    const val3 = await client.query(
      `SELECT COUNT(*)::int AS leaks
         FROM "LoyaltyTransaction"
        WHERE "tenantId" IS NULL OR "tenantId" = ''`,
    );
    const leaks = val3.rows[0].leaks;
    const v3Ok = leaks === 0;
    console.log(
      `   ${v3Ok ? "✅" : "❌"} Validación 3: sin tenantId leaks (${leaks})`,
    );

    const val4 = await client.query(
      `SELECT COUNT(*)::int AS idx_count
         FROM pg_indexes
        WHERE tablename = 'LoyaltyTransaction'
          AND indexname LIKE 'idx_loyaltytxn_%'`,
    );
    const idxCount = val4.rows[0].idx_count;
    const v4Ok = idxCount === 3;
    console.log(
      `   ${v4Ok ? "✅" : "❌"} Validación 4: 3/3 índices presentes (${idxCount}/3)`,
    );

    // Chequeo adicional: índices INVALID
    const invalidRes = await client.query(
      `SELECT c.relname AS indexname
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE i.indisvalid = false
          AND n.nspname = 'public'
          AND c.relname LIKE 'idx_loyaltytxn_%'`,
    );
    if (invalidRes.rowCount && invalidRes.rowCount > 0) {
      console.log("\n🚨 Índices INVALID detectados:");
      for (const row of invalidRes.rows) {
        console.log(`   · ${row.indexname} → DROP INDEX CONCURRENTLY "${row.indexname}";`);
      }
    }

    // ── Resumen ──
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const allOk = v1Ok && v2Ok && v3Ok && v4Ok;
    if (allOk) {
      console.log("✅ TD-030 aplicado correctamente\n");
      console.log("📌 Próximos pasos:");
      console.log("   1. Editar prisma/schema.prisma con el modelo LoyaltyTransaction");
      console.log("   2. npx prisma validate && npx prisma format && npx prisma generate");
      console.log("   3. Quitar TECH-DEBT en app/api/marketplace/loyalty/route.ts");
      console.log("   4. Re-implementar earn/redeem/history con inserts a LoyaltyTransaction");
    } else {
      console.log("⚠️  TD-030 aplicado con validaciones fallidas — revisar arriba\n");
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Error fatal:", err);
  process.exit(1);
});
