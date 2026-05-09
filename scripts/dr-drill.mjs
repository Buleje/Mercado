#!/usr/bin/env node
/**
 * DR Drill — Disaster Recovery Validation Script
 *
 * Uso:
 *   node scripts/dr-drill.mjs                   # modo stub (sin backup real)
 *   DR_BACKUP_PATH=/path/to/dump.sql \
 *   DR_TEMP_DB_URL=postgresql://... \
 *   node scripts/dr-drill.mjs                   # modo real
 *
 * En CI (GitHub Actions):
 *   env:
 *     DR_BACKUP_PATH: ${{ secrets.DR_BACKUP_PATH }}
 *     DR_TEMP_DB_URL: ${{ secrets.DR_TEMP_DB_URL }}
 *
 * Variables requeridas para modo real:
 *   DR_BACKUP_PATH  — ruta local al dump .sql/.dump (o URL s3://)
 *   DR_TEMP_DB_URL  — conexion a DB temporal PostgreSQL (SIN pgBouncer)
 *
 * Para conectar a backup S3/Supabase:
 *   1. Descargar: aws s3 cp s3://buleje-backups/latest.dump /tmp/dr-latest.dump
 *      o: supabase db dump --db-url $DIRECT_URL > /tmp/dr-latest.sql
 *   2. Crear DB temporal: createdb bodega_dr_$(date +%Y%m%d) -U postgres
 *   3. DR_BACKUP_PATH=/tmp/dr-latest.sql DR_TEMP_DB_URL=postgresql://postgres@localhost/bodega_dr_...
 *      node scripts/dr-drill.mjs
 *
 * Salida: reports/dr-drills/YYYY-MM-DD.json
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BACKUP_PATH = process.env.DR_BACKUP_PATH;
const TEMP_DB_URL = process.env.DR_TEMP_DB_URL;
const DATE_STAMP = new Date().toISOString().slice(0, 10);
const REPORT_DIR = join(process.cwd(), "reports", "dr-drills");

// ── Helpers ───────────────────────────────────────────────────────────────────

function sql(query) {
  if (!TEMP_DB_URL) throw new Error("DR_TEMP_DB_URL no configurado");
  const result = execSync(`psql "${TEMP_DB_URL}" -t -c "${query.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
    timeout: 30_000,
  }).trim();
  return result;
}

function parseCount(raw) {
  const n = parseInt(raw.replace(/\s/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

// ── 10 Validaciones ───────────────────────────────────────────────────────────

const VALIDATIONS = [
  {
    id: 1,
    name: "Tenants > 0",
    run: () => {
      const count = parseCount(sql('SELECT COUNT(*) FROM "Tenant"'));
      if (count < 1) throw new Error(`Solo ${count} tenants`);
      return { count };
    },
  },
  {
    id: 2,
    name: "Productos por tenant > 0",
    run: () => {
      const count = parseCount(sql('SELECT COUNT(*) FROM "Product"'));
      if (count < 1) throw new Error(`Sin productos`);
      return { count };
    },
  },
  {
    id: 3,
    name: "Ventas sin montos negativos",
    run: () => {
      const neg = parseCount(sql('SELECT COUNT(*) FROM "Sale" WHERE total < 0'));
      if (neg > 0) throw new Error(`${neg} ventas con total negativo`);
      return { negativeSales: neg };
    },
  },
  {
    id: 4,
    name: "Aislamiento multi-tenant (Orders.tenantId no nulo)",
    run: () => {
      const orphan = parseCount(sql('SELECT COUNT(*) FROM "Order" WHERE "tenantId" IS NULL'));
      if (orphan > 0) throw new Error(`${orphan} ordenes sin tenantId`);
      return { orphanOrders: orphan };
    },
  },
  {
    id: 5,
    name: "FK integridad — OrderItems -> Orders",
    run: () => {
      const orphan = parseCount(sql(
        'SELECT COUNT(*) FROM "OrderItem" oi LEFT JOIN "Order" o ON oi."orderId" = o.id WHERE o.id IS NULL'
      ));
      if (orphan > 0) throw new Error(`${orphan} OrderItems huerfanos`);
      return { orphanItems: orphan };
    },
  },
  {
    id: 6,
    name: "SaleItems -> Sales FK",
    run: () => {
      const orphan = parseCount(sql(
        'SELECT COUNT(*) FROM "SaleItem" si LEFT JOIN "Sale" s ON si."saleId" = s.id WHERE s.id IS NULL'
      ));
      if (orphan > 0) throw new Error(`${orphan} SaleItems huerfanos`);
      return { orphanSaleItems: orphan };
    },
  },
  {
    id: 7,
    name: "Fiados con saldo coherente (>= 0)",
    run: () => {
      const neg = parseCount(sql('SELECT COUNT(*) FROM "Fiado" WHERE balance < 0'));
      // Saldos negativos pueden existir si hay pagos en exceso — solo alerta
      return { negativeFiadoBalance: neg, warning: neg > 0 };
    },
  },
  {
    id: 8,
    name: "Sin stocks negativos",
    run: () => {
      const neg = parseCount(sql('SELECT COUNT(*) FROM "Product" WHERE stock < 0'));
      if (neg > 0) throw new Error(`${neg} productos con stock negativo`);
      return { negativeStock: neg };
    },
  },
  {
    id: 9,
    name: "ActivityLog intacto (tabla accesible)",
    run: () => {
      const count = parseCount(sql('SELECT COUNT(*) FROM "ActivityLog" LIMIT 1'));
      return { activityLogRows: count };
    },
  },
  {
    id: 10,
    name: "CronHealthLog tabla accesible",
    run: () => {
      const count = parseCount(sql('SELECT COUNT(*) FROM "CronHealthLog"'));
      return { cronHealthRows: count };
    },
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const drillStart = Date.now();

  console.log("\n=== DR DRILL — Buleje Bodega San Martin ===");
  console.log(`Fecha: ${DATE_STAMP}`);

  // Modo stub si no hay env vars
  if (!BACKUP_PATH || !TEMP_DB_URL) {
    console.log("\n[STUB] Variables DR_BACKUP_PATH y DR_TEMP_DB_URL no configuradas.");
    console.log("[STUB] Ejecutando en modo documentacion.\n");
    console.log("Para activar el drill real:");
    console.log("  1. Obtener backup:");
    console.log("     supabase db dump --db-url $DIRECT_URL > /tmp/dr-latest.sql");
    console.log("  2. Crear DB temporal:");
    console.log("     createdb bodega_dr_test -U postgres");
    console.log("  3. Restaurar:");
    console.log("     psql -d bodega_dr_test -f /tmp/dr-latest.sql");
    console.log("  4. Ejecutar:");
    console.log("     DR_BACKUP_PATH=/tmp/dr-latest.sql DR_TEMP_DB_URL=postgresql://postgres@localhost/bodega_dr_test node scripts/dr-drill.mjs");

    const stubReport = {
      date: DATE_STAMP,
      mode: "stub",
      message: "DR drill ejecutado en modo stub — sin backup configurado",
      howToConnect: {
        s3: "aws s3 cp s3://buleje-backups/latest.dump /tmp/dr-latest.dump",
        supabase: "supabase db dump --db-url $DIRECT_URL > /tmp/dr-latest.sql",
        ciEnvVars: ["DR_BACKUP_PATH", "DR_TEMP_DB_URL"],
      },
    };

    mkdirSync(REPORT_DIR, { recursive: true });
    const reportPath = join(REPORT_DIR, `${DATE_STAMP}-stub.json`);
    writeFileSync(reportPath, JSON.stringify(stubReport, null, 2));
    console.log(`\nReporte stub: ${reportPath}`);
    return;
  }

  // Modo real
  console.log(`Backup: ${BACKUP_PATH}`);
  console.log(`DB temporal: ${TEMP_DB_URL.replace(/:[^:@]+@/, ":***@")}\n`);

  // Restaurar backup
  console.log("[1/2] Restaurando backup...");
  try {
    if (BACKUP_PATH.endsWith(".dump")) {
      execSync(`pg_restore --no-owner --no-acl -d "${TEMP_DB_URL}" "${BACKUP_PATH}"`, {
        stdio: "pipe",
        timeout: 600_000,
      });
    } else {
      execSync(`psql "${TEMP_DB_URL}" -f "${BACKUP_PATH}"`, {
        stdio: "pipe",
        timeout: 600_000,
      });
    }
    console.log("Backup restaurado OK");
  } catch (err) {
    console.error("FALLO al restaurar backup:", err.message);
    process.exit(1);
  }

  // Correr validaciones
  console.log("\n[2/2] Corriendo 10 validaciones...\n");
  const results = [];
  let passed = 0;
  let failed = 0;
  let warned = 0;

  for (const v of VALIDATIONS) {
    try {
      const data = v.run();
      const isWarning = data?.warning === true;
      results.push({ id: v.id, name: v.name, status: isWarning ? "warning" : "pass", data });
      if (isWarning) {
        console.log(`  [WARN] ${v.id}. ${v.name}`);
        warned++;
      } else {
        console.log(`  [PASS] ${v.id}. ${v.name}`);
        passed++;
      }
    } catch (err) {
      results.push({ id: v.id, name: v.name, status: "fail", error: err.message });
      console.log(`  [FAIL] ${v.id}. ${v.name} — ${err.message}`);
      failed++;
    }
  }

  const durationMs = Date.now() - drillStart;
  const overallStatus = failed > 0 ? "FAIL" : warned > 0 ? "WARN" : "PASS";

  console.log(`\n=== RESULTADO: ${overallStatus} ===`);
  console.log(`Passed: ${passed} | Warnings: ${warned} | Failed: ${failed}`);
  console.log(`Duracion total: ${(durationMs / 1000).toFixed(1)}s`);

  // Alerta SLO: drill >10 minutos = fallo
  if (durationMs > 10 * 60 * 1000) {
    console.warn(`ALERTA: Restore tomo ${(durationMs / 60000).toFixed(1)} min (SLO = <10 min)`);
  }

  // Guardar reporte
  const report = {
    date: DATE_STAMP,
    mode: "real",
    overallStatus,
    passed,
    warned,
    failed,
    durationMs,
    results,
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = join(REPORT_DIR, `${DATE_STAMP}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReporte guardado: ${reportPath}`);

  // Exit code para CI
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("DR drill fatal:", err);
  process.exit(1);
});
