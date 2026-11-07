-- Cacao: geolocalización del productor (mapa + trazabilidad de origen).
-- Aditivo e idempotente.
ALTER TABLE "CacaoProducer" ADD COLUMN IF NOT EXISTS "latitud" DECIMAL(10, 7);
ALTER TABLE "CacaoProducer" ADD COLUMN IF NOT EXISTS "longitud" DECIMAL(10, 7);
