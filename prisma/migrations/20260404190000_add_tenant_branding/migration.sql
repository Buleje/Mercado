-- AlterTable: Add branding fields to Tenant for white-label SaaS
ALTER TABLE "Tenant" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "faviconUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "primaryColor" TEXT NOT NULL DEFAULT '#00B4A6';
ALTER TABLE "Tenant" ADD COLUMN "secondaryColor" TEXT NOT NULL DEFAULT '#f4a261';
