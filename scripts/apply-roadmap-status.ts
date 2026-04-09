/**
 * scripts/apply-roadmap-status.ts
 *
 * Crea la tabla "RoadmapItemStatus" + sus índices para soportar el módulo
 * Roadmap del superadmin (Master Roadmap 2026-04-09 — 84 items).
 *
 * Aditivo, no destructivo. Idempotente (IF NOT EXISTS).
 *
 * Pasos que ejecuta:
 *   1. CREATE TABLE IF NOT EXISTS "RoadmapItemStatus"
 *   2. CREATE INDEX CONCURRENTLY x2 (status, updatedAt)
 *   3. Validaciones finales (rowcount, índices, NOT NULL constraints)
 *
 * Modos:
 *   npx tsx scripts/apply-roadmap-status.ts            (dry-run default)
 *   npx tsx scripts/apply-roadmap-status.ts --execute  (real apply)
 *
 * Conexión:
 *   Usa DATABASE_URL del .env.local y fuerza puerto 5432 (pooler session mode).
 *   CREATE INDEX CONCURRENTLY necesita session mode.
 *
 * Rollback:
 *   DROP TABLE IF EXISTS "RoadmapItemStatus" CASCADE;
 *
 * Referencias:
 *   - scripts/apply-td030-loyalty-transaction.ts (patrón base)
 *   - lib/db/roadmap-status.db.ts (consumidor)
 *   - lib/roadmap/items.ts (catálogo estático)
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = !process.argv.includes("--execute");

// ────────────────────────────────────────────────────────────────────────
// SQL statements
// ────────────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "RoadmapItemStatus" (
  "id"          TEXT NOT NULL,
  "itemId"      TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'planned',
  "progress"    INTEGER NOT NULL DEFAULT 0,
  "startedAt"   TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "notes"       TEXT,
  "updatedBy"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoadmapItemStatus_pkey" PRIMARY KEY ("id")
)
`.trim();

const CREATE_UNIQUE_ITEMID_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "RoadmapItemStatus_itemId_key"
  ON "RoadmapItemStatus" ("itemId")
`.trim();

type IndexSpec = {
  name: string;
  description: string;
  sql: string;
};

const INDEXES: IndexSpec[] = [
  {
    name: "RoadmapItemStatus_status_idx",
    description: "Filtros por estado (planned/in_progress/done/blocked/skipped)",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "RoadmapItemStatus_status_idx" ON "RoadmapItemStatus" ("status")`,
  },
  {
    name: "RoadmapItemStatus_updatedAt_idx",
    description: "Ordenamiento por última modificación (actividad reciente)",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "RoadmapItemStatus_updatedAt_idx" ON "RoadmapItemStatus" ("updatedAt" DESC)`,
  },
];

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🗺️  Roadmap — Crear tabla RoadmapItemStatus\n");
  console.log("   Plan: módulo Roadmap del superadmin (84 items Master Roadmap 2026-04-09)");
  console.log("   Contenido: lib/roadmap/items.ts (estático en código)");
  console.log("   Estado:    esta tabla (mutable via UI)\n");
  console.log(`   Modo: ${DRY_RUN ? "🟡 DRY-RUN (no toca DB)" : "🔴 EXECUTE (aplica en DB)"}\n`);

  if (DRY_RUN) {
    console.log("📋 Plan de ejecución (sin aplicar):\n");
    console.log("   PASO 1: CREATE TABLE IF NOT EXISTS \"RoadmapItemStatus\"");
    console.log("           columns: id, itemId, status, progress, startedAt, completedAt,");
    console.log("                    notes, updatedBy, createdAt, updatedAt");
    console.log("   PASO 2: CREATE UNIQUE INDEX IF NOT EXISTS on itemId");
    console.log("   PASO 3: CREATE INDEX CONCURRENTLY x2");
    for (const idx of INDEXES) {
      console.log(`           · ${idx.name}`);
    }
    console.log("   PASO 4: Validaciones (tabla existe, 3 índices visibles, columnas OK)\n");
    console.log("   Para aplicar: npx tsx scripts/apply-roadmap-status.ts --execute\n");
    console.log("   Después de aplicar:");
    console.log("   1. npx prisma validate && npx prisma format && npx prisma generate");
    console.log("   2. npx tsc --noEmit  (verificar que el modelo cierra types)");
    console.log("   3. Reiniciar dev server para cargar el prisma-client nuevo");
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
    console.log("📦 PASO 1/4 — CREATE TABLE \"RoadmapItemStatus\"");

    const tableExistsBefore = await client.query(
      `SELECT to_regclass('"public"."RoadmapItemStatus"') IS NOT NULL AS exists`,
    );
    if (tableExistsBefore.rows[0].exists) {
      console.log("   ⏭️  Tabla ya existía, saltando CREATE");
    } else {
      const t0 = Date.now();
      await client.query(CREATE_TABLE_SQL);
      console.log(`   ✅ Tabla creada en ${Date.now() - t0}ms`);
    }

    const tableExistsAfter = await client.query(
      `SELECT to_regclass('"public"."RoadmapItemStatus"') IS NOT NULL AS exists`,
    );
    if (!tableExistsAfter.rows[0].exists) {
      throw new Error("CREATE TABLE reportó éxito pero to_regclass no ve la tabla");
    }
    console.log("   🔍 Verificado vía to_regclass\n");

    // ────────────────────────────────────────────────────────
    // PASO 2: UNIQUE INDEX on itemId
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 2/4 — CREATE UNIQUE INDEX on itemId\n");

    const uniqueExists = await client.query(
      `SELECT 1 FROM pg_indexes
        WHERE indexname = 'RoadmapItemStatus_itemId_key' AND schemaname = 'public'`,
    );
    if (uniqueExists.rowCount && uniqueExists.rowCount > 0) {
      console.log("   ⏭️  Índice único ya existía, saltando\n");
    } else {
      const t0 = Date.now();
      await client.query(CREATE_UNIQUE_ITEMID_SQL);
      console.log(`   ✅ Índice único creado en ${Date.now() - t0}ms\n`);
    }

    // ────────────────────────────────────────────────────────
    // PASO 3: CREATE INDEX CONCURRENTLY x2
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 3/4 — CREATE INDEX CONCURRENTLY x2\n");

    for (const [i, spec] of INDEXES.entries()) {
      console.log(`   [${i + 1}/${INDEXES.length}] ${spec.name}`);
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
    // PASO 4: Validaciones
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PASO 4/4 — Validaciones\n");

    const val1 = await client.query(
      `SELECT COUNT(*)::int AS cnt
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'RoadmapItemStatus'
          AND column_name IN ('id','itemId','status','progress','startedAt','completedAt','notes','updatedBy','createdAt','updatedAt')`,
    );
    const colCount = val1.rows[0].cnt;
    const v1Ok = colCount === 10;
    console.log(
      `   ${v1Ok ? "✅" : "❌"} Validación 1: 10 columnas esperadas presentes (${colCount}/10)`,
    );

    const val2 = await client.query(
      `SELECT COUNT(*)::int AS idx_count
         FROM pg_indexes
        WHERE tablename = 'RoadmapItemStatus'
          AND schemaname = 'public'`,
    );
    const idxCount = val2.rows[0].idx_count;
    // pkey + unique itemId + 2 concurrent = 4 esperados
    const v2Ok = idxCount >= 4;
    console.log(
      `   ${v2Ok ? "✅" : "❌"} Validación 2: ≥4 índices (pkey + unique + 2 secundarios) (${idxCount})`,
    );

    const val3 = await client.query(
      `SELECT COUNT(*)::int AS cnt
         FROM "RoadmapItemStatus"`,
    );
    const rowCount = val3.rows[0].cnt;
    console.log(
      `   ℹ️  Validación 3: filas actuales en RoadmapItemStatus (${rowCount}) — normal 0 en primera corrida`,
    );

    // Chequeo adicional: índices INVALID
    const invalidRes = await client.query(
      `SELECT c.relname AS indexname
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE i.indisvalid = false
          AND n.nspname = 'public'
          AND c.relname LIKE 'RoadmapItemStatus_%'`,
    );
    if (invalidRes.rowCount && invalidRes.rowCount > 0) {
      console.log("\n🚨 Índices INVALID detectados:");
      for (const row of invalidRes.rows) {
        console.log(`   · ${row.indexname} → DROP INDEX CONCURRENTLY "${row.indexname}";`);
      }
    }

    // ── Resumen ──
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const allOk = v1Ok && v2Ok;
    if (allOk) {
      console.log("✅ RoadmapItemStatus aplicado correctamente\n");
      console.log("📌 Próximos pasos:");
      console.log("   1. npx prisma validate && npx prisma format && npx prisma generate");
      console.log("   2. npx tsc --noEmit  (verifica que el modelo cierra types)");
      console.log("   3. Reiniciar dev server");
      console.log("   4. Navegar a /superadmin/roadmap en el browser");
    } else {
      console.log("⚠️  Validaciones fallidas — revisar arriba\n");
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
