-- CreateTable: MpPendingPlan for reliable plan resolution in MP webhooks
CREATE TABLE "MpPendingPlan" (
    "id" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "preferenceId" TEXT,
    "preapprovalId" TEXT,
    "externalRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MpPendingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MpPendingPlan_preferenceId_key" ON "MpPendingPlan"("preferenceId");
CREATE UNIQUE INDEX "MpPendingPlan_preapprovalId_key" ON "MpPendingPlan"("preapprovalId");
CREATE INDEX "MpPendingPlan_tenantSlug_idx" ON "MpPendingPlan"("tenantSlug");
CREATE INDEX "MpPendingPlan_externalRef_idx" ON "MpPendingPlan"("externalRef");
