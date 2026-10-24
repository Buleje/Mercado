-- ADR-506 — Personal eventual en Asistencia.
--
-- EXPAND puro: una columna NOT NULL con default false. Ninguna fila existente
-- cambia de comportamiento (todas quedan como personal fijo).
-- Revertir (sólo si nadie usa la marca): ALTER TABLE "Colaborador" DROP COLUMN "eventual"
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261020a_rrhh_eventual_adr506/migration.sql dotenv_config_path=.env.local

ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "eventual" BOOLEAN NOT NULL DEFAULT false;
