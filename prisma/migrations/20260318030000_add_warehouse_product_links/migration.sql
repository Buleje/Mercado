-- Migration: add warehouseId FK to InventoryMovement, productId + warehouseId FK to Batch

-- AddColumn: InventoryMovement.warehouseId
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;

-- AddForeignKey for InventoryMovement.warehouseId → Warehouse.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'InventoryMovement_warehouseId_fkey'
    AND table_name = 'InventoryMovement'
  ) THEN
    ALTER TABLE "InventoryMovement"
      ADD CONSTRAINT "InventoryMovement_warehouseId_fkey"
      FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- CreateIndex for InventoryMovement.warehouseId
CREATE INDEX IF NOT EXISTS "InventoryMovement_warehouseId_idx" ON "InventoryMovement"("warehouseId");

-- AddColumn: Batch.productId
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "productId" INTEGER;

-- AddForeignKey for Batch.productId → Product.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Batch_productId_fkey'
    AND table_name = 'Batch'
  ) THEN
    ALTER TABLE "Batch"
      ADD CONSTRAINT "Batch_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- CreateIndex for Batch.productId
CREATE INDEX IF NOT EXISTS "Batch_productId_idx" ON "Batch"("productId");

-- AddColumn: Batch.warehouseId
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;

-- AddForeignKey for Batch.warehouseId → Warehouse.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Batch_warehouseId_fkey'
    AND table_name = 'Batch'
  ) THEN
    ALTER TABLE "Batch"
      ADD CONSTRAINT "Batch_warehouseId_fkey"
      FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- CreateIndex for Batch.warehouseId
CREATE INDEX IF NOT EXISTS "Batch_warehouseId_idx" ON "Batch"("warehouseId");
