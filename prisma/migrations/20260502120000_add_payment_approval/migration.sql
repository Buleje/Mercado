-- Yape Vision: aprobaciones de pagos automáticas
-- Una `PaymentApproval` se crea cada vez que un cliente envía la captura
-- de su Yape por WhatsApp. La IA (Claude Sonnet 4.6 Vision) extrae el
-- monto/fecha/código y compara contra el `expectedAmount` de la
-- conversación activa. Si la diferencia es >5% se marca review_required.
--
-- Status enum (en string para evitar nuevas migraciones al evolucionar):
--   pending           — recibida, esperando IA
--   review_required   — IA dudó (delta >5%, ilegible, no es Yape)
--   approved          — aprobada (auto o manual)
--   rejected          — rechazada (manual)
--
-- tenantId NO aplica: PaymentApproval es global del SaaS porque el
-- pipeline IA cruza tenants y los humanos del equipo Buleje revisan
-- todas las dudas en un solo dashboard.

-- CreateTable
CREATE TABLE "PaymentApproval" (
    "id"              TEXT NOT NULL,
    "conversationId"  TEXT,
    "customerPhone"   TEXT NOT NULL,
    "expectedAmount"  DECIMAL(12, 2) NOT NULL,
    "detectedAmount"  DECIMAL(12, 2),
    "imageUrl"        TEXT NOT NULL,
    "visionResponse"  JSONB,
    "yapeOpCode"      TEXT,
    "yapeLast4"       TEXT,
    "yapeDate"        TIMESTAMP(3),
    "status"          TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "reviewedBy"      TEXT,
    "reviewedAt"      TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentApproval_status_idx" ON "PaymentApproval"("status");

-- CreateIndex
CREATE INDEX "PaymentApproval_customerPhone_idx" ON "PaymentApproval"("customerPhone");

-- CreateIndex
CREATE INDEX "PaymentApproval_createdAt_idx" ON "PaymentApproval"("createdAt");
