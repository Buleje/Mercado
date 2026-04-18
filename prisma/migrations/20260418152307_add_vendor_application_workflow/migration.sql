-- Migration: add_vendor_application_workflow
-- ADR-079 — Vendor Application approval workflow + state machine
-- EXPAND-ONLY: solo crea tablas/enums/indices nuevos. Ninguna columna existente
-- se toca. Rollback seguro con DROP TABLE ... CASCADE + DROP TYPE.

-- ═══════════════════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "VendorDistrict" AS ENUM (
  'callerya',
  'yarinacocha',
  'manantay',
  'puerto_callao',
  'pucallpa_centro',
  'san_fernando',
  'masisea',
  'otros_ucayali'
);

CREATE TYPE "VendorCategory" AS ENUM (
  'bodega',
  'minimarket',
  'carniceria',
  'fruteria',
  'panaderia',
  'licoreria',
  'farmacia',
  'ferreteria',
  'restaurante_comida'
);

CREATE TYPE "VendorPlan" AS ENUM (
  'free',
  'pro'
);

CREATE TYPE "ApplicationStatus" AS ENUM (
  'pending',
  'under_review',
  'info_requested',
  'approved',
  'tenant_provisioned',
  'rejected'
);

CREATE TYPE "ApplicationReviewAction" AS ENUM (
  'start_review',
  'request_info',
  'approve',
  'reject',
  'reopen'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- VendorApplication — solicitud del wizard /vender/registro
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "vendor_applications" (
  "id"                  TEXT              NOT NULL,

  -- Datos del negocio
  "businessName"        TEXT              NOT NULL,
  "ruc"                 TEXT              NOT NULL,
  "address"             TEXT              NOT NULL,
  "district"            "VendorDistrict"  NOT NULL,
  "category"            "VendorCategory"  NOT NULL,

  -- Contacto
  "contactName"         TEXT              NOT NULL,
  "contactDni"          TEXT              NOT NULL,
  "contactPhone"        TEXT              NOT NULL,
  "contactEmail"        TEXT              NOT NULL,

  -- Verificacion (documentos)
  "rucDocumentUrl"      TEXT,
  "storefrontPhotoUrl"  TEXT,
  "termsAcceptedAt"     TIMESTAMP(3),

  -- Horarios + delivery
  "schedule"            JSONB             NOT NULL,
  "deliveryZones"       JSONB             NOT NULL,
  "deliveryFeeSoles"    DECIMAL(10, 2)    NOT NULL,

  -- Plan
  "plan"                "VendorPlan"      NOT NULL,

  -- Workflow
  "status"              "ApplicationStatus" NOT NULL DEFAULT 'pending',
  "submittedAt"         TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewStartedAt"     TIMESTAMP(3),
  "decidedAt"           TIMESTAMP(3),
  "reviewerUserId"      TEXT,
  "decisionReason"      TEXT,
  "infoRequestNote"     TEXT,

  -- Post-approval
  "tenantId"            TEXT,
  "tenantSlug"          TEXT,

  "createdAt"           TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3)      NOT NULL,

  CONSTRAINT "vendor_applications_pkey" PRIMARY KEY ("id")
);

-- Uniques
CREATE UNIQUE INDEX "vendor_applications_ruc_key"         ON "vendor_applications"("ruc");
CREATE UNIQUE INDEX "vendor_applications_tenantId_key"    ON "vendor_applications"("tenantId");
CREATE UNIQUE INDEX "vendor_applications_tenantSlug_key"  ON "vendor_applications"("tenantSlug");

-- Indices para queries del superadmin
CREATE INDEX "vendor_applications_status_submittedAt_idx" ON "vendor_applications"("status", "submittedAt");
CREATE INDEX "vendor_applications_district_status_idx"    ON "vendor_applications"("district", "status");
CREATE INDEX "vendor_applications_contactEmail_idx"       ON "vendor_applications"("contactEmail");

-- ═══════════════════════════════════════════════════════════════════════════
-- VendorApplicationReview — log append-only de acciones
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "vendor_application_reviews" (
  "id"              TEXT                        NOT NULL,
  "applicationId"   TEXT                        NOT NULL,
  "reviewerUserId"  TEXT                        NOT NULL,
  "action"          "ApplicationReviewAction"   NOT NULL,
  "note"            TEXT,
  "previousStatus"  "ApplicationStatus"         NOT NULL,
  "newStatus"       "ApplicationStatus"         NOT NULL,
  "createdAt"       TIMESTAMP(3)                NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vendor_application_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendor_application_reviews_applicationId_createdAt_idx"
  ON "vendor_application_reviews"("applicationId", "createdAt");
CREATE INDEX "vendor_application_reviews_reviewerUserId_idx"
  ON "vendor_application_reviews"("reviewerUserId");

-- FK cascade delete: si se borra una application, su historia tambien.
ALTER TABLE "vendor_application_reviews"
  ADD CONSTRAINT "vendor_application_reviews_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "vendor_applications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
