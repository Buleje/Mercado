-- ADR-491 · Registro de firmas y huellas de adelantos (solo de agregar) +
-- enlace de firma de un uso + tope del cajero. Fase EXPAND (aditiva).
--
-- Aplicar (pooler de SESIÓN :5432, una tx, SAVEPOINT por sentencia,
-- SET LOCAL lock_timeout 5s; nunca un SET de sesión):
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/adr-491-registro-firmas-adelantos.sql --ensayo dotenv_config_path=.env.local
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/adr-491-registro-firmas-adelantos.sql dotenv_config_path=.env.local
-- La 2.ª corrida tiene que cerrar con «0 nuevas». Archivo suelto (como
-- adr-488): no lleva `migrate resolve`. Después: `npx prisma generate` y
-- reiniciar el dev server.
--
-- Idempotencia: CREATE TYPE y ADD CONSTRAINT no tienen IF NOT EXISTS; con este
-- ejecutor su «already exists» se salta en su SAVEPOINT. La función y los
-- triggers son CREATE OR REPLACE (Postgres 14+): repetibles con cualquier
-- ejecutor; el script cuenta «ya estaba» si la definición quedó idéntica.
-- El cuerpo plpgsql lleva punto y coma: el script parte respetando $$ (ADR-491).
--
-- Orden pensado para los locks (todo se suelta en el COMMIT):
--   1. tablas e índices nuevos (nadie las lee todavía);
--   2. índice único en Adelanto (SHARE: frena escrituras de adelantos unos
--      segundos, no lecturas; 78 filas → ms) y las FK que lo necesitan;
--   3. CHECKs, función y triggers;
--   4. Settings al FINAL: ADD COLUMN sin default es solo metadata pero toma
--      ACCESS EXCLUSIVE, y Settings se lee en cada request → lo menos posible.
--
-- Vuelta atrás (solo con 0 filas en el registro): adr-491-vuelta-atras.sql.

CREATE TYPE "AdelantoFirmaTipo" AS ENUM ('FIRMA', 'HUELLA');

CREATE TYPE "AdelantoFirmaCanal" AS ENUM ('PANTALLA', 'ENLACE', 'BACKFILL');

CREATE TABLE IF NOT EXISTS "AdelantoEnlaceFirma" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adelantoId" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "pideHuella" BOOLEAN NOT NULL DEFAULT false,
    "firmanteNombre" TEXT NOT NULL,
    "firmanteDocumento" TEXT,
    "creadoPor" TEXT NOT NULL,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "revocadoEn" TIMESTAMP(3),
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdelantoEnlaceFirma_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdelantoEnlaceFirma_tokenHash_key" ON "AdelantoEnlaceFirma" ("tokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "AdelantoEnlaceFirma_tenantId_id_key" ON "AdelantoEnlaceFirma" ("tenantId", "id");

