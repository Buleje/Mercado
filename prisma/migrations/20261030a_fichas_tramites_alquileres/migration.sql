-- Fichas de persona, trámites generales y alquileres (ADR-524) — Brandon 30-10:
-- consultar en el panel lo que ya entregó en trámites (Agrobanco por el local de
-- Drucila, SUNAT, DNI) y llevar el alquiler del local mes a mes.
--
-- EXPAND puro, nada que migrar ni contraer:
--   * ForestParty: 10 columnas nullable sin default (DNI emitido/vence, RUC aparte
--     del DNI y su estado/condición, nacimiento, estado civil, parentesco). El
--     Prisma viejo de producción nombra sus columnas en cada SELECT/INSERT: no
--     las lee ni las escribe y sus filas quedan en NULL (= «no se sabe»).
--   * 4 tablas nuevas (Tramite, TramiteRequisito, Alquiler, AlquilerPago) que el
--     código desplegado no conoce. Estados = TEXT + lista cerrada en TS, nunca
--     enum de Postgres.
-- Revertir: DROP de las 4 tablas (AlquilerPago y TramiteRequisito primero) y de
-- las 10 columnas; nadie más las lee.
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261030a_fichas_tramites_alquileres/migration.sql dotenv_config_path=.env.local

ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "dniEmitidoEl" DATE;
ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "dniVenceEl" DATE;
ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "ruc" TEXT;
ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "rucEstado" TEXT;
ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "rucEstadoDesde" DATE;
ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "rucCondicion" TEXT;
ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "nacimientoEl" DATE;
ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "nacimientoLugar" TEXT;
ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "estadoCivil" TEXT;
ALTER TABLE "ForestParty" ADD COLUMN IF NOT EXISTS "parentesco" TEXT;

CREATE TABLE IF NOT EXISTS "Tramite" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "entidad" TEXT NOT NULL,
  "entidadNombre" TEXT,
  "asunto" TEXT NOT NULL,
  "parteId" TEXT,
  "personaNombre" TEXT,
  "alquilerId" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'preparando',
  "iniciadoEl" DATE,
  "enviadoEl" DATE,
  "venceEl" DATE,
  "proximoPaso" TEXT,
  "proximoPasoEl" DATE,
  "canal" TEXT,
  "contacto" TEXT,
  "notas" TEXT,
  "creadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "Tramite_tenantId_estado_idx" ON "Tramite"("tenantId", "estado");
CREATE INDEX IF NOT EXISTS "Tramite_tenantId_venceEl_idx" ON "Tramite"("tenantId", "venceEl");
CREATE INDEX IF NOT EXISTS "Tramite_tenantId_parteId_idx" ON "Tramite"("tenantId", "parteId");
CREATE INDEX IF NOT EXISTS "Tramite_tenantId_alquilerId_idx" ON "Tramite"("tenantId", "alquilerId");

CREATE TABLE IF NOT EXISTS "TramiteRequisito" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "tramiteId" TEXT NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "nombre" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'falta',
  "documentId" TEXT,
  "nota" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TramiteRequisito_tramiteId_fkey" FOREIGN KEY ("tramiteId")
    REFERENCES "Tramite"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TramiteRequisito_tramiteId_idx" ON "TramiteRequisito"("tramiteId");
CREATE INDEX IF NOT EXISTS "TramiteRequisito_tenantId_documentId_idx" ON "TramiteRequisito"("tenantId", "documentId");

CREATE TABLE IF NOT EXISTS "Alquiler" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "direccion" TEXT,
  "partidaSunarp" TEXT,
  "manzana" TEXT,
  "lote" TEXT,
  "areaM2" DECIMAL(10, 2),
  "ubigeo" TEXT,
  "duenoParteId" TEXT,
  "duenoTexto" TEXT,
  "inquilinoParteId" TEXT,
  "inquilinoTexto" TEXT,
  "nuestroPapel" TEXT,
  "rentaMensual" DECIMAL(12, 2) NOT NULL,
  "moneda" TEXT NOT NULL DEFAULT 'PEN',
  "incluyeImpuestos" BOOLEAN,
  "diaPago" INTEGER,
  "garantiaMonto" DECIMAL(12, 2),
  "garantiaPagada" BOOLEAN,
  "garantiaPagadaEl" DATE,
  "garantiaDevueltaEl" DATE,
  "inicioEl" DATE NOT NULL,
  "finEl" DATE,
  "renovacionAutomatica" BOOLEAN NOT NULL DEFAULT false,
  "avisoNoRenovarDias" INTEGER,
  "reajuste" TEXT,
  "contratoDocumentId" TEXT,
  "cuentaBanco" TEXT,
  "cuentaCci" TEXT,
  "cuentaTitular" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'negociacion',
  "notas" TEXT,
  "creadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Alquiler_diaPago_chk" CHECK ("diaPago" IS NULL OR "diaPago" BETWEEN 1 AND 31),
  CONSTRAINT "Alquiler_renta_chk" CHECK ("rentaMensual" > 0)
);
CREATE INDEX IF NOT EXISTS "Alquiler_tenantId_estado_idx" ON "Alquiler"("tenantId", "estado");
CREATE INDEX IF NOT EXISTS "Alquiler_tenantId_finEl_idx" ON "Alquiler"("tenantId", "finEl");
CREATE INDEX IF NOT EXISTS "Alquiler_tenantId_duenoParteId_idx" ON "Alquiler"("tenantId", "duenoParteId");

CREATE TABLE IF NOT EXISTS "AlquilerPago" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "alquilerId" TEXT NOT NULL,
  "periodo" TEXT NOT NULL,
  "monto" DECIMAL(12, 2) NOT NULL,
  "pagadoEl" DATE NOT NULL,
  "medio" TEXT NOT NULL,
  "numeroOperacion" TEXT,
  "comprobanteDocumentId" TEXT,
  "notas" TEXT,
  "registradoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlquilerPago_alquilerId_fkey" FOREIGN KEY ("alquilerId")
    REFERENCES "Alquiler"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AlquilerPago_periodo_chk" CHECK ("periodo" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "AlquilerPago_monto_chk" CHECK ("monto" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "AlquilerPago_alquilerId_periodo_key" ON "AlquilerPago"("alquilerId", "periodo");
CREATE INDEX IF NOT EXISTS "AlquilerPago_tenantId_pagadoEl_idx" ON "AlquilerPago"("tenantId", "pagadoEl");
