-- Migration: Anti-Churn System
-- Adds TenantHealthScore, ChurnSignal, ChurnPlaybook tables

-- ─── TenantHealthScore ───────────────────────────────────────────────────────
CREATE TABLE "TenantHealthScore" (
  "id"                 TEXT         NOT NULL,
  "tenantId"           TEXT         NOT NULL,
  "score"              INTEGER      NOT NULL,
  "loginsLast7d"       INTEGER      NOT NULL DEFAULT 0,
  "loginsLast30d"      INTEGER      NOT NULL DEFAULT 0,
  "ordersLast7d"       INTEGER      NOT NULL DEFAULT 0,
  "ordersLast30d"      INTEGER      NOT NULL DEFAULT 0,
  "featuresUsed"       INTEGER      NOT NULL DEFAULT 0,
  "daysSinceLastOrder" INTEGER      NOT NULL DEFAULT 0,
  "daysSinceLastLogin" INTEGER      NOT NULL DEFAULT 0,
  "trialDaysLeft"      INTEGER,
  "riskLevel"          TEXT         NOT NULL DEFAULT 'low',
  "calculatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TenantHealthScore_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantHealthScore_tenantId_idx"    ON "TenantHealthScore"("tenantId");
CREATE INDEX "TenantHealthScore_riskLevel_idx"   ON "TenantHealthScore"("riskLevel");
CREATE INDEX "TenantHealthScore_calculatedAt_idx" ON "TenantHealthScore"("calculatedAt");

-- ─── ChurnSignal ─────────────────────────────────────────────────────────────
CREATE TABLE "ChurnSignal" (
  "id"           TEXT         NOT NULL,
  "tenantId"     TEXT         NOT NULL,
  "signalType"   TEXT         NOT NULL,
  "severity"     TEXT         NOT NULL DEFAULT 'medium',
  "detail"       TEXT         NOT NULL,
  "resolved"     BOOLEAN      NOT NULL DEFAULT false,
  "resolvedAt"   TIMESTAMP(3),
  "resolvedBy"   TEXT,
  "intervention" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChurnSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChurnSignal_tenantId_idx"          ON "ChurnSignal"("tenantId");
CREATE INDEX "ChurnSignal_severity_resolved_idx" ON "ChurnSignal"("severity", "resolved");
CREATE INDEX "ChurnSignal_createdAt_idx"         ON "ChurnSignal"("createdAt");

-- ─── ChurnPlaybook ───────────────────────────────────────────────────────────
CREATE TABLE "ChurnPlaybook" (
  "id"              TEXT         NOT NULL,
  "name"            TEXT         NOT NULL,
  "triggerSignal"   TEXT         NOT NULL,
  "triggerSeverity" TEXT         NOT NULL DEFAULT 'high',
  "action"          TEXT         NOT NULL,
  "templateId"      TEXT,
  "discountPercent" INTEGER,
  "discountDays"    INTEGER,
  "isActive"        BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChurnPlaybook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChurnPlaybook_name_key" ON "ChurnPlaybook"("name");

-- ─── Seed de playbooks por defecto ───────────────────────────────────────────
INSERT INTO "ChurnPlaybook" ("id", "name", "triggerSignal", "triggerSeverity", "action", "templateId", "discountPercent", "discountDays", "isActive", "createdAt")
VALUES
  (gen_random_uuid(), 'trial_expiring_3d',  'trial_expiring',    'high',     'email',    'trial_expiring_cta', NULL, NULL, true, NOW()),
  (gen_random_uuid(), 'login_drop_7d',      'login_drop',        'high',     'whatsapp', 'login_drop_wa',      NULL, NULL, true, NOW()),
  (gen_random_uuid(), 'order_drop_50pct',   'order_drop',        'high',     'email',    'order_drop_tips',    NULL, NULL, true, NOW()),
  (gen_random_uuid(), 'critical_score',     'login_drop',        'critical', 'call',     NULL,                 NULL, NULL, true, NOW());
