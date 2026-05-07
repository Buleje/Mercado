-- Add 'preparando' status between 'confirmado' and 'en_camino'.
-- IMPORTANT: ALTER TYPE ... ADD VALUE must run outside a transaction in Postgres,
-- and Prisma migrate handles that automatically.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'preparando' BEFORE 'en_camino';

-- Add delivery proof fields to DeliveryAssignment.
ALTER TABLE "DeliveryAssignment"
  ADD COLUMN IF NOT EXISTS "routeStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proofPhotoUrl" TEXT;
