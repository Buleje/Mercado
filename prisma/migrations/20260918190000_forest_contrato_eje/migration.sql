-- ADR-421 — el contrato (permiso) como eje del movimiento.
-- Fase EXPAND: todo nullable, nada se reescribe. El texto que ya existe
-- (originCode / permiso / tituloHabilitante) NO se toca.
-- Idempotente: se puede correr dos veces sin romper nada.
--
-- Aplicar:  node scripts/apply-sql.mjs prisma/migrations/20260918190000_forest_contrato_eje/migration.sql --dry-run
--           node scripts/apply-sql.mjs prisma/migrations/20260918190000_forest_contrato_eje/migration.sql
--           node ./prisma-env.tmp.mjs migrate resolve --applied 20260918190000_forest_contrato_eje
-- (`migrate deploy` está roto en este repo: el pooler mata al schema engine y
--  hay 8 migraciones ajenas ya aplicadas a mano — memoria
--  `migracion-pooler-y-resolve-quirurgico`.)
--
-- ROLLBACK: `rollback.sql`, en esta misma carpeta (espejo exacto: FKs, índices,
-- columnas y tabla). Ensayo previo sin escribir nada:
--   node scripts/adr-421-rehearse-contrato.mjs   (corre EXPAND + sembrado en una
--   transacción, imprime los conteos y hace ROLLBACK).
--
-- Sembrado y backfill NO van acá: `prisma/migrations/adr-421-sembrar-contratos.sql`
-- (fase MIGRATE, se aplica aparte y después de que Brandon mira el preview).
--
-- POR QUÉ sin `CREATE INDEX CONCURRENTLY`: medido el 2026-09-18 contra la base
-- real, las siete tablas suman 531 filas (la mayor, ForestCtpEntry, 240). El
-- índice tarda milisegundos; `CONCURRENTLY` obligaría a correr fuera de
-- transacción (`--no-tx`) y se perdería la atomicidad del archivo entero.
-- Revisar esta decisión si alguna pasa de ~100k filas.

CREATE TABLE IF NOT EXISTS "ForestContrato" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "codigo"           TEXT NOT NULL,
    "codigoNorm"       TEXT NOT NULL,
    "alias"            TEXT,
    "titularNombre"    TEXT NOT NULL,
    "titularId"        TEXT,
    "titularDoc"       TEXT,
    "titularDocTipo"   TEXT,
    "resolucionNumero" TEXT,
    "resolucionFecha"  TIMESTAMP(3),
    "tipo"             TEXT,
    "arffs"            TEXT,
    "region"           TEXT,
    "provincia"        TEXT,
    "distrito"         TEXT,
    "areaHa"           DECIMAL(12,2),
    "vigenciaDesde"    TIMESTAMP(3),
    "vigenciaHasta"    TIMESTAMP(3),
    "estado"           TEXT NOT NULL DEFAULT 'vigente',
    "planId"           TEXT,
    "notas"            TEXT,
    "isActive"         BOOLEAN NOT NULL DEFAULT true,
    "createdBy"        TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "deletedAt"        TIMESTAMP(3),
    CONSTRAINT "ForestContrato_pkey" PRIMARY KEY ("id")
);

-- El código normalizado es lo único único: dos escrituras del mismo permiso
-- («19-SEC/…» y «19-sec/…  ») son el mismo papel.
CREATE UNIQUE INDEX IF NOT EXISTS "ForestContrato_tenantId_codigoNorm_key" ON "ForestContrato"("tenantId", "codigoNorm");
CREATE INDEX IF NOT EXISTS "ForestContrato_tenantId_estado_idx"        ON "ForestContrato"("tenantId", "estado");
CREATE INDEX IF NOT EXISTS "ForestContrato_tenantId_titularNombre_idx" ON "ForestContrato"("tenantId", "titularNombre");
CREATE INDEX IF NOT EXISTS "ForestContrato_deletedAt_idx"              ON "ForestContrato"("deletedAt");

-- El vínculo en las siete tablas del movimiento. SET NULL a propósito: borrar
-- un contrato no puede borrar la plata que se movió bajo él.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['WoodEntry','ForestCtpEntry','ForestLoteAserrio','Expense','Adelanto','ForestFlete','ForestCuentaMov']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "contratoId" TEXT', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I("tenantId", "contratoId")', t || '_tenantId_contratoId_idx', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_contratoId_fkey') THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("contratoId") REFERENCES "ForestContrato"("id") ON DELETE SET NULL ON UPDATE CASCADE',
        t, t || '_contratoId_fkey');
    END IF;
  END LOOP;
END $$;
