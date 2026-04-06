-- Migration: Add vacation mode fields to Store model
-- Generated for Bodega San Martín — Prisma schema update

ALTER TABLE "Store" ADD COLUMN "vacationMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Store" ADD COLUMN "vacationMessage" TEXT;
