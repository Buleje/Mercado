-- Add email verification fields to Tenant
ALTER TABLE "Tenant" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "emailVerifyToken" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "emailVerifyExpires" TIMESTAMP(3);
CREATE UNIQUE INDEX "Tenant_emailVerifyToken_key" ON "Tenant"("emailVerifyToken");
