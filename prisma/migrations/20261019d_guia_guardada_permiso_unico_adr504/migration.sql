-- ADR-504 · paso 1 (EXPAND) — una guía guardada viva por N° de GTF Y permiso.
--
-- Mismo predicado que `ForestGuiaGuardada_tenantId_gtf_vivo_key`
-- (20260927_guias_guardadas_adr442/migration.sql:45) más
-- `COALESCE("contratoId",'')` (NULL = sin permiso = regla de hoy).
-- `ForestGuiaGuardada_tenantId_registro_vivo_key` (N° de registro SNIFFS) NO
-- cambia: esa constancia es única de verdad.
--
-- Convive con el viejo (más estricto); el viejo se suelta en el paso 3.
-- Aplicar: scripts/aplicar-migracion-sesion.mjs <este archivo> --sin-tx [--ensayo]

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "ForestGuiaGuardada_tenantId_gtf_contrato_vivo_key"
  ON "ForestGuiaGuardada" ("tenantId", "gtfNumber", COALESCE("contratoId", ''))
  WHERE "deletedAt" IS NULL;
