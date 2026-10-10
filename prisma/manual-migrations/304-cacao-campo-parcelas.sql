-- Migración 304 — Cacao: manejo de campo (secciones/parcelas + labores).
-- Aditiva e idempotente: SOLO crea tablas nuevas, no toca datos existentes
-- (expand-only). Modela la "maqueta" de la chacra en grilla y las labores
-- agrícolas por sección para ver qué se hizo y qué falta.

CREATE TABLE IF NOT EXISTS "CacaoParcela" (
  "id"            TEXT PRIMARY KEY,
  "tenantId"      TEXT NOT NULL,
  "codigo"        TEXT NOT NULL,
  "nombre"        TEXT,
  "areaHa"        DECIMAL(8, 2),
  "variedad"      TEXT,
  "anioSiembra"   INTEGER,
  "nPlantas"      INTEGER,
  "gridRow"       INTEGER NOT NULL DEFAULT 0,
  "gridCol"       INTEGER NOT NULL DEFAULT 0,
  "latitud"       DECIMAL(10, 7),
  "longitud"      DECIMAL(10, 7),
  "color"         TEXT,
  "status"        TEXT NOT NULL DEFAULT 'activa',
  "observaciones" TEXT,
  "createdBy"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"     TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "CacaoParcela_tenantId_codigo_key" ON "CacaoParcela"("tenantId", "codigo");
CREATE INDEX IF NOT EXISTS "CacaoParcela_tenantId_status_idx" ON "CacaoParcela"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CacaoParcela_deletedAt_idx" ON "CacaoParcela"("deletedAt");

CREATE TABLE IF NOT EXISTS "CacaoParcelaLabor" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "parcelaId"   TEXT NOT NULL,
  "tipo"        TEXT NOT NULL,
  "estado"      TEXT NOT NULL DEFAULT 'pendiente',
  "fechaPlan"   TIMESTAMP(3),
  "fechaHecho"  TIMESTAMP(3),
  "responsable" TEXT,
  "detalle"     TEXT,
  "cantidad"    DECIMAL(12, 2),
  "unidad"      TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"   TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "CacaoParcelaLabor_tenantId_tipo_idx" ON "CacaoParcelaLabor"("tenantId", "tipo");
CREATE INDEX IF NOT EXISTS "CacaoParcelaLabor_parcelaId_estado_idx" ON "CacaoParcelaLabor"("parcelaId", "estado");
CREATE INDEX IF NOT EXISTS "CacaoParcelaLabor_deletedAt_idx" ON "CacaoParcelaLabor"("deletedAt");
