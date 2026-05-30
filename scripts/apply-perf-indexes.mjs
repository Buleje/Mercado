/**
 * apply-perf-indexes.mjs — aplica los índices compuestos de perf 2026-05-29.
 * Usa DIRECT_URL (no-pooled, requerido por CREATE INDEX CONCURRENTLY).
 * Correr: `node -r dotenv/config scripts/apply-perf-indexes.mjs`
 * Idempotente (IF NOT EXISTS). CONCURRENTLY = sin lock de escritura.
 */
import pg from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("✗ Falta DIRECT_URL/DATABASE_URL en el entorno.");
  process.exit(1);
}

const statements = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "PriceHistory_tenantId_productId_changedAt_idx" ON "PriceHistory" ("tenantId", "productId", "changedAt" DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Batch_tenantId_expiryDate_idx" ON "Batch" ("tenantId", "expiryDate")`,
];

const client = new pg.Client({
  connectionString: url,
  ssl: /sslmode=(disable|require|verify)/.test(url) ? undefined : { rejectUnauthorized: false },
});

try {
  await client.connect();
  for (const sql of statements) {
    const name = sql.match(/"([^"]+_idx)"/)[1];
    process.stdout.write(`→ ${name} ... `);
    const t0 = Date.now();
    try {
      await client.query(sql);
      console.log(`OK (${Date.now() - t0}ms)`);
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
    }
  }
  // Verificación: lista los índices recién pedidos
  const { rows } = await client.query(
    `SELECT indexname FROM pg_indexes WHERE indexname IN ('PriceHistory_tenantId_productId_changedAt_idx','Batch_tenantId_expiryDate_idx') ORDER BY indexname`,
  );
  console.log("Índices presentes:", rows.map((r) => r.indexname).join(", ") || "(ninguno)");
} catch (e) {
  console.error("✗ Conexión falló:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
