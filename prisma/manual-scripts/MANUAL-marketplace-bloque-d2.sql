-- MANUAL-marketplace-bloque-d2.sql
-- Idempotente: usar IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- Ejecutar con DIRECT_URL (pooler IPv4) contra Supabase
--
-- Bloque D2 — Chat buyer ↔ seller del Marketplace
-- Incluye:
--   D2.1: ConversationThread   — hilo de conversación por (store, customerPhone, opcional orderId)
--   D2.2: ConversationMessage  — mensajes individuales del hilo
--   D2.3: Índices compuestos para queries comunes (feed admin + mensaje nuevo)
--
-- Principios (mismos que D1):
-- - tenantId obligatorio en todas las tablas (multi-tenant)
-- - Timestamps UTC, helpers toISO() en lib/db/
-- - Todos los índices compuestos empiezan por tenantId
-- - FK con ON DELETE apropiado

-- ─── D2.1: ConversationThread ────────────────────────────
-- Un hilo representa una conversación 1-a-1 entre un comprador (customerPhone)
-- y una tienda del marketplace. Opcionalmente está vinculado a un Order si la
-- conversación se origina sobre un pedido específico (soporte post-venta).
CREATE TABLE IF NOT EXISTS "ConversationThread" (
  "id"              TEXT          NOT NULL,
  "tenantId"        TEXT          NOT NULL,                      -- tenant del VENDEDOR (dueño de la tienda)
  "storeId"         TEXT          NOT NULL,
  "orderId"         TEXT,                                         -- opcional: conversación sobre un pedido
  "customerPhone"   TEXT          NOT NULL,                       -- identificador del buyer
  "customerName"    TEXT          NOT NULL,                       -- nombre mostrado al vendedor
  "subject"         TEXT,                                         -- tema del hilo (opcional, lo pone el buyer)
  "status"          TEXT          NOT NULL DEFAULT 'open',        -- open|closed|archived|blocked
  "unreadForBuyer"  INTEGER       NOT NULL DEFAULT 0,              -- contador para badges del buyer
  "unreadForSeller" INTEGER       NOT NULL DEFAULT 0,              -- contador para badges del seller
  "lastMessageAt"   TIMESTAMP(3),                                  -- timestamp del último mensaje (denormalizado)
  "lastMessageText" TEXT,                                          -- preview del último mensaje (para listado)
  "lastSenderType"  TEXT,                                          -- buyer|seller|system
  "closedAt"        TIMESTAMP(3),
  "closedReason"    TEXT,
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

-- Un buyer puede tener UN hilo abierto por tienda (sin orderId específico)
-- o uno por pedido (con orderId). Garantizamos unicidad lógica con un índice
-- único parcial que tolera varios hilos cerrados pero solo uno abierto.
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationThread_store_customer_orderId_unique"
  ON "ConversationThread"("storeId", "customerPhone", COALESCE("orderId", ''))
  WHERE "status" = 'open';

CREATE INDEX IF NOT EXISTS "ConversationThread_tenantId_idx"
  ON "ConversationThread"("tenantId");

CREATE INDEX IF NOT EXISTS "ConversationThread_storeId_idx"
  ON "ConversationThread"("storeId");

CREATE INDEX IF NOT EXISTS "ConversationThread_tenantId_status_idx"
  ON "ConversationThread"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "ConversationThread_tenantId_lastMessageAt_idx"
  ON "ConversationThread"("tenantId", "lastMessageAt" DESC);

CREATE INDEX IF NOT EXISTS "ConversationThread_customerPhone_idx"
  ON "ConversationThread"("customerPhone");

CREATE INDEX IF NOT EXISTS "ConversationThread_orderId_idx"
  ON "ConversationThread"("orderId");

ALTER TABLE "ConversationThread"
  ADD CONSTRAINT "ConversationThread_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE;

ALTER TABLE "ConversationThread"
  ADD CONSTRAINT "ConversationThread_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL;

-- ─── D2.2: ConversationMessage ───────────────────────────
-- Cada fila es un mensaje individual. Los mensajes del sistema (ej. "el pedido
-- cambió a en_camino") se distinguen por senderType = 'system'.
CREATE TABLE IF NOT EXISTS "ConversationMessage" (
  "id"            TEXT          NOT NULL,
  "tenantId"      TEXT          NOT NULL,
  "threadId"      TEXT          NOT NULL,
  "senderType"    TEXT          NOT NULL,                         -- buyer|seller|system
  "senderId"      TEXT,                                            -- username admin si seller; null si buyer (se identifica por threadId)
  "senderName"    TEXT          NOT NULL,                          -- nombre mostrado
  "body"          TEXT          NOT NULL,                          -- contenido del mensaje
  "messageType"   TEXT          NOT NULL DEFAULT 'text',           -- text|image|system_event|quote|order_link
  "attachmentUrl" TEXT,                                             -- URL de imagen/archivo adjunto (opcional)
  "metadataJson"  TEXT,                                             -- extra opcional (ej. orderId, precios cotizados)
  "readByBuyerAt" TIMESTAMP(3),                                     -- cuándo el buyer marcó visto
  "readBySellerAt" TIMESTAMP(3),                                    -- cuándo el seller marcó visto
  "deletedAt"     TIMESTAMP(3),                                     -- soft-delete para mensajes borrados
  "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConversationMessage_tenantId_idx"
  ON "ConversationMessage"("tenantId");

CREATE INDEX IF NOT EXISTS "ConversationMessage_threadId_idx"
  ON "ConversationMessage"("threadId");

CREATE INDEX IF NOT EXISTS "ConversationMessage_threadId_createdAt_idx"
  ON "ConversationMessage"("threadId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ConversationMessage_senderType_idx"
  ON "ConversationMessage"("senderType");

ALTER TABLE "ConversationMessage"
  ADD CONSTRAINT "ConversationMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE;

-- ─── Registro en _prisma_migrations (opcional) ───────────
-- Si usás el bypass manual de Prisma, descomentar y ejecutar:
-- INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
-- VALUES (gen_random_uuid(), '', NOW(), '20260408200000_marketplace_bloque_d2', NULL, NULL, NOW(), 1)
-- ON CONFLICT DO NOTHING;
