-- Migración 307 — Cacao: trazabilidad de origen Cosecha → Acopio.
-- Aditiva e idempotente. El lote de acopio recuerda de qué sección salió; la
-- labor de cosecha recuerda qué lote generó (evita doble envío).
ALTER TABLE "CacaoLote" ADD COLUMN IF NOT EXISTS "parcelaId" TEXT;
ALTER TABLE "CacaoLote" ADD COLUMN IF NOT EXISTS "parcelaCodigo" TEXT;
ALTER TABLE "CacaoParcelaLabor" ADD COLUMN IF NOT EXISTS "loteId" TEXT;
