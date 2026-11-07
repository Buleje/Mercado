-- ForestCtpEntry: de QUIÉN es la madera de esta corrida (ADR-412).
--
-- Pedido de Brandon (2026-09-13) para «Producir sin lote»: «que se pueda poner
-- el dueño… si es madera de tercero o propio».
--
-- El dato ya existe para el lote comercial (`ForestProdLote.titularNombre`,
-- ADR-327: «en un aserradero que presta servicio de maquila el lote no es del
-- centro»). Lo que faltaba es poder decirlo de una CORRIDA: una producción sin
-- lote no consumió ninguna guía ni pertenece a ningún lote, así que no hay de
-- dónde heredar el titular — el mismo hueco que ADR-402 tapó con `originCode`
-- para el permiso.
--
-- Dos columnas y no una:
--   · `duenoMadera` dice QUÉ es — 'propia' | 'tercero'. NULL es «no se declaró»,
--     que no es lo mismo que «es propia»: una corrida vieja no eligió nada y no
--     se le inventa una respuesta.
--   · `titularNombre` dice QUIÉN, y sólo tiene sentido con 'tercero'. Es el
--     nombre tal como se certificó — acta, igual que en el lote: si mañana se
--     corrige la ficha del directorio, lo ya emitido no cambia.
--
-- Nullables las dos. Idempotente. Reversible (DROP COLUMN).
-- Uso: USE_POOLER=1 SQL_FILE=prisma/migrations/adr-412-ctp-entry-dueno-madera.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "duenoMadera" TEXT;
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "titularNombre" TEXT;
