/**
 * scripts/apply-td031-review-imageurls.ts
 *
 * TD-031 — Agregar Review.imageUrls (columna aditiva TEXT[] NOT NULL DEFAULT '{}')
 *
 * Aplica la migración aditiva de TD-031 según el plan:
 *   docs/migration-plan-ola1-2026-04-09.md (sección 8)
 *
 * Pasos:
 *   1. Snapshot: contar filas de Review y data legacy en photosJson
 *   2. ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "imageUrls" TEXT[]
 *      NOT NULL DEFAULT '{}' (Postgres 11+ → O(1), sin rewrite)
 *   3. Validaciones:
 *      - columna existe con data_type='ARRAY', udt_name='_text'
 *      - 0 filas con imageUrls NULL
 *      - default '{}' correctamente aplicado
 *
 * Modos:
 *   npx tsx scripts/apply-td031-review-imageurls.ts            (dry-run default)
 *   npx tsx scripts/apply-td031-review-imageurls.ts --execute  (real apply)
 *
 * Idempotencia:
 *   - ADD COLUMN IF NOT EXISTS
 *   → seguro correr múltiples veces.
 *
 * Rollback:
 *   ALTER TABLE "Review" DROP COLUMN IF EXISTS "imageUrls";
 *
 * Referencias:
 *   - docs/migration-plan-ola1-2026-04-09.md (sección 8)
 *   - docs/adr/020-ola1-migration-plan.md
 *   - scripts/apply-ola1-indices.ts (patrón base)
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = !process.argv.includes("--execute");

const ADD_COLUMN_SQL = `
ALTER TABLE "Review"
  ADD COLUMN IF NOT EXISTS "imageUrls" TEXT[] NOT NULL DEFAULT '{}'
`.trim();

async function main() {
  console.log("🚀 TD-031 — Agregar Review.imageUrls\n");
  console.log("   Plan: docs/migration-plan-ola1-2026-04-09.md (sección 8)");
  console.log("   ADR:  docs/adr/020-ola1-migration-plan.md\n");
  console.log(`   Modo: ${DRY_RUN ? "🟡 DRY-RUN (no toca DB)" : "🔴 EXECUTE (aplica en DB)"}\n`);

  if (DRY_RUN) {
    console.log("📋 Plan de ejecución (sin aplicar):\n");
    console.log("   PASO 1: Snapshot Review (COUNT + photosJson legacy)");
    console.log("   PASO 2: ALTER TABLE \"Review\" ADD COLUMN IF NOT EXISTS \"imageUrls\"");
    console.log("           TEXT[] NOT NULL DEFAULT '{}'");
    console.log("           (Postgres 11+ → O(1), sin rewrite de filas)");
    console.log("   PASO 3: Validaciones (columna existe, tipo ARRAY/_text, 0 NULLs)\n");
    console.log("   Para aplicar: npx tsx scripts/apply-td031-review-imageurls.ts --execute");
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
    // PASO 1: Snapshot
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 1/3 — Snapshot Review\n");

    const snapshot = await client.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE "photosJson" IS NOT NULL AND "photosJson" != '')::int AS with_photos_json
       FROM "Review"`,
    );
    const total = snapshot.rows[0].total;
    const withPhotosJson = snapshot.rows[0].with_photos_json;
    console.log(`   📊 Total reviews:              ${total}`);
    console.log(`   📊 Con photosJson legacy:      ${withPhotosJson}`);
    if (withPhotosJson > 0) {
      console.log("   💡 Considerar backfill opcional desde photosJson → imageUrls");
      console.log("      (ver sección 8 del plan — correr aparte tras este script)");
    }
    console.log("");

    // ────────────────────────────────────────────────────────
    // PASO 2: ADD COLUMN
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 2/3 — ALTER TABLE ADD COLUMN \"imageUrls\"\n");

    const colExistsBefore = await client.query(
      `SELECT COUNT(*)::int AS c
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Review'
          AND column_name = 'imageUrls'`,
    );
    if (colExistsBefore.rows[0].c > 0) {
      console.log("   ⏭️  Columna ya existía, saltando ALTER\n");
    } else {
      const t0 = Date.now();
      await client.query(ADD_COLUMN_SQL);
      console.log(`   ✅ Columna agregada en ${Date.now() - t0}ms\n`);
    }

    // ────────────────────────────────────────────────────────
    // PASO 3: Validaciones
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 3/3 — Validaciones\n");

    const val1 = await client.query(
      `SELECT data_type, udt_name, column_default, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Review'
          AND column_name = 'imageUrls'`,
    );
    const v1Ok =
      val1.rowCount === 1 &&
      val1.rows[0].data_type === "ARRAY" &&
      val1.rows[0].udt_name === "_text" &&
      val1.rows[0].is_nullable === "NO";
    console.log(`   ${v1Ok ? "✅" : "❌"} Validación 1: columna existe (data_type=ARRAY, udt=_text, NOT NULL)`);
    if (val1.rowCount === 1) {
      console.log(
        `        data_type=${val1.rows[0].data_type} udt=${val1.rows[0].udt_name} ` +
          `nullable=${val1.rows[0].is_nullable} default=${val1.rows[0].column_default ?? "(none)"}`,
      );
    }

    const val2 = await client.query(
      `SELECT COUNT(*)::int AS nulls FROM "Review" WHERE "imageUrls" IS NULL`,
    );
    const nulls = val2.rows[0].nulls;
    const v2Ok = nulls === 0;
    console.log(`   ${v2Ok ? "✅" : "❌"} Validación 2: 0 filas con imageUrls NULL (${nulls})`);

    const val3 = await client.query(
      `SELECT COUNT(*)::int AS populated
         FROM "Review"
        WHERE array_length("imageUrls", 1) IS NOT NULL`,
    );
    console.log(
      `   ℹ️  Validación 3: filas con array no vacío = ${val3.rows[0].populated} ` +
        "(esperado 0 antes del deploy del nuevo código, >0 después)",
    );

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const allOk = v1Ok && v2Ok;
    if (allOk) {
      console.log("✅ TD-031 aplicado correctamente\n");
      console.log("📌 Próximos pasos:");
      console.log("   1. Editar prisma/schema.prisma: `imageUrls String[] @default([])` en Review");
      console.log("   2. npx prisma validate && npx prisma format && npx prisma generate");
      console.log("   3. Quitar 3 TECH-DEBT en app/api/marketplace/stores/[slug]/reviews/route.ts");
      console.log("   4. Test integración: crear review con imágenes y leerla");
    } else {
      console.log("⚠️  TD-031 aplicado con validaciones fallidas — revisar arriba\n");
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
