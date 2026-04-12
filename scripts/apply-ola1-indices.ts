/**
 * scripts/apply-ola1-indices.ts
 *
 * Aplica los 4 CREATE INDEX CONCURRENTLY de TD-020 (Sprint 2 Ola 1).
 *
 * Prerrequisito: haber corrido el Paso 0 (scripts/verify-pg-indexes-ola1.ts)
 * y haber confirmado que esos 4 índices NO existen aún en producción.
 *
 * Comportamiento:
 *   1. Carga .env.local
 *   2. Resuelve DNS de db.<project>.supabase.co con resolver custom
 *      (1.1.1.1 + 8.8.8.8) para evitar el bug de resolver local de Windows
 *   3. Conecta vía DIRECT_URL (puerto 5432, NO el pooler 6543)
 *   4. Ejecuta los 4 CREATE INDEX CONCURRENTLY uno por uno (simple query
 *      protocol, sin transacciones — CONCURRENTLY es incompatible con BEGIN)
 *   5. Después de cada uno, verifica con SELECT pg_indexes que quedó creado
 *   6. Si alguno falla, reporta y detiene (no sigue con los demás)
 *
 * Run: npx tsx scripts/apply-ola1-indices.ts
 *
 * Es seguro re-ejecutar: los CREATE usan IF NOT EXISTS.
 *
 * Referencias:
 *   - docs/adr/017-ola1-migrations-indices-strategy.md
 *   - docs/migration-plan-indices-ola1-2026-04-09.md
 *   - scripts/ola1-indices.sql (versión copy-paste para Supabase Dashboard)
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

type IndexSpec = {
  id: string;
  tdCode: string;
  description: string;
  indexName: string;
  createSql: string;
};

const INDEXES: IndexSpec[] = [
  {
    id: "1/4",
    tdCode: "TD-020.1",
    description: "PurchaseOrder — órdenes de compra pendientes del tenant X",
    indexName: "PurchaseOrder_tenantId_status_idx",
    createSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "PurchaseOrder_tenantId_status_idx" ON "PurchaseOrder" ("tenantId", "status")`,
  },
  {
    id: "2/4",
    tdCode: "TD-020.2",
    description: "Payable — cuentas por pagar pendientes del tenant X",
    indexName: "Payable_tenantId_status_idx",
    createSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payable_tenantId_status_idx" ON "Payable" ("tenantId", "status")`,
  },
  {
    id: "3/4",
    tdCode: "TD-020.3",
    description: "NotificationLog — últimas N notificaciones del tenant X",
    indexName: "NotificationLog_tenantId_createdAt_idx",
    createSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "NotificationLog_tenantId_createdAt_idx" ON "NotificationLog" ("tenantId", "createdAt" DESC)`,
  },
  {
    id: "4/4",
    tdCode: "TD-020.4",
    description: "SupportTicket — tickets abiertos del tenant X",
    indexName: "SupportTicket_tenantId_status_idx",
    createSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SupportTicket_tenantId_status_idx" ON "SupportTicket" ("tenantId", "status")`,
  },
];

async function main() {
  console.log("🚀 Sprint 2 — Aplicando 4 compound indexes TD-020\n");
  console.log("   ADR:  docs/adr/017-ola1-migrations-indices-strategy.md");
  console.log("   Plan: docs/migration-plan-indices-ola1-2026-04-09.md\n");

  // ──────────────────────────────────────────────────────────────────────
  // Estrategia de conexión (2026-04-09):
  //
  // Supabase discontinuó el endpoint directo `db.<project>.supabase.co`
  // (ENODATA en DNS). La solución correcta es usar el pooler unificado
  // en modo SESSION (puerto 5432, NO 6543):
  //
  //   - Puerto 6543 = transaction pooling → agresivo, NO soporta CONCURRENTLY
  //   - Puerto 5432 = session pooling    → mantiene conexión, SÍ soporta
  //                                        CONCURRENTLY, usable para DDL
  //
  // Derivamos la URL del pooler session a partir del DATABASE_URL existente:
  //   postgresql://USER:PASS@aws-1-*.pooler.supabase.com:6543/postgres?pgbouncer=true
  //     ↓
  //   postgresql://USER:PASS@aws-1-*.pooler.supabase.com:5432/postgres
  // ──────────────────────────────────────────────────────────────────────

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

  // Forzar puerto 5432 (session mode) y limpiar ?pgbouncer=true
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

  console.log(`🔌 Conectando...`);

  const client = new Client({
    host: parsed.hostname,
    port: sessionPort,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("   ✅ Conexión establecida\n");
  } catch (err) {
    console.log(`   ❌ Conexión falló: ${(err as Error).message}`);
    console.log("   Sugerencia: usar Ruta A (Supabase Dashboard SQL Editor)");
    console.log("   Archivo listo para pegar: scripts/ola1-indices.sql");
    process.exit(1);
  }

  const results: Array<{ spec: IndexSpec; status: "created" | "exists" | "failed"; error?: string }> = [];

  for (const spec of INDEXES) {
    console.log(`📦 ${spec.id} · ${spec.tdCode} · ${spec.indexName}`);
    console.log(`   ${spec.description}`);

    // 1. Verificar si ya existe (por si re-run)
    const existsRes = await client.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = 'public'`,
      [spec.indexName],
    );

    if (existsRes.rowCount && existsRes.rowCount > 0) {
      console.log(`   ⏭️  Ya existía, saltando\n`);
      results.push({ spec, status: "exists" });
      continue;
    }

    // 2. Ejecutar el CREATE INDEX CONCURRENTLY
    const t0 = Date.now();
    try {
      await client.query(spec.createSql);
      const dt = Date.now() - t0;
      console.log(`   ✅ Creado en ${dt}ms`);
    } catch (err) {
      const msg = (err as Error).message;
      console.log(`   ❌ Falló: ${msg}`);
      results.push({ spec, status: "failed", error: msg });
      // Si falla CONCURRENTLY puede quedar INVALID — dejar constancia y parar
      console.log("\n🛑 Deteniendo ejecución. Verificar manualmente con:");
      console.log(
        `   SELECT * FROM pg_indexes WHERE indexname = '${spec.indexName}';`,
      );
      console.log(
        `   Si está INVALID: DROP INDEX CONCURRENTLY "${spec.indexName}";`,
      );
      await client.end();
      process.exit(1);
    }

    // 3. Confirmar con SELECT
    const confirmRes = await client.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = $1 AND schemaname = 'public'`,
      [spec.indexName],
    );
    if (confirmRes.rowCount && confirmRes.rowCount > 0) {
      console.log(`   🔍 Verificado: ${confirmRes.rows[0].indexdef}\n`);
      results.push({ spec, status: "created" });
    } else {
      console.log(`   ⚠️  CREATE no devolvió error pero pg_indexes no lo ve\n`);
      results.push({ spec, status: "failed", error: "post-verify-missing" });
    }
  }

  // Verificación final consolidada
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Resumen final\n");
  const created = results.filter((r) => r.status === "created").length;
  const existed = results.filter((r) => r.status === "exists").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(`   ✅ Creados nuevos: ${created}`);
  console.log(`   ⏭️  Ya existían:    ${existed}`);
  console.log(`   ❌ Fallaron:       ${failed}\n`);

  // Chequear que ninguno quedó INVALID
  const invalidRes = await client.query(
    `SELECT c.relname AS indexname
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indexrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE i.indisvalid = false
       AND n.nspname = 'public'
       AND c.relname LIKE '%tenantId%'`,
  );
  if (invalidRes.rowCount && invalidRes.rowCount > 0) {
    console.log("🚨 Índices INVALID detectados (deben limpiarse):");
    for (const row of invalidRes.rows) {
      console.log(`   · ${row.indexname} → DROP INDEX CONCURRENTLY "${row.indexname}";`);
    }
  } else {
    console.log("✅ Ningún índice en estado INVALID\n");
  }

  console.log("📌 Próximo paso:");
  console.log("   Agregar los 4 @@index al schema.prisma (sin migrate dev)");
  console.log("   Luego: npx prisma generate → commit con docs + ADR firmado");

  await client.end();
}

main().catch((err) => {
  console.error("\n❌ Error fatal:", err);
  process.exit(1);
});
