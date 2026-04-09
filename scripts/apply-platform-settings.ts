/**
 * scripts/apply-platform-settings.ts
 *
 * FIX-MRR — Crear modelo PlatformSetting (global key/value store)
 *
 * Aplica la migración aditiva que habilita la "single source of truth" de
 * precios de planes y settings globales de la plataforma. Fixea el bug de
 * MRR fake off-by-100 del panel Superadmin (enterprise 399 vs 499).
 *
 * Ver docs/research/superadmin-improvements-2026-04-09.md (mejora #1).
 *
 * Pasos que ejecuta:
 *   1. CREATE TABLE IF NOT EXISTS "PlatformSetting" (key PK, value JSONB)
 *   2. Seed inicial de "plan-prices" con los defaults canónicos
 *      (free=0, pro=49, business=149, enterprise=499) — solo si no existe.
 *   3. Validaciones finales:
 *      - rowcount table
 *      - seed de plan-prices presente y con los 4 planes
 *
 * Modos:
 *   npx tsx scripts/apply-platform-settings.ts            (dry-run default)
 *   npx tsx scripts/apply-platform-settings.ts --execute  (real apply)
 *
 * Conexión:
 *   Usa DATABASE_URL del .env.local y fuerza el puerto a 5432 (pooler session mode).
 *   (Session mode es el patrón estándar del repo para scripts de migration.)
 *
 * Idempotencia:
 *   - CREATE TABLE IF NOT EXISTS
 *   - INSERT ... ON CONFLICT (key) DO NOTHING
 *   → seguro correr múltiples veces.
 *
 * Rollback:
 *   DROP TABLE IF EXISTS "PlatformSetting" CASCADE;
 *
 * Referencias:
 *   - docs/research/superadmin-improvements-2026-04-09.md (mejora #1)
 *   - prisma/schema.prisma (modelo PlatformSetting)
 *   - scripts/apply-td030-loyalty-transaction.ts (patrón base)
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = !process.argv.includes("--execute");

// ────────────────────────────────────────────────────────────────────────
// SQL statements
// ────────────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "key"        TEXT NOT NULL,
  "value"      JSONB NOT NULL,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy"  TEXT,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
)
`.trim();

// Seed canónico de precios de planes. Matches lib/superadmin-types.ts:72 y
// lib/plans.ts DEFAULT_PLAN_PRICES. Usamos ON CONFLICT DO NOTHING para que el
// script sea idempotente y NO sobreescriba cambios manuales de Brandon.
const SEED_PLAN_PRICES_SQL = `
INSERT INTO "PlatformSetting" ("key", "value", "updatedAt", "updatedBy")
VALUES (
  'plan-prices',
  '{"free":0,"pro":49,"business":149,"enterprise":499}'::jsonb,
  CURRENT_TIMESTAMP,
  'migration-script'
)
ON CONFLICT ("key") DO NOTHING
`.trim();

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 FIX-MRR — Crear PlatformSetting (global settings store)\n");
  console.log("   Fix:  MRR fake off-by-100 en Superadmin dashboard");
  console.log("   Doc:  docs/research/superadmin-improvements-2026-04-09.md (mejora #1)\n");
  console.log(`   Modo: ${DRY_RUN ? "🟡 DRY-RUN (no toca DB)" : "🔴 EXECUTE (aplica en DB)"}\n`);

  if (DRY_RUN) {
    console.log("📋 Plan de ejecución (sin aplicar):\n");
    console.log("   PASO 1: CREATE TABLE IF NOT EXISTS \"PlatformSetting\"");
    console.log("           (key TEXT PK, value JSONB, updatedAt, updatedBy)");
    console.log("   PASO 2: Seed 'plan-prices' con defaults canónicos");
    console.log("           (free=0, pro=49, business=149, enterprise=499)");
    console.log("   PASO 3: Validaciones (tabla existe, seed presente)\n");
    console.log("   Para aplicar: npx tsx scripts/apply-platform-settings.ts --execute");
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
  console.log("   (puerto 6543 = transaction mode — usamos session por consistencia con otros scripts)\n");

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
    console.log("📦 PASO 1/3 — CREATE TABLE \"PlatformSetting\"");

    const tableExistsBefore = await client.query(
      `SELECT to_regclass('"public"."PlatformSetting"') IS NOT NULL AS exists`,
    );
    if (tableExistsBefore.rows[0].exists) {
      console.log("   ⏭️  Tabla ya existía, saltando CREATE");
    } else {
      const t0 = Date.now();
      await client.query(CREATE_TABLE_SQL);
      console.log(`   ✅ Tabla creada en ${Date.now() - t0}ms`);
    }

    const tableExistsAfter = await client.query(
      `SELECT to_regclass('"public"."PlatformSetting"') IS NOT NULL AS exists`,
    );
    if (!tableExistsAfter.rows[0].exists) {
      throw new Error("CREATE TABLE reportó éxito pero to_regclass no ve la tabla");
    }
    console.log("   🔍 Verificado vía to_regclass\n");

    // ────────────────────────────────────────────────────────
    // PASO 2: Seed 'plan-prices'
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 2/3 — Seed 'plan-prices' con defaults canónicos\n");

    const seedBefore = await client.query(
      `SELECT value FROM "PlatformSetting" WHERE "key" = 'plan-prices'`,
    );
    if ((seedBefore.rowCount ?? 0) > 0) {
      console.log(
        `   ⏭️  'plan-prices' ya existe: ${JSON.stringify(seedBefore.rows[0].value)}`,
      );
      console.log("       (ON CONFLICT DO NOTHING — no se sobreescribe)\n");
    } else {
      const t0 = Date.now();
      await client.query(SEED_PLAN_PRICES_SQL);
      console.log(`   ✅ Seed aplicado en ${Date.now() - t0}ms`);
      console.log("       {free:0, pro:49, business:149, enterprise:499}\n");
    }

    // ────────────────────────────────────────────────────────
    // PASO 3: Validaciones
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 3/3 — Validaciones\n");

    const val1 = await client.query(
      `SELECT to_regclass('"public"."PlatformSetting"') IS NOT NULL AS exists`,
    );
    const v1Ok = val1.rows[0].exists === true;
    console.log(`   ${v1Ok ? "✅" : "❌"} Validación 1: tabla PlatformSetting existe`);

    const val2 = await client.query(
      `SELECT value FROM "PlatformSetting" WHERE "key" = 'plan-prices'`,
    );
    const seedRow = val2.rows[0];
    const v2Ok =
      !!seedRow &&
      typeof seedRow.value === "object" &&
      "free" in seedRow.value &&
      "pro" in seedRow.value &&
      "business" in seedRow.value &&
      "enterprise" in seedRow.value;
    console.log(
      `   ${v2Ok ? "✅" : "❌"} Validación 2: seed plan-prices presente con los 4 planes`,
    );
    if (seedRow) {
      console.log(`       Valor actual: ${JSON.stringify(seedRow.value)}`);
    }

    const val3 = await client.query(
      `SELECT COUNT(*)::int AS total FROM "PlatformSetting"`,
    );
    const total = val3.rows[0].total;
    console.log(`   ℹ️  Total de rows en PlatformSetting: ${total}`);

    // ── Resumen ──
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const allOk = v1Ok && v2Ok;
    if (allOk) {
      console.log("✅ PlatformSetting aplicado correctamente\n");
      console.log("📌 Próximos pasos:");
      console.log("   1. npx prisma validate && npx prisma format && npx prisma generate");
      console.log("   2. Reiniciar dev server para cargar el nuevo cliente Prisma");
      console.log("   3. Verificar MRR en /superadmin/dashboard (ya no debería estar off-by-100)");
      console.log("   4. Editar precios desde /superadmin/settings (persisten en DB, no en localStorage)");
    } else {
      console.log("⚠️  PlatformSetting aplicado con validaciones fallidas — revisar arriba\n");
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
