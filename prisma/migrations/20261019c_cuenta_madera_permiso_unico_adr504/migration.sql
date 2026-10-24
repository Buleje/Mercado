-- ADR-504 · paso 1 (EXPAND) — un abono `madera` vivo por guía Y permiso.
--
-- La guía = N° de GTF + permiso (dos talonarios repiten la GTF 4). Mismo
-- predicado que `ForestCuentaMov_tenantId_gtf_madera_vivo_key`
-- (20260926_guia_plata_adr437/migration.sql:37) más `COALESCE("contratoId",'')`:
-- un abono sin permiso choca con otro sin permiso del mismo N° (regla de hoy).
-- Que una guía SIN permiso frene a cualquier permiso con ese N° (plata más
-- estricta, decisión ADR-504) lo controla el código, no este índice.
--
-- Convive con el viejo (más estricto); el viejo se suelta en el paso 3.
-- Aplicar: scripts/aplicar-migracion-sesion.mjs <este archivo> --sin-tx [--ensayo]

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "ForestCuentaMov_tenantId_gtf_contrato_madera_vivo_key"
  ON "ForestCuentaMov" ("tenantId", "gtfNumber", COALESCE("contratoId", ''))
  WHERE "concepto" = 'madera' AND "gtfNumber" IS NOT NULL AND "deletedAt" IS NULL;
