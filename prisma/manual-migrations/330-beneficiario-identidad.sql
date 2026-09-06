-- 330 · La ficha completa de una persona del módulo Adelantos.
--
-- POR QUÉ. La ficha tenía cinco campos (nombre, documento, teléfono, notas,
-- tope) y el negocio necesita más de una persona a la que le entrega plata:
--
--   · Si el adelanto sale por transferencia, el número de cuenta no estaba en
--     ningún lado — se buscaba en un WhatsApp viejo cada vez.
--   · El comprobante para firmar (ADR-329) pide dirección y no la teníamos.
--   · Un RUC «NO HABIDO» en SUNAT no sirve para deducir la factura, y eso se
--     descubría después de pagar.
--   · Dar de baja a alguien era imposible: el DELETE se bloquea si tiene
--     adelantos (y está bien que se bloquee), así que la lista sólo crecía.
--
-- Todo NULLABLE: son datos que se completan cuando se tienen, no requisitos
-- para poder adelantarle plata hoy a alguien que está en el mostrador.
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE "AdelantoBeneficiario"
  ADD COLUMN IF NOT EXISTS "tipoDocumento" TEXT,
  ADD COLUMN IF NOT EXISTS "razonSocial" TEXT,
  ADD COLUMN IF NOT EXISTS "direccion" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "estadoSunat" TEXT,
  ADD COLUMN IF NOT EXISTS "condicionSunat" TEXT,
  ADD COLUMN IF NOT EXISTS "verificadoEn" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "banco" TEXT,
  ADD COLUMN IF NOT EXISTS "cuentaBancaria" TEXT,
  ADD COLUMN IF NOT EXISTS "cci" TEXT,
  ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT true;

-- Buscar por documento es lo que se hace cuando alguien llama y sólo dice su
-- número. Sin índice, un tenant con 500 personas hace scan completo.
CREATE INDEX IF NOT EXISTS "AdelantoBeneficiario_tenantId_documento_idx"
  ON "AdelantoBeneficiario" ("tenantId", "documento");

-- La libreta se filtra por activos en casi toda pantalla.
CREATE INDEX IF NOT EXISTS "AdelantoBeneficiario_tenantId_activo_idx"
  ON "AdelantoBeneficiario" ("tenantId", "activo");
