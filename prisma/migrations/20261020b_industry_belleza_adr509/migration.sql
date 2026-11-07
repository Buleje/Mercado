-- ADR-509 — Rubro «Belleza y cuidado personal» (Tenant.industry).
--
-- EXPAND puro: un valor nuevo al final útil del enum (antes de «otro», igual
-- que en schema.prisma). Ninguna fila cambia: los 15 negocios siguen con su
-- rubro y el default sigue siendo «bodega». Musa pasa a «belleza» después, por
-- la clase de tenants (scripts/musa/poner-rubro-belleza.ts), no acá.
--
-- Postgres 12+ deja correr ADD VALUE dentro de una transacción (la base es 17):
-- el aplicador lo envuelve en su BEGIN/SAVEPOINT. El valor nuevo no se puede
-- USAR en la misma transacción, por eso este archivo no hace ningún UPDATE.
-- `IF NOT EXISTS` = repetible (2.ª corrida: «already exists, skipping»).
--
-- Revertir: Postgres no borra un valor de enum. Si hiciera falta, volver los
-- negocios «belleza» a «bodega» y dejar el valor sin uso.
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261020b_industry_belleza_adr509/migration.sql dotenv_config_path=.env.local

ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS 'belleza' BEFORE 'otro';
