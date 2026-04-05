-- ============================================================
-- Motor de Crédito Interno (Buy-Now-Pay-Later)
-- Bodega San Martín — migración: 20260404230000_add_credit_engine
-- ============================================================

-- CreditProfile: perfil crediticio por cliente/tenant
CREATE TABLE "CreditProfile" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "customerId"       TEXT NOT NULL,
    "creditScore"      INTEGER NOT NULL DEFAULT 0,
    "creditLimit"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedCredit"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "availableCredit"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskLevel"        TEXT NOT NULL DEFAULT 'none',
    "totalLoans"       INTEGER NOT NULL DEFAULT 0,
    "paidOnTime"       INTEGER NOT NULL DEFAULT 0,
    "paidLate"         INTEGER NOT NULL DEFAULT 0,
    "defaulted"        INTEGER NOT NULL DEFAULT 0,
    "avgTicket"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchaseFreqDays" DOUBLE PRECISION,
    "lastScoreUpdate"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditProfile_pkey" PRIMARY KEY ("id")
);

-- CreditInstallment: plan de cuotas por perfil
CREATE TABLE "CreditInstallment" (
    "id"                TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "creditProfileId"   TEXT NOT NULL,
    "orderId"           TEXT,
    "totalAmount"       DOUBLE PRECISION NOT NULL,
    "installments"      INTEGER NOT NULL,
    "installmentAmount" DOUBLE PRECISION NOT NULL,
    "interestRate"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidInstallments"  INTEGER NOT NULL DEFAULT 0,
    "status"            TEXT NOT NULL DEFAULT 'active',
    "nextDueDate"       TIMESTAMP(3) NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditInstallment_pkey" PRIMARY KEY ("id")
);

-- Unicidad: un perfil por cliente/tenant
CREATE UNIQUE INDEX "CreditProfile_tenantId_customerId_key"
    ON "CreditProfile"("tenantId", "customerId");

-- Índices de CreditProfile
CREATE INDEX "CreditProfile_tenantId_idx"
    ON "CreditProfile"("tenantId");

CREATE INDEX "CreditProfile_creditScore_idx"
    ON "CreditProfile"("creditScore");

-- Índices de CreditInstallment
CREATE INDEX "CreditInstallment_tenantId_idx"
    ON "CreditInstallment"("tenantId");

CREATE INDEX "CreditInstallment_creditProfileId_idx"
    ON "CreditInstallment"("creditProfileId");

CREATE INDEX "CreditInstallment_status_nextDueDate_idx"
    ON "CreditInstallment"("status", "nextDueDate");

-- FK: CreditInstallment → CreditProfile
ALTER TABLE "CreditInstallment"
    ADD CONSTRAINT "CreditInstallment_creditProfileId_fkey"
    FOREIGN KEY ("creditProfileId")
    REFERENCES "CreditProfile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
