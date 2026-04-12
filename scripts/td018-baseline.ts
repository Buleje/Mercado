/**
 * scripts/td018-baseline.ts
 *
 * TD-018 Sprint 1 — Fase 1: Baseline de datos monetarios
 *
 * READ-ONLY. Consulta los valores actuales de los campos MONETARIO
 * (Float hoy, Decimal después de la migración) para tener un checkpoint
 * anti-drift: después de ejecutar los ALTER COLUMN TYPE, se re-corre
 * este script y los valores deben coincidir centavo a centavo.
 *
 * Guarda el resultado en `docs/td018-baseline-<timestamp>.json` para
 * comparación automática post-migración.
 *
 * Conexión: usa el pooler Supabase en modo SESSION (puerto 5432),
 * porque el endpoint directo db.<project>.supabase.co fue discontinuado
 * por Supabase en 2026-Q1 (ENODATA). Ver ADR-017 para contexto.
 *
 * Run: npx tsx scripts/td018-baseline.ts
 *
 * Referencias:
 *   - docs/migration-float-to-decimal-plan.md (plan original TD-018)
 *   - docs/td018-baseline-queries.sql (generado por database-engineer agent)
 *   - docs/adr/017-ola1-migrations-indices-strategy.md (patrón conexión)
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

type BaselineQuery = {
  table: string;
  field: string;
  sql: string;
};

// Queries baseline — ordenadas por tabla. Se agregan más a medida que
// el database-engineer agent refine el inventario de 87 campos.
// Este set inicial cubre las tablas con mayor volumen conocido.
const BASELINE_QUERIES: BaselineQuery[] = [
  {
    table: "Product",
    field: "price",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM(price), 0)::text AS sum, COALESCE(AVG(price), 0)::text AS avg, COALESCE(MIN(price), 0)::text AS min, COALESCE(MAX(price), 0)::text AS max FROM "Product" WHERE price > 0`,
  },
  {
    table: "Product",
    field: "costPrice",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM("costPrice"), 0)::text AS sum, COALESCE(AVG("costPrice"), 0)::text AS avg FROM "Product" WHERE "costPrice" > 0`,
  },
  {
    table: "Order",
    field: "total",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM(total), 0)::text AS sum, COALESCE(AVG(total), 0)::text AS avg, COALESCE(MIN(total), 0)::text AS min, COALESCE(MAX(total), 0)::text AS max FROM "Order" WHERE total > 0`,
  },
  {
    table: "Order",
    field: "discountAmount",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM("discountAmount"), 0)::text AS sum FROM "Order" WHERE "discountAmount" IS NOT NULL`,
  },
  {
    table: "SaleItem",
    field: "total",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM(total), 0)::text AS sum, COALESCE(AVG(total), 0)::text AS avg FROM "SaleItem" WHERE total > 0`,
  },
  {
    table: "SaleItem",
    field: "amountPaid",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM("amountPaid"), 0)::text AS sum FROM "SaleItem" WHERE "amountPaid" > 0`,
  },
  {
    table: "Customer",
    field: "totalSpent",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM("totalSpent"), 0)::text AS sum, COALESCE(AVG("totalSpent"), 0)::text AS avg FROM "Customer" WHERE "totalSpent" > 0`,
  },
  {
    table: "Customer",
    field: "creditBalance",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM("creditBalance"), 0)::text AS sum FROM "Customer" WHERE "creditBalance" > 0`,
  },
  {
    table: "Invoice",
    field: "subtotal",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM(subtotal), 0)::text AS sum, COALESCE(SUM(igv), 0)::text AS sum_igv, COALESCE(SUM(total), 0)::text AS sum_total FROM "Invoice"`,
  },
  {
    table: "CashierSession",
    field: "openingAmount",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM("openingAmount"), 0)::text AS sum_opening, COALESCE(SUM("closingAmount"), 0)::text AS sum_closing, COALESCE(SUM(difference), 0)::text AS sum_diff FROM "CashierSession"`,
  },
  {
    table: "Payable",
    field: "amount",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM(amount), 0)::text AS sum, COALESCE(SUM("paidAmount"), 0)::text AS sum_paid FROM "Payable"`,
  },
  {
    table: "PurchaseOrder",
    field: "total",
    sql: `SELECT COUNT(*) AS rows, COALESCE(SUM(total), 0)::text AS sum, COALESCE(AVG(total), 0)::text AS avg FROM "PurchaseOrder" WHERE total > 0`,
  },
];

async function main() {
  console.log("📊 TD-018 Sprint 1 — Baseline de datos monetarios (READ-ONLY)\n");
  console.log("   Plan:   docs/migration-float-to-decimal-plan.md");
  console.log("   Branch: feature/td018-float-to-decimal\n");

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

  let Client;
  try {
    Client = (await import("pg")).Client;
  } catch {
    console.log("❌ Paquete 'pg' no instalado");
    process.exit(1);
  }

  // Usar puerto 5432 (session mode) para consistencia con ADR-017
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

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const results: Record<string, Record<string, unknown>> = {};

  for (const q of BASELINE_QUERIES) {
    const key = `${q.table}.${q.field}`;
    console.log(`📦 ${key}`);
    try {
      const res = await client.query(q.sql);
      results[key] = res.rows[0] || {};
      console.log(`   ${JSON.stringify(res.rows[0] || {})}\n`);
    } catch (err) {
      const msg = (err as Error).message;
      console.log(`   ⚠️  Falló: ${msg}\n`);
      results[key] = { error: msg };
    }
  }

  // Guardar el baseline en docs/
  const outPath = path.resolve(process.cwd(), "docs", `td018-baseline-${timestamp}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        database: parsed.pathname.replace(/^\//, "") || "postgres",
        branch: "feature/td018-float-to-decimal",
        queries_run: BASELINE_QUERIES.length,
        results,
      },
      null,
      2,
    ),
  );

  console.log(`✅ Baseline guardado en: ${outPath}`);
  console.log("\n📌 Próximo paso:");
  console.log("   Después de aplicar los ALTER COLUMN TYPE, re-correr este script");
  console.log("   y comparar los valores campo por campo. Deben coincidir centavo a centavo.");

  await client.end();
}

main().catch((err) => {
  console.error("\n❌ Error fatal:", err);
  process.exit(1);
});
