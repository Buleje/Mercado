/**
 * scripts/apply-td018-alters.ts
 *
 * TD-018 Sprint 1 — Fase 2: Aplicar los 76 ALTER COLUMN TYPE contra producción.
 *
 * Lee docs/td018-alter-statements.sql, parsea los statements, y los ejecuta
 * uno por uno vía pooler session mode (puerto 5432, patrón ADR-017).
 *
 * Antes de cada ALTER verifica si la columna existe. Si no existe (schema
 * drift detectado en Fase 1 — Invoice, CashierSession, SaleItem.total,
 * SaleItem.amountPaid), loggea "skip" y continúa.
 *
 * Después de cada ALTER verifica con information_schema que el tipo quedó
 * en numeric(12,2).
 *
 * Si algo falla a mitad, detiene la ejecución y reporta qué se aplicó y
 * qué no. Las tablas ya alteradas quedan como DECIMAL(12,2).
 *
 * Run: npx tsx scripts/apply-td018-alters.ts
 *
 * Referencias:
 *   - docs/td018-consolidated-plan-2026-04-09.md
 *   - docs/adr/018-td018-float-to-decimal-strategy.md
 *   - docs/td018-alter-statements.sql (fuente de los 76 ALTER)
 *   - scripts/td018-baseline.ts (correr ANTES y DESPUÉS para verificar integridad)
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

type AlterStatement = {
  table: string;
  column: string;
  raw: string;
};

function parseAlterStatements(sql: string): AlterStatement[] {
  // Remover comentarios -- hasta fin de línea
  const cleaned = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  // Split por ; (cada ALTER termina en ;)
  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toUpperCase().startsWith("ALTER TABLE"));

  // Parse table y column de cada statement
  const results: AlterStatement[] = [];
  for (const raw of statements) {
    // Match: ALTER TABLE "Table" ALTER COLUMN "col" TYPE ...  (o sin comillas en col)
    const match = raw.match(/ALTER TABLE\s+"([^"]+)"\s+ALTER COLUMN\s+"?([^"\s]+)"?\s+TYPE/i);
    if (match) {
      results.push({ table: match[1], column: match[2], raw });
    } else {
      console.log(`   ⚠️  No se pudo parsear: ${raw.substring(0, 80)}...`);
    }
  }

  return results;
}

async function main() {
  console.log("🚀 TD-018 Fase 2 — Aplicar 76 ALTER COLUMN TYPE contra producción\n");
  console.log("   Plan:  docs/td018-consolidated-plan-2026-04-09.md");
  console.log("   ADR:   docs/adr/018-td018-float-to-decimal-strategy.md");
  console.log("   SQL:   docs/td018-alter-statements.sql\n");

  const poolerUrl = process.env.DATABASE_URL;
  if (!poolerUrl) {
    console.log("❌ DATABASE_URL no está en .env.local");
    process.exit(1);
  }

  const parsed = new URL(poolerUrl);
  if (!parsed.hostname.includes("pooler.supabase.com")) {
    console.log(`❌ DATABASE_URL no apunta al pooler: ${parsed.hostname}`);
    process.exit(1);
  }

  // Leer y parsear el SQL
  const sqlPath = path.resolve(process.cwd(), "docs", "td018-alter-statements.sql");
  if (!fs.existsSync(sqlPath)) {
    console.log(`❌ No existe el archivo: ${sqlPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(sqlPath, "utf8");
  const statements = parseAlterStatements(sqlContent);

  console.log(`📄 Parseadas ${statements.length} ALTER statements del SQL\n`);
  if (statements.length === 0) {
    console.log("❌ No se encontraron ALTER statements válidos");
    process.exit(1);
  }

  let Client;
  try {
    Client = (await import("pg")).Client;
  } catch {
    console.log("❌ Paquete 'pg' no instalado");
    process.exit(1);
  }

  const sessionPort = 5432;
  console.log(`🔌 Conectando a ${parsed.hostname}:${sessionPort} (session mode)...`);

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
    process.exit(1);
  }

  // Resultados por statement
  const results: Array<{
    stmt: AlterStatement;
    status: "applied" | "skipped-drift" | "already-decimal" | "failed";
    durationMs?: number;
    error?: string;
    beforeType?: string;
    afterType?: string;
  }> = [];

  const t0Total = Date.now();

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const label = `${stmt.table}.${stmt.column}`;
    process.stdout.write(`[${i + 1}/${statements.length}] ${label.padEnd(50)} `);

    // 1. Verificar que la tabla y columna existen + obtener tipo actual
    const checkRes = await client.query(
      `SELECT data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2`,
      [stmt.table, stmt.column],
    );

    if (checkRes.rowCount === 0) {
      console.log("⚠️  skip (columna/tabla no existe — schema drift)");
      results.push({ stmt, status: "skipped-drift" });
      continue;
    }

    const beforeType = checkRes.rows[0].udt_name;

    if (beforeType === "numeric") {
      console.log("✅ ya es Decimal (skip)");
      results.push({ stmt, status: "already-decimal", beforeType });
      continue;
    }

    if (beforeType !== "float8" && beforeType !== "float4") {
      console.log(`⚠️  tipo inesperado ${beforeType} (skip)`);
      results.push({ stmt, status: "skipped-drift", beforeType });
      continue;
    }

    // 2. Ejecutar el ALTER
    const tStart = Date.now();
    try {
      await client.query(stmt.raw);
    } catch (err) {
      const msg = (err as Error).message;
      console.log(`❌ FAILED: ${msg}`);
      results.push({ stmt, status: "failed", error: msg, beforeType });
      console.log("\n🛑 Deteniendo ejecución. Reportando resultados parciales...\n");
      break;
    }

    const durationMs = Date.now() - tStart;

    // 3. Verificar que el tipo quedó en numeric
    const verifyRes = await client.query(
      `SELECT udt_name, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2`,
      [stmt.table, stmt.column],
    );
    const afterType = verifyRes.rows[0]?.udt_name;

    if (afterType === "numeric") {
      console.log(`✅ ${beforeType} → numeric(${verifyRes.rows[0].numeric_precision},${verifyRes.rows[0].numeric_scale}) en ${durationMs}ms`);
      results.push({ stmt, status: "applied", durationMs, beforeType, afterType });
    } else {
      console.log(`⚠️  post-alter tipo inesperado: ${afterType}`);
      results.push({ stmt, status: "failed", beforeType, afterType, error: `post-verify shows ${afterType}` });
    }
  }

  const totalDuration = Date.now() - t0Total;

  // Reporte final
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Resumen de ejecución\n");

  const applied = results.filter((r) => r.status === "applied").length;
  const skippedDrift = results.filter((r) => r.status === "skipped-drift").length;
  const alreadyDecimal = results.filter((r) => r.status === "already-decimal").length;
  const failed = results.filter((r) => r.status === "failed").length;

  console.log(`   ✅ Aplicados:           ${applied}`);
  console.log(`   ⏭️  Ya eran Decimal:     ${alreadyDecimal}`);
  console.log(`   ⚠️  Saltados (drift):    ${skippedDrift}`);
  console.log(`   ❌ Fallaron:            ${failed}`);
  console.log(`   ⏱️  Duración total:      ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)\n`);

  if (skippedDrift > 0) {
    console.log("   Columnas saltadas por schema drift:");
    for (const r of results.filter((x) => x.status === "skipped-drift")) {
      console.log(`     · ${r.stmt.table}.${r.stmt.column}`);
    }
    console.log("");
  }

  if (failed > 0) {
    console.log("🚨 FALLOS:");
    for (const r of results.filter((x) => x.status === "failed")) {
      console.log(`   · ${r.stmt.table}.${r.stmt.column}: ${r.error}`);
    }
    console.log("");
  }

  // Guardar reporte en JSON
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.resolve(process.cwd(), "docs", `td018-apply-report-${timestamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        total_statements: statements.length,
        applied,
        already_decimal: alreadyDecimal,
        skipped_drift: skippedDrift,
        failed,
        total_duration_ms: totalDuration,
        results: results.map((r) => ({
          table: r.stmt.table,
          column: r.stmt.column,
          status: r.status,
          duration_ms: r.durationMs,
          before_type: r.beforeType,
          after_type: r.afterType,
          error: r.error,
        })),
      },
      null,
      2,
    ),
  );

  console.log(`📄 Reporte guardado en: ${reportPath}\n`);
  console.log("📌 Próximo paso:");
  console.log("   1. Re-correr scripts/td018-baseline.ts y comparar con el baseline pre");
  console.log("   2. Actualizar prisma/schema.prisma con @db.Decimal(12,2)");
  console.log("   3. npx prisma generate && npx tsc --noEmit (puede romper — fase TS)");

  await client.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n❌ Error fatal:", err);
  process.exit(1);
});
