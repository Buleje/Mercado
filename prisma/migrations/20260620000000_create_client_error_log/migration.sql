-- ClientErrorLog: errores runtime del panel admin de los negocios (idea #1,
-- Brandon 2026-06-19). Idempotente (el pooler de Supabase cuelga `prisma migrate`;
-- se aplica vía Supabase MCP / pg directo y queda acá para `prisma migrate deploy`).
CREATE TABLE IF NOT EXISTS "ClientErrorLog" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "digest"      TEXT,
  "message"     TEXT NOT NULL,
  "source"      TEXT NOT NULL DEFAULT '',
  "userAgent"   TEXT,
  "count"       INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"  TIMESTAMP(3),
  "resolvedBy"  TEXT
);
CREATE INDEX IF NOT EXISTS "ClientErrorLog_resolvedAt_lastSeenAt_idx" ON "ClientErrorLog"("resolvedAt", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "ClientErrorLog_tenantId_idx" ON "ClientErrorLog"("tenantId");
CREATE INDEX IF NOT EXISTS "ClientErrorLog_digest_idx" ON "ClientErrorLog"("digest");
