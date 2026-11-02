-- Buleje IA (ADR-528) — Brandon 01-11: una app de IA donde cada negocio pone la
-- clave del modelo que prefiera (ChatGPT, Claude, Gemini, DeepSeek, Qwen, Kimi,
-- GLM…) y opera el sistema hablando: anota gastos con la foto del recibo,
-- recuerda lo del negocio y devuelve papeles.
--
-- EXPAND puro, nada que migrar ni contraer:
--   * AIMessage.extra JSONB nullable: el Prisma viejo de producción no la nombra
--     en sus SELECT/INSERT; sus filas quedan en NULL.
--   * 3 tablas nuevas que el código desplegado no conoce. Tipos/estados = TEXT +
--     lista cerrada en TS, nunca enum de Postgres.
-- Revertir: DROP de las 3 tablas y de AIMessage.extra; nadie más las lee.
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261101a_buleje_ia_adr528/migration.sql dotenv_config_path=.env.local

ALTER TABLE "AIMessage" ADD COLUMN IF NOT EXISTS "extra" JSONB;

CREATE TABLE IF NOT EXISTS "TenantIaProveedor" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "proveedor" TEXT NOT NULL,
  "nombre" TEXT NOT NULL DEFAULT '',
  "modelo" TEXT NOT NULL,
  "modeloVision" TEXT,
  "baseUrl" TEXT,
  "claveCifrada" TEXT NOT NULL,
  "claveFinal" TEXT NOT NULL DEFAULT '',
  "principal" BOOLEAN NOT NULL DEFAULT false,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "ultimaPrueba" TIMESTAMP(3),
  "ultimoEstado" TEXT,
  "creadoPor" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "TenantIaProveedor_tenantId_idx" ON "TenantIaProveedor"("tenantId");
CREATE INDEX IF NOT EXISTS "TenantIaProveedor_tenantId_principal_idx" ON "TenantIaProveedor"("tenantId", "principal");

CREATE TABLE IF NOT EXISTS "AsistenteMemoria" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'dato',
  "titulo" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "palabras" TEXT NOT NULL DEFAULT '',
  "entidadTipo" TEXT,
  "entidadId" TEXT,
  "fuente" TEXT NOT NULL DEFAULT 'app',
  "creadoPor" TEXT NOT NULL DEFAULT '',
  "usos" INTEGER NOT NULL DEFAULT 0,
  "ultimoUso" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "AsistenteMemoria_tenantId_idx" ON "AsistenteMemoria"("tenantId");
CREATE INDEX IF NOT EXISTS "AsistenteMemoria_tenantId_tipo_idx" ON "AsistenteMemoria"("tenantId", "tipo");

CREATE TABLE IF NOT EXISTS "AsistenteConexion" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "tokenPrefijo" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "usuario" TEXT NOT NULL,
  "rol" TEXT NOT NULL,
  "permiteEscribir" BOOLEAN NOT NULL DEFAULT false,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "ultimoUso" TIMESTAMP(3),
  "usos" INTEGER NOT NULL DEFAULT 0,
  "creadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revocadoAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "AsistenteConexion_tokenHash_key" ON "AsistenteConexion"("tokenHash");
CREATE INDEX IF NOT EXISTS "AsistenteConexion_tenantId_idx" ON "AsistenteConexion"("tenantId");
