-- ADR-504 · paso 1 (EXPAND) — código de planta único POR PERMISO.
--
-- Mismo predicado y misma expresión que `WoodEntryTroza_tenant_codigoPlanta_unico`
-- (adr-436-codigo-planta-unico.sql:41), más el permiso. `COALESCE(…,'')`
-- obligatorio: en SQL dos NULL no chocan, y una troza sin permiso tiene que
-- seguir chocando con otra sin permiso del mismo código (falla segura).
--
-- Convive con el viejo: mientras el viejo exista manda él (más estricto), así
-- que este no puede fallar por duplicados. El viejo se suelta en el paso 3
-- (`adr-504-paso3-contract-NO-APLICAR.sql`), cuando el código de ADR-504 esté en uso.
--
-- Aplicar: scripts/aplicar-migracion-sesion.mjs <este archivo> --sin-tx [--ensayo]
-- Verificar: SELECT indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
--            WHERE c.relname = 'WoodEntryTroza_tenant_codigoPlanta_permiso_unico';

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "WoodEntryTroza_tenant_codigoPlanta_permiso_unico"
  ON "WoodEntryTroza" ("tenantId", upper(btrim("codigoPlanta")), COALESCE("contratoId", ''))
  WHERE "codigoPlanta" IS NOT NULL AND btrim("codigoPlanta") <> '';
