-- AddColumn: createdBy to InventoryMovement for audit trail
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
