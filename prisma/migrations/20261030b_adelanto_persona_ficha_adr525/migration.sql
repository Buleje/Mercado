-- Persona de Adelantos (ADR-525) — Brandon 30-10 eligió los 4 grupos: qué es
-- para el negocio, Yape/Plin, un contacto de referencia y la fecha de
-- nacimiento + la foto del DNI.
--
-- EXPAND puro: seis columnas nullable, sin default, sin índice y sin enum (un
-- valor nuevo de enum rompe al Prisma viejo de producción). El Prisma viejo
-- nombra sus columnas en cada SELECT/INSERT: no las lee ni las escribe, y una
-- fila suya queda con NULL (= «no se anotó»). `ADD COLUMN … NULL` sin default
-- no reescribe la tabla.
--
-- `fotoDocumentoKey` es la RUTA en el bucket privado `forestal-privado`, nunca
-- una URL pública: la imagen se sirve sólo por la ruta con sesión y negocio.
-- Revertir: soltar las seis columnas (nadie más las lee).
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261030b_adelanto_persona_ficha_adr525/migration.sql dotenv_config_path=.env.local

ALTER TABLE "AdelantoBeneficiario" ADD COLUMN IF NOT EXISTS "tipoRelacion" TEXT;
ALTER TABLE "AdelantoBeneficiario" ADD COLUMN IF NOT EXISTS "yape" TEXT;
ALTER TABLE "AdelantoBeneficiario" ADD COLUMN IF NOT EXISTS "referenciaNombre" TEXT;
ALTER TABLE "AdelantoBeneficiario" ADD COLUMN IF NOT EXISTS "referenciaTelefono" TEXT;
ALTER TABLE "AdelantoBeneficiario" ADD COLUMN IF NOT EXISTS "fechaNacimiento" DATE;
ALTER TABLE "AdelantoBeneficiario" ADD COLUMN IF NOT EXISTS "fotoDocumentoKey" TEXT;
