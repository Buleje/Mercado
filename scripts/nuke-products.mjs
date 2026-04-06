/**
 * ONE-TIME script to hard-delete ALL products and related records.
 * Run: node scripts/nuke-products.mjs
 * Safe to delete this file after running.
 */
import 'dotenv/config';
import { PrismaClient } from '../lib/generated/prisma/client.ts';

const prisma = new PrismaClient();

async function main() {
  console.log("🔥 Eliminando TODOS los productos y datos relacionados...\n");

  // Delete child records first (FK constraints)
  const tables = [
    ["ForecastLog",        `DELETE FROM "ForecastLog" WHERE "productId" IS NOT NULL`],
    ["RecetaIngrediente",  `DELETE FROM "RecetaIngrediente" WHERE "productoId" IS NOT NULL`],
    ["Receta (producto)",  `UPDATE "Receta" SET "productoId" = NULL WHERE "productoId" IS NOT NULL`],
    ["StoreProduct",       `DELETE FROM "StoreProduct" WHERE "productId" IS NOT NULL`],
    ["Batch",              `DELETE FROM "Batch"`],
    ["InventoryMovement",  `DELETE FROM "InventoryMovement"`],
    ["PriceHistory",       `DELETE FROM "PriceHistory"`],
    ["Transfer",           `DELETE FROM "Transfer"`],
    ["Location",           `DELETE FROM "Location" WHERE "productId" IS NOT NULL`],
    ["SaleItem",           `DELETE FROM "SaleItem"`],
    ["PurchaseItem",       `DELETE FROM "PurchaseItem"`],
    ["OrderItem",          `DELETE FROM "OrderItem"`],
    ["Product",            `DELETE FROM "Product"`],
  ];

  for (const [name, sql] of tables) {
    try {
      const result = await prisma.$executeRawUnsafe(sql);
      console.log(`  ✅ ${name}: ${result} filas eliminadas`);
    } catch (e) {
      console.log(`  ⚠️  ${name}: ${e.message}`);
    }
  }

  // Verify
  const remaining = await prisma.product.count();
  console.log(`\n📊 Productos restantes: ${remaining}`);
  
  if (remaining === 0) {
    console.log("✅ ¡LIMPIO! Cero productos en la base de datos.");
  } else {
    console.log("❌ Aún quedan productos. Revisión manual necesaria.");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
