-- Store Page System (Buleje)
-- Created 2026-04-11
-- Adds 4 new tables for per-tenant individual page customization:
--   TenantStorePage                — customización (tema, hero, about, SEO)
--   TenantPageProductOverride      — productos destacados + precio exclusivo
--   TenantPagePromotion            — promociones SOLO de la página individual
--   TenantPageVisit                — eventos analíticos de visitas/conversiones
--
-- All tables carry `tenantId` and are covered by explicit indexes.
-- RLS policies are declared at the bottom (enable via supabase SQL editor).

-- ── TenantStorePage ──────────────────────────────────────────────────────────
CREATE TABLE "TenantStorePage" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "published"        BOOLEAN NOT NULL DEFAULT true,
  "heroTitle"        TEXT,
  "heroSubtitle"     TEXT,
  "heroImageUrl"     TEXT,
  "heroCtaLabel"     TEXT,
  "heroCtaUrl"       TEXT,
  "primaryColor"     TEXT NOT NULL DEFAULT '#00B4A6',
  "accentColor"      TEXT NOT NULL DEFAULT '#f4a261',
  "aboutTitle"       TEXT,
  "aboutBody"        TEXT,
  "whatsappPhone"    TEXT,
  "contactEmail"     TEXT,
  "address"          TEXT,
  "metaTitle"        TEXT,
  "metaDescription"  TEXT,
  "ogImageUrl"       TEXT,
  "footerHtml"       TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantStorePage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantStorePage_tenantId_key" ON "TenantStorePage"("tenantId");
CREATE INDEX "TenantStorePage_tenantId_idx" ON "TenantStorePage"("tenantId");

ALTER TABLE "TenantStorePage"
  ADD CONSTRAINT "TenantStorePage_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── TenantPageProductOverride ────────────────────────────────────────────────
CREATE TABLE "TenantPageProductOverride" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "productId"       INTEGER NOT NULL,
  "exclusivePrice"  DECIMAL(12,2),
  "featured"        BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "badge"           TEXT,
  "visible"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantPageProductOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPageProductOverride_tenantId_productId_key"
  ON "TenantPageProductOverride"("tenantId", "productId");
CREATE INDEX "TenantPageProductOverride_tenantId_idx"
  ON "TenantPageProductOverride"("tenantId");
CREATE INDEX "TenantPageProductOverride_tenantId_visible_featured_idx"
  ON "TenantPageProductOverride"("tenantId", "visible", "featured");
CREATE INDEX "TenantPageProductOverride_productId_idx"
  ON "TenantPageProductOverride"("productId");

ALTER TABLE "TenantPageProductOverride"
  ADD CONSTRAINT "TenantPageProductOverride_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantPageProductOverride"
  ADD CONSTRAINT "TenantPageProductOverride_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── TenantPagePromotion ──────────────────────────────────────────────────────
CREATE TABLE "TenantPagePromotion" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT,
  "discountType"    TEXT NOT NULL DEFAULT 'percent',
  "discountValue"   DECIMAL(12,2) NOT NULL,
  "bannerImageUrl"  TEXT,
  "ctaLabel"        TEXT,
  "ctaUrl"          TEXT,
  "startAt"         TIMESTAMP(3),
  "endAt"           TIMESTAMP(3),
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "position"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantPagePromotion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantPagePromotion_tenantId_idx"
  ON "TenantPagePromotion"("tenantId");
CREATE INDEX "TenantPagePromotion_tenantId_active_startAt_endAt_idx"
  ON "TenantPagePromotion"("tenantId", "active", "startAt", "endAt");

ALTER TABLE "TenantPagePromotion"
  ADD CONSTRAINT "TenantPagePromotion_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── TenantPageVisit ──────────────────────────────────────────────────────────
CREATE TABLE "TenantPageVisit" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "sessionId"  TEXT,
  "referrer"   TEXT,
  "utmSource"  TEXT,
  "userAgent"  TEXT,
  "ipHash"     TEXT,
  "path"       TEXT,
  "converted"  BOOLEAN NOT NULL DEFAULT false,
  "orderId"    TEXT,
  "visitedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantPageVisit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantPageVisit_tenantId_visitedAt_idx"
  ON "TenantPageVisit"("tenantId", "visitedAt");
CREATE INDEX "TenantPageVisit_tenantId_converted_idx"
  ON "TenantPageVisit"("tenantId", "converted");
CREATE INDEX "TenantPageVisit_sessionId_idx"
  ON "TenantPageVisit"("sessionId");

ALTER TABLE "TenantPageVisit"
  ADD CONSTRAINT "TenantPageVisit_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (RLS) — enable + policies
-- ─────────────────────────────────────────────────────────────────────────────
-- Requires `app.current_tenant_id` to be set per-session by the app layer.
-- Fallback behavior: if the setting is missing, queries see zero rows
-- (deny-by-default).

ALTER TABLE "TenantStorePage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantPageProductOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantPagePromotion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantPageVisit" ENABLE ROW LEVEL SECURITY;

-- service_role bypass (used by application layer + cron jobs)
CREATE POLICY "TenantStorePage_service_role_all"
  ON "TenantStorePage" FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "TenantPageProductOverride_service_role_all"
  ON "TenantPageProductOverride" FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "TenantPagePromotion_service_role_all"
  ON "TenantPagePromotion" FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "TenantPageVisit_service_role_all"
  ON "TenantPageVisit" FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Tenant isolation for authenticated requests
CREATE POLICY "TenantStorePage_tenant_isolation"
  ON "TenantStorePage" FOR ALL
  TO authenticated
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY "TenantPageProductOverride_tenant_isolation"
  ON "TenantPageProductOverride" FOR ALL
  TO authenticated
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY "TenantPagePromotion_tenant_isolation"
  ON "TenantPagePromotion" FOR ALL
  TO authenticated
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- Public read of published data (customization, active promos, visible overrides)
-- is delegated to application-layer filtering via the `/api/store-page/public/[slug]`
-- route, which runs under service_role. RLS stays strict.

CREATE POLICY "TenantPageVisit_tenant_isolation_read"
  ON "TenantPageVisit" FOR SELECT
  TO authenticated
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- Allow anon INSERT on visits (public beacon). The application layer validates
-- the tenantId against a real Tenant row before inserting, so abuse is bounded.
CREATE POLICY "TenantPageVisit_anon_insert"
  ON "TenantPageVisit" FOR INSERT
  TO anon
  WITH CHECK (true);
