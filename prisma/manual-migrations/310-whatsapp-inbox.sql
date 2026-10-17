-- 310: WhatsApp Inbox — log de mensajes in/out (Meta Cloud API). Idempotente.
-- Historial por tenant+cliente para el inbox del admin (MensajesHub → WhatsApp).

CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
  "id"            TEXT PRIMARY KEY,
  "tenantId"      TEXT NOT NULL,
  "phoneNumberId" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "customerName"  TEXT NOT NULL DEFAULT 'Cliente',
  "direction"     TEXT NOT NULL,
  "sentBy"        TEXT NOT NULL DEFAULT 'customer',
  "body"          TEXT NOT NULL,
  "waMessageId"   TEXT,
  "status"        TEXT NOT NULL DEFAULT 'received',
  "read"          BOOLEAN NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessage_waMessageId_key"
  ON "WhatsAppMessage"("waMessageId");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_tenantId_customerPhone_createdAt_idx"
  ON "WhatsAppMessage"("tenantId", "customerPhone", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_tenantId_createdAt_idx"
  ON "WhatsAppMessage"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_tenantId_read_idx"
  ON "WhatsAppMessage"("tenantId", "read");
