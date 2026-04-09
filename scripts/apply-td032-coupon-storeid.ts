/**
 * scripts/apply-td032-coupon-storeid.ts
 *
 * TD-032 — Agregar Coupon.storeId + FK → Store + migrar unique constraint
 *
 * Aplica la migración aditiva de TD-032 según el plan:
 *   docs/migration-plan-ola1-2026-04-09.md (sección 9)
 *
 * Pasos:
 *   1. Detectar versión de Postgres (elige Path A pg15+ NULLS NOT DISTINCT
 *      vs Path B pg14- unique parciales)
 *   2. ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "storeId" TEXT NULL
 *   3. ADD CONSTRAINT FK → Store(id) ON DELETE SET NULL NOT VALID
 *      (+ VALIDATE CONSTRAINT → sin lock exclusivo prolongado)
 *   4. CREATE INDEX CONCURRENTLY "idx_coupon_storeid"
 *   5. Rebuild del unique constraint:
 *      Path A (pg15+): DROP "Coupon_tenantId_code_key"
 *                      ADD CONSTRAINT "Coupon_tenant_code_store_unique"
 *                        UNIQUE NULLS NOT DISTINCT ("tenantId", "code", "storeId")
 *      Path B (pg14-): DROP "Coupon_tenantId_code_key"
 *                      CREATE UNIQUE INDEX "Coupon_tenant_code_pos_unique"
 *                        ON "Coupon"("tenantId","code") WHERE "storeId" IS NULL
 *                      CREATE UNIQUE INDEX "Coupon_tenant_code_marketplace_unique"
 *                        ON "Coupon"("tenantId","code","storeId") WHERE "storeId" IS NOT NULL
 *   6. Validaciones
 *
 * Modos:
 *   npx tsx scripts/apply-td032-coupon-storeid.ts            (dry-run default)
 *   npx tsx scripts/apply-td032-coupon-storeid.ts --execute  (real apply)
 *
 * Idempotencia:
 *   - ADD COLUMN IF NOT EXISTS
 *   - ADD CONSTRAINT con pg_constraint check
 *   - CREATE INDEX CONCURRENTLY IF NOT EXISTS
 *   - Unique rebuild se detecta por pg_constraint antes de tocar
 *
 * Rollback (en orden):
 *   ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_tenant_code_store_unique";
 *   DROP INDEX IF EXISTS "Coupon_tenant_code_pos_unique";
 *   DROP INDEX IF EXISTS "Coupon_tenant_code_marketplace_unique";
 *   ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_tenantId_code_key" UNIQUE ("tenantId", "code");
 *   DROP INDEX CONCURRENTLY IF EXISTS "idx_coupon_storeid";
 *   ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_storeId_fkey";
 *   ALTER TABLE "Coupon" DROP COLUMN IF EXISTS "storeId";
 *
 * Referencias:
 *   - docs/migration-plan-ola1-2026-04-09.md (sección 9)
 *   - docs/adr/020-ola1-migration-plan.md
 *   - scripts/apply-ola1-indices.ts (patrón base)
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = !process.argv.includes("--execute");

const OLD_UNIQUE_NAME = "Coupon_tenantId_code_key";
const NEW_UNIQUE_NAME = "Coupon_tenant_code_store_unique";
const POS_PARTIAL_INDEX_NAME = "Coupon_tenant_code_pos_unique";
const MKT_PARTIAL_INDEX_NAME = "Coupon_tenant_code_marketplace_unique";
const FK_NAME = "Coupon_storeId_fkey";
const STORE_IDX_NAME = "idx_coupon_storeid";

async function main() {
  console.log("🚀 TD-032 — Agregar Coupon.storeId + FK + rebuild unique\n");
  console.log("   Plan: docs/migration-plan-ola1-2026-04-09.md (sección 9)");
  console.log("   ADR:  docs/adr/020-ola1-migration-plan.md\n");
  console.log(`   Modo: ${DRY_RUN ? "🟡 DRY-RUN (no toca DB)" : "🔴 EXECUTE (aplica en DB)"}\n`);

  if (DRY_RUN) {
    console.log("📋 Plan de ejecución (sin aplicar):\n");
    console.log("   PASO 1: Detectar versión Postgres (SHOW server_version_num)");
    console.log("           >= 15 → Path A (NULLS NOT DISTINCT)");
    console.log("           <  15 → Path B (2 unique parciales)");
    console.log("   PASO 2: ALTER TABLE \"Coupon\" ADD COLUMN IF NOT EXISTS \"storeId\" TEXT NULL");
    console.log("   PASO 3: ADD CONSTRAINT FK → Store ON DELETE SET NULL NOT VALID + VALIDATE");
    console.log(`   PASO 4: CREATE INDEX CONCURRENTLY IF NOT EXISTS "${STORE_IDX_NAME}"`);
    console.log("   PASO 5: DROP OLD UNIQUE + ADD NEW UNIQUE (lock brevísimo, ejecutar en horario bajo)");
    console.log("   PASO 6: Validaciones (columna, FK, índices, unique, sin orphans)\n");
    console.log("   Para aplicar: npx tsx scripts/apply-td032-coupon-storeid.ts --execute");
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
  console.log(`🔎 Usando pooler Supabase en modo session: ${parsed.hostname}:${sessionPort}\n`);

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
    // PASO 1: Detectar versión Postgres
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 1/6 — Detectar versión Postgres\n");

    const verRes = await client.query(`SHOW server_version_num`);
    const versionNum = parseInt(verRes.rows[0].server_version_num, 10);
    const verStr = await client.query(`SELECT version()`);
    const isPg15Plus = versionNum >= 150000;
    const pathLabel = isPg15Plus ? "A (NULLS NOT DISTINCT)" : "B (unique parciales)";
    console.log(`   📊 server_version_num: ${versionNum}`);
    console.log(`   📊 version():          ${verStr.rows[0].version}`);
    console.log(`   🛤️  Path elegido:       ${pathLabel}\n`);

    // Snapshot
    const snap = await client.query(`SELECT COUNT(*)::int AS total FROM "Coupon"`);
    console.log(`   📊 Coupons existentes: ${snap.rows[0].total}\n`);

    // ────────────────────────────────────────────────────────
    // PASO 2: ADD COLUMN storeId
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 2/6 — ADD COLUMN \"storeId\"\n");

    const colExists = await client.query(
      `SELECT COUNT(*)::int AS c
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='Coupon' AND column_name='storeId'`,
    );
    if (colExists.rows[0].c > 0) {
      console.log("   ⏭️  Columna ya existía, saltando\n");
    } else {
      const t0 = Date.now();
      await client.query(`ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "storeId" TEXT NULL`);
      console.log(`   ✅ Columna agregada en ${Date.now() - t0}ms\n`);
    }

    // ────────────────────────────────────────────────────────
    // PASO 3: ADD FK CONSTRAINT (NOT VALID + VALIDATE)
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 3/6 — ADD CONSTRAINT FK → Store\n");

    const fkExists = await client.query(
      `SELECT COUNT(*)::int AS c
         FROM pg_constraint
        WHERE conname = $1
          AND conrelid = '"Coupon"'::regclass`,
      [FK_NAME],
    );
    if (fkExists.rows[0].c > 0) {
      console.log("   ⏭️  FK ya existía, saltando ADD/VALIDATE\n");
    } else {
      const t0 = Date.now();
      await client.query(`
        ALTER TABLE "Coupon"
          ADD CONSTRAINT "${FK_NAME}"
          FOREIGN KEY ("storeId") REFERENCES "Store"("id")
          ON DELETE SET NULL ON UPDATE CASCADE
          NOT VALID
      `);
      console.log(`   ✅ FK agregada (NOT VALID) en ${Date.now() - t0}ms`);

      const t1 = Date.now();
      await client.query(`ALTER TABLE "Coupon" VALIDATE CONSTRAINT "${FK_NAME}"`);
      console.log(`   ✅ FK validada en ${Date.now() - t1}ms\n`);
    }

    // ────────────────────────────────────────────────────────
    // PASO 4: CREATE INDEX CONCURRENTLY idx_coupon_storeid
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📦 PASO 4/6 — CREATE INDEX CONCURRENTLY "${STORE_IDX_NAME}"\n`);

    const idxExists = await client.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = 'public'`,
      [STORE_IDX_NAME],
    );
    if (idxExists.rowCount && idxExists.rowCount > 0) {
      console.log("   ⏭️  Índice ya existía, saltando\n");
    } else {
      const t0 = Date.now();
      try {
        await client.query(
          `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${STORE_IDX_NAME}" ON "Coupon" ("storeId")`,
        );
        console.log(`   ✅ Índice creado en ${Date.now() - t0}ms\n`);
      } catch (err) {
        const msg = (err as Error).message;
        console.log(`   ❌ Falló: ${msg}`);
        console.log(
          `\n🛑 Si quedó INVALID: DROP INDEX CONCURRENTLY IF EXISTS "${STORE_IDX_NAME}";\n`,
        );
        await client.end();
        process.exit(1);
      }
    }

    // ────────────────────────────────────────────────────────
    // PASO 5: Rebuild del unique constraint
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📦 PASO 5/6 — Rebuild unique (Path ${isPg15Plus ? "A" : "B"})\n`);

    // ¿ya está aplicado el new unique?
    const newUniqueExists = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_constraint WHERE conname = $1`,
      [NEW_UNIQUE_NAME],
    );
    const posPartialExists = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_indexes WHERE indexname = $1 AND schemaname='public'`,
      [POS_PARTIAL_INDEX_NAME],
    );
    const mktPartialExists = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_indexes WHERE indexname = $1 AND schemaname='public'`,
      [MKT_PARTIAL_INDEX_NAME],
    );

    const alreadyAppliedPathA = newUniqueExists.rows[0].c > 0;
    const alreadyAppliedPathB =
      posPartialExists.rows[0].c > 0 && mktPartialExists.rows[0].c > 0;

    if (alreadyAppliedPathA || alreadyAppliedPathB) {
      console.log("   ⏭️  Rebuild del unique ya estaba aplicado, saltando\n");
    } else {
      // Drop viejo unique si existe
      const oldUniqueExists = await client.query(
        `SELECT COUNT(*)::int AS c FROM pg_constraint WHERE conname = $1`,
        [OLD_UNIQUE_NAME],
      );
      if (oldUniqueExists.rows[0].c > 0) {
        console.log(`   🔻 Dropping old constraint "${OLD_UNIQUE_NAME}"`);
        const t0 = Date.now();
        await client.query(`ALTER TABLE "Coupon" DROP CONSTRAINT "${OLD_UNIQUE_NAME}"`);
        console.log(`      ✅ dropped en ${Date.now() - t0}ms`);
      } else {
        console.log(`   ⏭️  "${OLD_UNIQUE_NAME}" no existía, saltando DROP`);
      }

      if (isPg15Plus) {
        // Path A — pg15+
        console.log(`   🔺 ADD CONSTRAINT "${NEW_UNIQUE_NAME}" UNIQUE NULLS NOT DISTINCT`);
        const t0 = Date.now();
        await client.query(`
          ALTER TABLE "Coupon"
            ADD CONSTRAINT "${NEW_UNIQUE_NAME}"
            UNIQUE NULLS NOT DISTINCT ("tenantId", "code", "storeId")
        `);
        console.log(`      ✅ Constraint creado en ${Date.now() - t0}ms\n`);
      } else {
        // Path B — pg14 o menor
        console.log(`   🔺 CREATE UNIQUE INDEX "${POS_PARTIAL_INDEX_NAME}" (WHERE storeId IS NULL)`);
        const t0 = Date.now();
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "${POS_PARTIAL_INDEX_NAME}"
            ON "Coupon" ("tenantId", "code")
            WHERE "storeId" IS NULL
        `);
        console.log(`      ✅ en ${Date.now() - t0}ms`);

        console.log(
          `   🔺 CREATE UNIQUE INDEX "${MKT_PARTIAL_INDEX_NAME}" (WHERE storeId IS NOT NULL)`,
        );
        const t1 = Date.now();
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "${MKT_PARTIAL_INDEX_NAME}"
            ON "Coupon" ("tenantId", "code", "storeId")
            WHERE "storeId" IS NOT NULL
        `);
        console.log(`      ✅ en ${Date.now() - t1}ms\n`);
      }
    }

    // ────────────────────────────────────────────────────────
    // PASO 6: Validaciones
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 6/6 — Validaciones\n");

    const val1 = await client.query(
      `SELECT data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='Coupon' AND column_name='storeId'`,
    );
    const v1Ok =
      val1.rowCount === 1 &&
      val1.rows[0].data_type === "text" &&
      val1.rows[0].is_nullable === "YES";
    console.log(`   ${v1Ok ? "✅" : "❌"} Validación 1: columna storeId existe (text, nullable)`);

    const val2 = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_constraint
        WHERE conname = $1 AND contype = 'f' AND conrelid = '"Coupon"'::regclass`,
      [FK_NAME],
    );
    const v2Ok = val2.rows[0].c === 1;
    console.log(`   ${v2Ok ? "✅" : "❌"} Validación 2: FK "${FK_NAME}" presente`);

    const val3 = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_indexes
        WHERE indexname = $1 AND schemaname = 'public'`,
      [STORE_IDX_NAME],
    );
    const v3Ok = val3.rows[0].c === 1;
    console.log(`   ${v3Ok ? "✅" : "❌"} Validación 3: índice "${STORE_IDX_NAME}" presente`);

    // Validación 4: unique aplicado según path
    let v4Ok = false;
    if (isPg15Plus) {
      const val4 = await client.query(
        `SELECT COUNT(*)::int AS c FROM pg_constraint WHERE conname = $1`,
        [NEW_UNIQUE_NAME],
      );
      v4Ok = val4.rows[0].c === 1;
      console.log(
        `   ${v4Ok ? "✅" : "❌"} Validación 4 (Path A): constraint "${NEW_UNIQUE_NAME}" presente`,
      );
    } else {
      const val4a = await client.query(
        `SELECT COUNT(*)::int AS c FROM pg_indexes WHERE indexname = $1`,
        [POS_PARTIAL_INDEX_NAME],
      );
      const val4b = await client.query(
        `SELECT COUNT(*)::int AS c FROM pg_indexes WHERE indexname = $1`,
        [MKT_PARTIAL_INDEX_NAME],
      );
      v4Ok = val4a.rows[0].c === 1 && val4b.rows[0].c === 1;
      console.log(
        `   ${v4Ok ? "✅" : "❌"} Validación 4 (Path B): ambos unique parciales presentes`,
      );
    }

    // Validación 5: no hay cupones huérfanos (storeId → Store inexistente)
    const val5 = await client.query(
      `SELECT COUNT(*)::int AS orphans
         FROM "Coupon" c
         LEFT JOIN "Store" s ON s."id" = c."storeId"
        WHERE c."storeId" IS NOT NULL AND s."id" IS NULL`,
    );
    const orphans = val5.rows[0].orphans;
    const v5Ok = orphans === 0;
    console.log(`   ${v5Ok ? "✅" : "❌"} Validación 5: sin cupones huérfanos (${orphans})`);

    // Validación 6: viejo constraint ya no existe
    const val6 = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_constraint WHERE conname = $1`,
      [OLD_UNIQUE_NAME],
    );
    const v6Ok = val6.rows[0].c === 0;
    console.log(
      `   ${v6Ok ? "✅" : "❌"} Validación 6: viejo "${OLD_UNIQUE_NAME}" removido`,
    );

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const allOk = v1Ok && v2Ok && v3Ok && v4Ok && v5Ok && v6Ok;
    if (allOk) {
      console.log("✅ TD-032 aplicado correctamente\n");
      console.log("📌 Próximos pasos:");
      console.log("   1. Editar prisma/schema.prisma con storeId + relation + nuevo @@unique");
      console.log("   2. npx prisma validate && npx prisma format && npx prisma generate");
      console.log("   3. Quitar 5 TECH-DEBT en los 3 route handlers de marketplace/coupons");
      console.log("   4. Auditar `grep -r \"Coupon\" lib/db/` y verificar filtros por storeId");
      console.log("   5. Tests: crear cupón POS, cupón marketplace, validar códigos duplicados");
    } else {
      console.log("⚠️  TD-032 aplicado con validaciones fallidas — revisar arriba\n");
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
