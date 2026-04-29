-- Migration: add SuperadminUser table
-- 2026-04-28: tabla declarada en schema.prisma pero nunca aplicada en DB.
-- Causaba 401 perpetuo en /api/superadmin/auth.

CREATE TABLE IF NOT EXISTS "SuperadminUser" (
    "id"            TEXT PRIMARY KEY,
    "username"      TEXT UNIQUE NOT NULL,
    "passwordHash"  TEXT NOT NULL,
    "totpSecret"    TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "lastLoginAt"   TIMESTAMP(3),
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "name"          TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SuperadminUser_username_idx" ON "SuperadminUser"("username");