CREATE INDEX IF NOT EXISTS "AdelantoEnlaceFirma_tenantId_adelantoId_createdAt_idx" ON "AdelantoEnlaceFirma" ("tenantId", "adelantoId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "AdelantoFirma" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adelantoId" TEXT NOT NULL,
    "tipo" "AdelantoFirmaTipo" NOT NULL,
    "canal" "AdelantoFirmaCanal" NOT NULL,
    "firmanteNombre" TEXT NOT NULL,
    "firmanteDocumento" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "montoFirmado" DECIMAL(12,2) NOT NULL,
    "monedaFirmada" TEXT NOT NULL,
    "codigoOperacion" TEXT,
    "pedidoPor" TEXT,
    "enlaceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "consentimiento" TEXT,
    "trazos" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdelantoFirma_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdelantoFirma_tenantId_id_key" ON "AdelantoFirma" ("tenantId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "AdelantoFirma_tenantId_idempotencyKey_key" ON "AdelantoFirma" ("tenantId", "idempotencyKey");

CREATE UNIQUE INDEX IF NOT EXISTS "AdelantoFirma_tenantId_ruta_key" ON "AdelantoFirma" ("tenantId", "ruta");

CREATE INDEX IF NOT EXISTS "AdelantoFirma_tenantId_adelantoId_tipo_createdAt_idx" ON "AdelantoFirma" ("tenantId", "adelantoId", "tipo", "createdAt" DESC);

-- La FK compuesta (tenantId, adelantoId) necesita un único en el destino.
CREATE UNIQUE INDEX IF NOT EXISTS "Adelanto_tenantId_id_key" ON "Adelanto" ("tenantId", "id");

-- FKs. Tenant en CASCADE (como el resto del negocio) pero el trigger de abajo
-- frena la cascada si hay firmas: borrar un tenant con firmas exige la
-- supresión explícita. Adelanto en NO ACTION: un adelanto con firmas no se borra.
ALTER TABLE "AdelantoEnlaceFirma" ADD CONSTRAINT "AdelantoEnlaceFirma_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdelantoEnlaceFirma" ADD CONSTRAINT "AdelantoEnlaceFirma_tenantId_adelantoId_fkey" FOREIGN KEY ("tenantId", "adelantoId") REFERENCES "Adelanto"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "AdelantoFirma" ADD CONSTRAINT "AdelantoFirma_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdelantoFirma" ADD CONSTRAINT "AdelantoFirma_tenantId_adelantoId_fkey" FOREIGN KEY ("tenantId", "adelantoId") REFERENCES "Adelanto"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- MATCH SIMPLE: con "enlaceId" null la FK no se chequea (firma de PANTALLA).
ALTER TABLE "AdelantoFirma" ADD CONSTRAINT "AdelantoFirma_tenantId_enlaceId_fkey" FOREIGN KEY ("tenantId", "enlaceId") REFERENCES "AdelantoEnlaceFirma"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- CHECKs que Prisma no muestra (documentados en los modelos).
ALTER TABLE "AdelantoEnlaceFirma" ADD CONSTRAINT "AdelantoEnlaceFirma_tokenHash_chk" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$');

ALTER TABLE "AdelantoFirma" ADD CONSTRAINT "AdelantoFirma_sha256_chk" CHECK ("sha256" ~ '^[a-f0-9]{64}$');

ALTER TABLE "AdelantoFirma" ADD CONSTRAINT "AdelantoFirma_bytes_chk" CHECK ("bytes" > 0);

ALTER TABLE "AdelantoFirma" ADD CONSTRAINT "AdelantoFirma_huella_chk" CHECK ("tipo" <> 'HUELLA' OR "consentimiento" IS NOT NULL);

ALTER TABLE "AdelantoFirma" ADD CONSTRAINT "AdelantoFirma_canal_enlace_chk" CHECK (("canal" = 'ENLACE') = ("enlaceId" IS NOT NULL));

ALTER TABLE "AdelantoFirma" ADD CONSTRAINT "AdelantoFirma_ruta_chk" CHECK (starts_with("ruta", "tenantId" || '/adelantos/' || "adelantoId" || '/'));

-- Solo de agregar. Única salida: supresión Ley 29733 dentro de una tx con
-- SET LOCAL app.permitir_borrar_firmas = 'on' (y solo DELETE, nunca UPDATE).
-- TRUNCATE (también el que llega en cascada) siempre se rechaza.
CREATE OR REPLACE FUNCTION "adelanto_firma_inmutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.permitir_borrar_firmas', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AdelantoFirma es solo de agregar (ADR-491): % no permitido', TG_OP USING ERRCODE = 'restrict_violation';
END
$$;

CREATE OR REPLACE TRIGGER "AdelantoFirma_inmutable" BEFORE UPDATE OR DELETE ON "AdelantoFirma" FOR EACH ROW EXECUTE FUNCTION "adelanto_firma_inmutable"();

CREATE OR REPLACE TRIGGER "AdelantoFirma_sin_truncate" BEFORE TRUNCATE ON "AdelantoFirma" FOR EACH STATEMENT EXECUTE FUNCTION "adelanto_firma_inmutable"();

-- Al final a propósito (ver «Orden pensado para los locks»). null = tope por
-- defecto (S/ 500, TOPE_CAJERO_POR_DEFECTO); 0 = el cajero no entrega.
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "adelantoTopeCajero" DECIMAL(12,2);
