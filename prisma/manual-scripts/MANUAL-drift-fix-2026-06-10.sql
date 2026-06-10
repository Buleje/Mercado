-- ─────────────────────────────────────────────────────────────────────────────
-- DRIFT-FIX (audit 2026-06-10) · Objetos en schema.prisma que NO existían en DB
-- Fuente: prisma migrate diff --from-config-datasource --to-schema (curado)
-- Crea: enums Live* (3) · live_sessions/live_products/live_chat_messages/
--       live_viewer_events · EventDeadLetter (migración 20260507085127 estaba
--       registrada como aplicada pero la tabla no existía) · CacaoVenta ·
--       columnas nuevas de SearchSuggestion (tabla con 0 filas verificadas).
-- Idempotente: IF NOT EXISTS + DO-blocks. Sin DROPs de data (SearchSuggestion
-- tenía 0 filas al momento de remover columnas legacy).
-- APLICAR: psql "$DIRECT_URL" -f prisma/manual-scripts/MANUAL-drift-fix-2026-06-10.sql
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

DO $$ BEGIN
  CREATE TYPE "LiveStatus" AS ENUM ('scheduled', 'live', 'ended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ModerationState" AS ENUM ('approved', 'flagged', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LiveViewerEventType" AS ENUM ('joined', 'left', 'heartbeat', 'product_click', 'add_to_cart', 'ordered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SearchSuggestion: alinear a schema (0 filas verificadas → sin pérdida)
ALTER TABLE "SearchSuggestion"
  ADD COLUMN IF NOT EXISTS "clickedProductId" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastSearchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "normalizedQuery" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "resultCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "searchCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SearchSuggestion"
  DROP COLUMN IF EXISTS "createdAt",
  DROP COLUMN IF EXISTS "frequency",
  DROP COLUMN IF EXISTS "lastUsed";

-- CreateTable
CREATE TABLE IF NOT EXISTS "live_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "status" "LiveStatus" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "streamUrl" TEXT,
    "recordingUrl" TEXT,
    "viewersPeak" INTEGER NOT NULL DEFAULT 0,
    "viewersAvg" INTEGER NOT NULL DEFAULT 0,
    "messagesCount" INTEGER NOT NULL DEFAULT 0,
    "ordersGenerated" INTEGER NOT NULL DEFAULT 0,
    "gmvSoles" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "categoryChips" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "live_products" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "featuredOrder" INTEGER NOT NULL,
    "highlightedAt" TIMESTAMP(3),
    "addedToCart" INTEGER NOT NULL DEFAULT 0,
    "orderedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "live_chat_messages" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "moderationState" "ModerationState" NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "live_viewer_events" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousId" TEXT,
    "eventType" "LiveViewerEventType" NOT NULL,
    "productId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_viewer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EventDeadLetter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventPayload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT NOT NULL,
    "handlerName" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "EventDeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CacaoVenta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ventaCode" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compradorNombre" TEXT,
    "canal" TEXT,
    "pesoKg" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "precioPorKg" DECIMAL(10,2),
    "tipoCambio" DECIMAL(8,4),
    "totalPen" DECIMAL(14,2),
    "esFob" BOOLEAN NOT NULL DEFAULT false,
    "variedad" TEXT,
    "grado" TEXT,
    "observaciones" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registrado',
    "annulledReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CacaoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "live_sessions_tenantId_status_scheduledFor_idx" ON "live_sessions"("tenantId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "live_sessions_status_scheduledFor_idx" ON "live_sessions"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "live_sessions_tenantId_endedAt_idx" ON "live_sessions"("tenantId", "endedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "live_products_tenantId_liveSessionId_featuredOrder_idx" ON "live_products"("tenantId", "liveSessionId", "featuredOrder");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "live_products_liveSessionId_productId_key" ON "live_products"("liveSessionId", "productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "live_chat_messages_liveSessionId_createdAt_idx" ON "live_chat_messages"("liveSessionId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "live_chat_messages_tenantId_moderationState_idx" ON "live_chat_messages"("tenantId", "moderationState");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "live_viewer_events_liveSessionId_eventType_createdAt_idx" ON "live_viewer_events"("liveSessionId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "live_viewer_events_tenantId_createdAt_idx" ON "live_viewer_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EventDeadLetter_tenantId_resolvedAt_idx" ON "EventDeadLetter"("tenantId", "resolvedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EventDeadLetter_eventType_resolvedAt_idx" ON "EventDeadLetter"("eventType", "resolvedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CacaoVenta_tenantId_fecha_idx" ON "CacaoVenta"("tenantId", "fecha" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CacaoVenta_tenantId_status_idx" ON "CacaoVenta"("tenantId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CacaoVenta_deletedAt_idx" ON "CacaoVenta"("deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchSuggestion_tenantId_normalizedQuery_idx" ON "SearchSuggestion"("tenantId", "normalizedQuery");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchSuggestion_lastSearchedAt_idx" ON "SearchSuggestion"("lastSearchedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SearchSuggestion_tenantId_normalizedQuery_key" ON "SearchSuggestion"("tenantId", "normalizedQuery");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_products_liveSessionId_fkey') THEN
    ALTER TABLE "live_products" ADD CONSTRAINT "live_products_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_chat_messages_liveSessionId_fkey') THEN
    ALTER TABLE "live_chat_messages" ADD CONSTRAINT "live_chat_messages_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_viewer_events_liveSessionId_fkey') THEN
    ALTER TABLE "live_viewer_events" ADD CONSTRAINT "live_viewer_events_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
