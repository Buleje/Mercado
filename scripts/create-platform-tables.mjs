import 'dotenv/config';
import pg from 'pg';

const sql = `
CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "key" TEXT PRIMARY KEY,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy" TEXT
);

CREATE TABLE IF NOT EXISTS "TenantFeatureFlag" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "flagKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "TenantFeatureFlag_tenantId_flagKey_key" UNIQUE ("tenantId", "flagKey")
);

CREATE INDEX IF NOT EXISTS "TenantFeatureFlag_tenantId_idx" ON "TenantFeatureFlag"("tenantId");
`;

const client = new pg.Client({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
await client.connect();
try {
  await client.query(sql);
  console.log('SUCCESS: PlatformSetting + TenantFeatureFlag tables created');
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await client.end();
}
