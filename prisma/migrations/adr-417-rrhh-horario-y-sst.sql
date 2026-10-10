-- Horario del puesto y datos de seguridad de la persona (ADR-417).
--
-- EXPAND puro: cuatro columnas aditivas. Ningún dato existente cambia y el código
-- viejo no las lee. Por qué cada una:
--   Puesto.horaEntrada / toleranciaMin → hoy la TARDANZA se pone a dedo (5 marcas
--     a mano sobre 52) aunque 36 marcas ya guardan la hora de entrada: sin hora de
--     referencia no hay con qué compararla.
--   Colaborador.grupoSanguineo / alergias → el dorso del fotocheck ya reserva el
--     bloque «EN CASO DE EMERGENCIA»; en un aserradero el fotocheck hace de
--     credencial de seguridad y eso es lo que se lee en el momento.
--
-- Para revertir (contar primero que nadie los haya cargado):
--   ALTER TABLE "Puesto" DROP CONSTRAINT "Puesto_horaEntrada_chk", DROP COLUMN "horaEntrada";
--   ALTER TABLE "Puesto" DROP CONSTRAINT "Puesto_toleranciaMin_chk", DROP COLUMN "toleranciaMin";
--   ALTER TABLE "Colaborador" DROP CONSTRAINT "Colaborador_grupoSanguineo_chk", DROP COLUMN "grupoSanguineo";
--   ALTER TABLE "Colaborador" DROP CONSTRAINT "Colaborador_alergias_chk", DROP COLUMN "alergias";
--
-- Uso: node scripts/apply-sql.mjs prisma/migrations/adr-417-rrhh-horario-y-sst.sql

ALTER TABLE "Puesto" ADD COLUMN IF NOT EXISTS "horaEntrada" TEXT;
ALTER TABLE "Puesto" ADD COLUMN IF NOT EXISTS "toleranciaMin" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "grupoSanguineo" TEXT;
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "alergias" TEXT;

-- La hora va como HH:MM de 24 h; la tolerancia, en minutos y con techo (4 h no es tolerancia).
DO $$ BEGIN
  ALTER TABLE "Puesto" ADD CONSTRAINT "Puesto_horaEntrada_chk"
    CHECK ("horaEntrada" IS NULL OR "horaEntrada" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Puesto" ADD CONSTRAINT "Puesto_toleranciaMin_chk"
    CHECK ("toleranciaMin" >= 0 AND "toleranciaMin" <= 240);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lista cerrada: un fotocheck que diga «0 positivo?» no sirve en una emergencia.
DO $$ BEGIN
  ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_grupoSanguineo_chk"
    CHECK ("grupoSanguineo" IS NULL OR "grupoSanguineo" IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_alergias_chk"
    CHECK ("alergias" IS NULL OR length("alergias") <= 200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
