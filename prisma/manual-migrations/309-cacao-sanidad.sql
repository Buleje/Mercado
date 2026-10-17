-- Migración 309 — Cacao campo: monitoreo fitosanitario (CacaoSanidad).
-- Aditiva e idempotente: tabla nueva aislada (sin FK físicas, ref app-level por
-- parcelaId como el resto del módulo campo). Focos de plaga/enfermedad por sección.
CREATE TABLE IF NOT EXISTS "CacaoSanidad" (
  "id"            TEXT PRIMARY KEY,
  "tenantId"      TEXT NOT NULL,
  "parcelaId"     TEXT NOT NULL,
  "plaga"         TEXT NOT NULL,
  "severidad"     TEXT NOT NULL DEFAULT 'media',
  "incidenciaPct" DECIMAL(5,2),
  "fecha"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tratamiento"   TEXT,
  "responsable"   TEXT,
  "notas"         TEXT,
  "estado"        TEXT NOT NULL DEFAULT 'activo',
  "createdBy"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"     TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "CacaoSanidad_tenantId_estado_idx" ON "CacaoSanidad" ("tenantId", "estado");
CREATE INDEX IF NOT EXISTS "CacaoSanidad_parcelaId_estado_idx" ON "CacaoSanidad" ("parcelaId", "estado");
CREATE INDEX IF NOT EXISTS "CacaoSanidad_deletedAt_idx" ON "CacaoSanidad" ("deletedAt");
