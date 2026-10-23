-- ADR-513 — La huella del celular es una passkey del que recibe, no una imagen.
--
-- EXPAND puro:
--   1. Tabla nueva "AdelantoPasskey": la llave pública (WebAuthn) que el celular
--      de la persona registró para ESTE dominio (rpId). Nunca se borra desde la
--      app: revocar = "revokedAt" (las huellas ya firmadas siguen verificables).
--   2. "AdelantoFirma" suma 3 columnas NULLABLE: "metodo" (texto, NO enum: un
--      valor nuevo de enum rompe al Prisma viejo de producción), "credentialId"
--      y "constancia" (la respuesta firmada por el celular, JSON). Las filas
--      existentes quedan en null: el método se sigue leyendo por el canal.
--      El trigger "AdelantoFirma_inmutable" (ADR-491) no cambia: sigue siendo
--      SÓLO DE AGREGAR.
--   3. CHECK: una fila con metodo 'passkey' lleva su credentialId y su constancia.
--      Todas las filas actuales tienen metodo null: el CHECK pasa sin tocarlas.
--
-- El Prisma viejo de producción no lee estas columnas; sus INSERT las dejan en null.
-- Revertir (sólo si nadie registró passkeys): DROP CONSTRAINT, DROP de las 3
-- columnas y DROP TABLE "AdelantoPasskey".
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261023b_adelanto_passkey_adr513/migration.sql dotenv_config_path=.env.local

CREATE TABLE IF NOT EXISTS "AdelantoPasskey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "beneficiarioId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rpId" TEXT NOT NULL,
    "deviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    CONSTRAINT "AdelantoPasskey_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdelantoPasskey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdelantoPasskey_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "AdelantoBeneficiario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdelantoPasskey_counter_chk" CHECK ("counter" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdelantoPasskey_tenantId_credentialId_key" ON "AdelantoPasskey"("tenantId", "credentialId");
CREATE INDEX IF NOT EXISTS "AdelantoPasskey_tenantId_beneficiarioId_rpId_idx" ON "AdelantoPasskey"("tenantId", "beneficiarioId", "rpId");

ALTER TABLE "AdelantoFirma" ADD COLUMN IF NOT EXISTS "metodo" TEXT;
ALTER TABLE "AdelantoFirma" ADD COLUMN IF NOT EXISTS "credentialId" TEXT;
ALTER TABLE "AdelantoFirma" ADD COLUMN IF NOT EXISTS "constancia" JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdelantoFirma_passkey_chk') THEN
    ALTER TABLE "AdelantoFirma" ADD CONSTRAINT "AdelantoFirma_passkey_chk"
      CHECK ("metodo" IS DISTINCT FROM 'passkey' OR ("credentialId" IS NOT NULL AND "constancia" IS NOT NULL));
  END IF;
END
$$;
