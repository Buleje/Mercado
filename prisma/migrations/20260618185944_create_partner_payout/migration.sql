-- CreateTable: PartnerPayout (retiros cash-out del repartidor a Yape)
-- Aplicada vía Supabase MCP apply_migration sobre el pooler (prisma migrate
-- no corre por pgBouncer). SQL idempotente para que `prisma migrate deploy`
-- sea un no-op si la tabla ya existe.
CREATE TABLE IF NOT EXISTS "PartnerPayout" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "yapeNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "PartnerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerPayout_tenantId_idx" ON "PartnerPayout"("tenantId");
CREATE INDEX IF NOT EXISTS "PartnerPayout_partnerId_status_idx" ON "PartnerPayout"("partnerId", "status");

-- AddForeignKey (idempotente: ignora si ya existe)
DO $$ BEGIN
    ALTER TABLE "PartnerPayout"
        ADD CONSTRAINT "PartnerPayout_partnerId_fkey"
        FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
