-- Una parte del directorio forestal se vincula a UNA sola persona de Adelantos
-- (ADR-412 §5, hallazgo de revisión 2026-09-13).
--
-- `vincularParte` verificaba y después escribía: dos pedidos a la vez podían
-- vincular la misma parte a dos personas, y las dos filas de «Cuenta por
-- persona» sumaban el mismo saldo de madera — plata contada dos veces.
--
-- Único PARCIAL: las personas sin vínculo (NULL) no chocan entre sí. El código
-- traduce el P2002 a `ParteYaVinculadaError` (409). Idempotente. Para revertir
-- basta con quitar el índice. Antes de crearlo se verificó que no hubiera
-- duplicados.
--
-- Uso: USE_POOLER=1 SQL_FILE=prisma/migrations/adr-412b-vinculo-unico-persona-parte.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

CREATE UNIQUE INDEX IF NOT EXISTS "AdelantoBeneficiario_tenantId_forestPartyId_vivo_key"
  ON "AdelantoBeneficiario" ("tenantId", "forestPartyId")
  WHERE "forestPartyId" IS NOT NULL;
