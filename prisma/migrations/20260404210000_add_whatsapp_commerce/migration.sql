-- Migration: add_whatsapp_commerce
-- Adds two models for the WhatsApp Commerce Engine:
--   1. TenantWhatsAppConfig  — per-tenant WhatsApp Business API credentials
--   2. WhatsAppConversation  — stateful bot session per (tenant, phone)

-- ─── TenantWhatsAppConfig ────────────────────────────────────────────────────

CREATE TABLE "TenantWhatsAppConfig" (
    "id"                  TEXT NOT NULL,
    "tenantId"            TEXT NOT NULL,
    "phoneNumberId"       TEXT NOT NULL,
    "whatsappToken"       TEXT NOT NULL,
    "webhookVerifyToken"  TEXT NOT NULL,
    "businessName"        TEXT,
    "yapeNumber"          TEXT,
    "isActive"            BOOLEAN NOT NULL DEFAULT true,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantWhatsAppConfig_pkey" PRIMARY KEY ("id")
);

-- Unique: one config per tenant
CREATE UNIQUE INDEX "TenantWhatsAppConfig_tenantId_key"
    ON "TenantWhatsAppConfig"("tenantId");

-- Index for webhook resolution: look up tenant by the incoming phoneNumberId
CREATE INDEX "TenantWhatsAppConfig_phoneNumberId_idx"
    ON "TenantWhatsAppConfig"("phoneNumberId");

-- ─── WhatsAppConversation ─────────────────────────────────────────────────────

CREATE TABLE "WhatsAppConversation" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "phone"           TEXT NOT NULL,
    "state"           TEXT NOT NULL DEFAULT 'idle',
    "cartItems"       JSONB NOT NULL DEFAULT '[]',
    "deliveryAddress" TEXT,
    "lastMessageAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"       TIMESTAMP(3) NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- Unique: one active session per (tenant, phone)
CREATE UNIQUE INDEX "WhatsAppConversation_tenantId_phone_key"
    ON "WhatsAppConversation"("tenantId", "phone");

-- Index for tenant-scoped queries
CREATE INDEX "WhatsAppConversation_tenantId_idx"
    ON "WhatsAppConversation"("tenantId");

-- Index for TTL cleanup job (find expired sessions)
CREATE INDEX "WhatsAppConversation_expiresAt_idx"
    ON "WhatsAppConversation"("expiresAt");
