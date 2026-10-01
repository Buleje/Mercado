/**
 * ADR-379 — La devolución al proveedor mueve stock y tiene valor.
 *
 * Agrega:
 *   SupplierReturnItem.productId       (Int?)      — qué producto es
 *   SupplierReturnItem.precioUnitario  (Decimal)   — costo al devolver
 *   SupplierReturn.stockAplicadoAt     (DateTime?) — idempotencia del descuento
 *
 * Corre por el POOLER con SQL idempotente: `prisma migrate` no funciona contra
 * pgBouncer en este proyecto (regla de .claude/rules/db-classes.md). Volver a
 * ejecutarlo no rompe nada.
 *
 *   node -r dotenv/config scripts/migrations/adr-379-devolucion-proveedor-stock.mjs dotenv_config_path=.env.local
 *
 * Después: `npx prisma generate` y REINICIAR el dev server.
 */
import pg from "pg";

const SENTENCIAS = [
  `ALTER TABLE "SupplierReturnItem" ADD COLUMN IF NOT EXISTS "productId" INTEGER`,
  `ALTER TABLE "SupplierReturnItem" ADD COLUMN IF NOT EXISTS "precioUnitario" DECIMAL(12,2)`,
  `ALTER TABLE "SupplierReturn"     ADD COLUMN IF NOT EXISTS "stockAplicadoAt" TIMESTAMP(3)`,
  // Buscar por producto (¿qué se le devolvió a este proveedor?) sin scan.
  `CREATE INDEX IF NOT EXISTS "SupplierReturnItem_productId_idx" ON "SupplierReturnItem"("productId")`,
];

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

try {
  for (const sql of SENTENCIAS) {
    await cliente.query(sql);
    console.log("OK  ", sql.slice(0, 78));
  }

  const { rows } = await cliente.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE (table_name = 'SupplierReturnItem' AND column_name IN ('productId','precioUnitario'))
       OR (table_name = 'SupplierReturn'     AND column_name = 'stockAplicadoAt')
    ORDER BY column_name`);
  console.log("\nColumnas en la DB:", JSON.stringify(rows));
  if (rows.length !== 3) {
    console.error("¡Faltan columnas! Esperaba 3, hay", rows.length);
    process.exitCode = 1;
  }
} finally {
  await cliente.end();
}
