-- Alegra: detracción + guía (ADR alegra-copiar §1.3, §3.2)
-- Expand only: columnas NULL aditivas + 1 índice. Idempotente.

-- TenantSunatConfig: cuenta de detracciones (Banco de la Nación)
ALTER TABLE "TenantSunatConfig" ADD COLUMN IF NOT EXISTS "cuentaDetracciones" TEXT;

-- SunatInvoice: datos de detracción
ALTER TABLE "SunatInvoice" ADD COLUMN IF NOT EXISTS "tipoOperacion" TEXT;
ALTER TABLE "SunatInvoice" ADD COLUMN IF NOT EXISTS "detraccionCodigo" TEXT;
ALTER TABLE "SunatInvoice" ADD COLUMN IF NOT EXISTS "detraccionPorcentaje" DECIMAL(5,2);
ALTER TABLE "SunatInvoice" ADD COLUMN IF NOT EXISTS "detraccionMonto" DECIMAL(12,2);

-- GuiaRemision: transporte + trazabilidad de origen
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "conductorLicencia" TEXT;
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "ubigeoPartida" TEXT;
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "ubigeoLlegada" TEXT;
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "modalidadTraslado" TEXT;
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "origenTipo" TEXT;
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "origenId" TEXT;

CREATE INDEX IF NOT EXISTS "GuiaRemision_tenantId_origenTipo_origenId_idx" ON "GuiaRemision" ("tenantId", "origenTipo", "origenId");
