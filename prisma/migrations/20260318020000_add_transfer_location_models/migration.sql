-- CreateTable: Transfer
CREATE TABLE "Transfer" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "fromWarehouseId" TEXT NOT NULL,
  "toWarehouseId" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'und',
  "status" TEXT NOT NULL DEFAULT 'pendiente',
  "requestedBy" TEXT NOT NULL,
  "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredDate" TIMESTAMP(3),
  "notes" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT NOT NULL DEFAULT 'main',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Location
CREATE TABLE "Location" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "zone" TEXT NOT NULL,
  "aisle" TEXT NOT NULL DEFAULT '',
  "shelf" TEXT NOT NULL DEFAULT '',
  "bin" TEXT NOT NULL DEFAULT '',
  "warehouseId" TEXT NOT NULL,
  "productId" INTEGER,
  "qty" INTEGER NOT NULL DEFAULT 0,
  "capacity" INTEGER NOT NULL DEFAULT 0,
  "category" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT NOT NULL DEFAULT 'main',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_tenantId_code_key" ON "Transfer"("tenantId", "code");
CREATE INDEX "Transfer_tenantId_idx" ON "Transfer"("tenantId");
CREATE INDEX "Transfer_status_idx" ON "Transfer"("status");
CREATE INDEX "Transfer_fromWarehouseId_idx" ON "Transfer"("fromWarehouseId");
CREATE INDEX "Transfer_toWarehouseId_idx" ON "Transfer"("toWarehouseId");
CREATE INDEX "Transfer_productId_idx" ON "Transfer"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_tenantId_code_key" ON "Location"("tenantId", "code");
CREATE INDEX "Location_tenantId_idx" ON "Location"("tenantId");
CREATE INDEX "Location_warehouseId_idx" ON "Location"("warehouseId");
CREATE INDEX "Location_productId_idx" ON "Location"("productId");

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;