-- AlterTable: add lat/lng columns to Store
-- These columns existed in schema.prisma (model Store) but no migration
-- ever generated the DDL, so production tables were missing them and
-- prisma.store.findMany() failed with `column (not available) does not
-- exist` whenever the public marketplace listing tried to read them.
--
-- IF NOT EXISTS so the migration is idempotent on environments where
-- the column was already added manually via scripts/add-store-lat-lng.mjs.

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
