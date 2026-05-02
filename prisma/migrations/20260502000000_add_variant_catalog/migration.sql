-- Variant Catalog (Superadmin global) — expand-only
-- Crea 2 tablas nuevas SIN tocar tablas existentes. Compatible hacia atrás.

-- CreateTable
CREATE TABLE "VariantCatalogTemplate" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantCatalogTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantCatalogOption" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "priceDelta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantCatalogOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariantCatalogTemplate_category_idx" ON "VariantCatalogTemplate"("category");

-- CreateIndex
CREATE INDEX "VariantCatalogTemplate_isPublished_idx" ON "VariantCatalogTemplate"("isPublished");

-- CreateIndex
CREATE INDEX "VariantCatalogOption_templateId_idx" ON "VariantCatalogOption"("templateId");

-- AddForeignKey
ALTER TABLE "VariantCatalogOption" ADD CONSTRAINT "VariantCatalogOption_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VariantCatalogTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
