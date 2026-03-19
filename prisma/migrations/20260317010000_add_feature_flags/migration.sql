-- Migration: add featureFlagsJson column to Settings
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "featureFlagsJson" TEXT;
