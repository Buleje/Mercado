-- ═══════════════════════════════════════════════════════════════════════════
-- ADR-134 (rev. 2) · Libro CTP: trazabilidad N:M (ForestCtpConsumo) + costos + FK a Supplier
-- Fase: EXPAND (aditiva) — NO hay fase CONTRACT (ver ADR-134 D2)
--
-- ⚠️ REV 2 (2026-07-15): el FK escalar `ForestCtpEntry.woodEntryId` QUEDA DESCARTADO.
--    Decisión de negocio: una corrida de producción real SÍ mezcla varias guías
--    de ingreso ⇒ va la tabla puente ForestCtpConsumo (N:M). Ver ADR-134 D5.
--    Este SQL NUNCA se aplicó (verificado 2026-07-15: 0 de las columnas existen)
--    ⇒ la revisión no cuesta migración correctiva. Se reescribe, no se parcha.
--
-- POR QUÉ SQL MANUAL Y NO `prisma migrate deploy`:
--   B1: DIRECT_URL → ENOTFOUND desde esta red (gotcha conocido, CLAUDE.md regla 14)
--   B2: las tablas forestales NO están en prisma/migrations/ (creadas por db push)
--       ⇒ `migrate dev` generaría CREATE TABLE y fallaría en prod (ya existen)
--   Precedente del repo: scripts/credit-requests-migration.sql
--
-- APLICAR:  node scripts/apply-sql.mjs scripts/forestal-ctp-fk-costos-migration.sql
-- ENSAYAR:  node scripts/forestal-ctp-migration-rehearse.mjs   ← corre y REVIERTE
-- ROLLBACK: scripts/forestal-ctp-fk-costos-rollback.sql  (sólo pre-deploy de código)
-- VERIFY:   node scripts/forestal-ctp-backfill-verify.mjs
--
-- IDEMPOTENTE: correr N veces == correr 1 vez.
-- ORDEN: este SQL corre ANTES de tocar prisma/schema.prisma (si no → P2022 en runtime).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. WoodEntry — FK a Supplier + costo de la materia prima
--    providerName SE QUEDA NOT NULL: es el acta legal de la guía (ADR-134 D2)
--
--    `costoTotal` es lo que dice la FACTURA (el acta, D2). El costo unitario
--    NO se almacena: se deriva (costoTotal / volumeM3). Guardar los dos = drift.
--    Si el volumen se recubica, lo que pagaste no cambia ⇒ el total sigue siendo
--    verdad y el unitario efectivo se mueve solo, que es lo económicamente correcto.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "costoTotal" DECIMAL(12,2);  -- S/ total de la factura
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "moneda"     TEXT DEFAULT 'PEN';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. ForestCtpEntry — SÓLO el costo de proceso
--
--    NO se agrega `woodEntryId`      → lo reemplaza ForestCtpConsumo (D5)
--    NO se agrega `costoMateriaPrima`→ DERIVADO de los consumos (D6). Almacenarlo
--       sería garantía de dato podrido: en Perú la factura llega DESPUÉS de la
--       corrida ⇒ el valor congelado al crear la línea sería NULL para siempre.
--    NO se agrega `costoTotal`       → DERIVADO (materiaPrima + proceso)
--    gtfIngreso / materiaPrimaRef SE QUEDAN: acta legal (D2)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "costoProceso" DECIMAL(12,2);  -- aserrío/secado/MO
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "moneda"       TEXT DEFAULT 'PEN';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. ForestCtpConsumo — tabla puente N:M (ADR-134 D5)
--    1 línea de producción ← N ingresos · 1 ingreso → N líneas de producción.
--
--    `volumeM3` es el HECHO FÍSICO: cuántos m³ de ESE ingreso entraron en ESA
--    corrida. NOT NULL y > 0 — un consumo de 0 no es un consumo, es ruido.
--
--    `costoUnitarioSnap` es NULL por defecto: el costo se calcula on-read desde
--    WoodEntry mientras la línea esté abierta (así la factura tardía "enciende"
--    los costos retroactivamente sin backfill) y se CONGELA acá al cerrar el
--    período. Ver ADR-134 D6.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ForestCtpConsumo" (
  "id"                TEXT         NOT NULL,
  "tenantId"          TEXT         NOT NULL,   -- denormalizado (regla 3 + detección de fuga)
  "ctpEntryId"        TEXT         NOT NULL,
  "woodEntryId"       TEXT         NOT NULL,
  "volumeM3"          DECIMAL(12,4) NOT NULL,  -- 4 decimales = precisión forestal
  "costoUnitarioSnap" DECIMAL(12,2),           -- NULL = costo vivo (on-read). NOT NULL = congelado
  "congeladoAt"       TIMESTAMP(3),
  "createdBy"         TEXT         NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForestCtpConsumo_pkey" PRIMARY KEY ("id"),
  -- Postgres puede garantizar la FORMA (esto), no la POLÍTICA (las invariantes
  -- agregadas I1/I2 y el aislamiento por tenant): eso vive en la capa DB. Ver D3/D7.
  CONSTRAINT "ForestCtpConsumo_volumeM3_positive" CHECK ("volumeM3" > 0),
  CONSTRAINT "ForestCtpConsumo_snap_nonneg"       CHECK ("costoUnitarioSnap" IS NULL OR "costoUnitarioSnap" >= 0),
  -- Congelar = poner snap Y fecha. Nunca uno solo.
  CONSTRAINT "ForestCtpConsumo_congelado_coherente"
    CHECK (("costoUnitarioSnap" IS NULL) = ("congeladoAt" IS NULL))
);

-- Un ingreso aparece UNA vez por línea de producción: si se consume más del
-- mismo ingreso, se SUMA en la fila existente, no se agrega otra.
-- (También hace el backfill idempotente vía ON CONFLICT.)
CREATE UNIQUE INDEX IF NOT EXISTS "ForestCtpConsumo_ctpEntryId_woodEntryId_key"
  ON "ForestCtpConsumo" ("ctpEntryId", "woodEntryId");

CREATE INDEX IF NOT EXISTS "ForestCtpConsumo_ctpEntryId_idx"        ON "ForestCtpConsumo" ("ctpEntryId");
CREATE INDEX IF NOT EXISTS "ForestCtpConsumo_tenantId_woodEntryId_idx" ON "ForestCtpConsumo" ("tenantId", "woodEntryId");
CREATE INDEX IF NOT EXISTS "WoodEntry_tenantId_supplierId_idx"      ON "WoodEntry" ("tenantId", "supplierId");

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Foreign keys — patrón NOT VALID + VALIDATE (zero-downtime)
--    NOT VALID = toma el lock un instante, no escanea la tabla
--    VALIDATE  = escanea con lock débil (SHARE UPDATE EXCLUSIVE), no bloquea DML
--
--    onDelete CASCADE  en ctpEntryId  → el consumo es detalle de la línea; sin
--                                        línea no significa nada. (ForestCtpEntry
--                                        es soft-delete ⇒ en la práctica no dispara.)
--    onDelete RESTRICT en woodEntryId → borrar un ingreso citado por una corrida
--                                        rompe la cadena de custodia. (WoodEntry
--                                        es soft-delete ⇒ red gratis.)
--    onDelete SET NULL en supplierId  → providerName sobrevive (D2) ⇒ el acta no
--                                        se pierde; no bloqueamos la baja de proveedores.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ForestCtpConsumo_ctpEntryId_fkey') THEN
    ALTER TABLE "ForestCtpConsumo"
      ADD CONSTRAINT "ForestCtpConsumo_ctpEntryId_fkey"
      FOREIGN KEY ("ctpEntryId") REFERENCES "ForestCtpEntry" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ForestCtpConsumo_woodEntryId_fkey') THEN
    ALTER TABLE "ForestCtpConsumo"
      ADD CONSTRAINT "ForestCtpConsumo_woodEntryId_fkey"
      FOREIGN KEY ("woodEntryId") REFERENCES "WoodEntry" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WoodEntry_supplierId_fkey') THEN
    ALTER TABLE "WoodEntry"
      ADD CONSTRAINT "WoodEntry_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE "ForestCtpConsumo" VALIDATE CONSTRAINT "ForestCtpConsumo_ctpEntryId_fkey";
ALTER TABLE "ForestCtpConsumo" VALIDATE CONSTRAINT "ForestCtpConsumo_woodEntryId_fkey";
ALTER TABLE "WoodEntry"        VALIDATE CONSTRAINT "WoodEntry_supplierId_fkey";

-- ─────────────────────────────────────────────────────────────────────────
-- 5. BACKFILL — ForestCtpEntry → ForestCtpConsumo (ADR-134 D8)
--
-- Qué hace: para cada línea de PRODUCCIÓN que declara `volumeInputM3` y cita una
-- `gtfIngreso` que resuelve a UN ingreso, crea el consumo correspondiente.
--
-- ⚠️ AMBIGÜEDAD POR DISEÑO (D1, se mantiene): 1 GTF ⇒ N WoodEntry (uno por
--    especie/ítem de ForestGtf.items). Se desambigua por especie y sólo se
--    escribe si el match es ÚNICO. Empate o cero matches ⇒ no se inserta nada y
--    la línea queda con su volumen "sin atribuir". En un libro que fiscaliza
--    SERFOR, NULL honesto > FK adivinada.
--
-- Garantías por construcción (no por esperanza):
--   · I1 (Σ consumos de la línea ≤ volumeInputM3): sólo inserta en líneas SIN
--     consumos previos, con volumen = LEAST(...) ≤ volumeInputM3.
--   · I2 (Σ consumos del ingreso ≤ WoodEntry.volumeM3): resta lo ya atribuido a
--     ese ingreso y exige saldo > 0. Un ingreso NO se puede consumir dos veces.
--   · Idempotente: `NOT EXISTS (consumos de la línea)` + `ON CONFLICT DO NOTHING`.
--     Correrlo N veces == 1 vez, y NUNCA pisa una atribución hecha por el operador.
--
-- MEDIDO EN PROD 2026-07-15 (pooler): 1 línea candidata
--   ForestCtpEntry(main, produccion, lineNo=1, gtfIngreso='001-0000120',
--                  speciesCommon='Tornillo', volumeInputM3=8.4500)
--   → WoodEntry(d0f1c1c7…, main, '001-0000120', 'Tornillo', volumeM3=8.4500)
--   ⇒ 1 consumo de 8.4500 · I1 y I2 se cumplen con IGUALDAD exacta, sin residuo.
--   La línea de 'despacho' (gtfIngreso NULL) no se toca: el despacho no consume
--   materia prima. Es correcto por diseño, no por omisión.
--
-- `gen_random_uuid()::text` como id: Prisma `@default(cuid())` sólo aplica a filas
-- que crea Prisma; un UUID en TEXT es un id válido y ya hay precedente en estas
-- tablas (WoodEntry.id = 'd0f1c1c7-5548-…').
-- ─────────────────────────────────────────────────────────────────────────
WITH candidatos AS (
  SELECT
    e."id"            AS ctp_id,
    e."tenantId"      AS tenant_id,
    w."id"            AS wood_id,
    e."volumeInputM3" AS declarado,
    -- Saldo del ingreso: su volumen menos lo ya atribuido a otras líneas.
    w."volumeM3" - COALESCE((
      SELECT SUM(c2."volumeM3") FROM "ForestCtpConsumo" c2 WHERE c2."woodEntryId" = w."id"
    ), 0) AS saldo_ingreso
  FROM "ForestCtpEntry" e
  JOIN "WoodEntry" w
    ON  w."tenantId"  = e."tenantId"                                   -- aislamiento multi-tenant
    AND w."deletedAt" IS NULL
    AND lower(trim(w."gtfNumber")) = lower(trim(e."gtfIngreso"))
    AND (e."speciesCommon" IS NULL
         OR lower(trim(w."speciesCommonName")) = lower(trim(e."speciesCommon")))
  WHERE e."section"        = 'produccion'                              -- el despacho no consume MP
    AND e."deletedAt"      IS NULL
    AND e."status"         = 'registrado'                              -- no resucitar líneas anuladas
    AND e."gtfIngreso"     IS NOT NULL
    AND e."volumeInputM3"  IS NOT NULL
    AND e."volumeInputM3"  > 0
    -- Idempotencia + respeto por el operador: sólo líneas todavía sin atribuir.
    AND NOT EXISTS (SELECT 1 FROM "ForestCtpConsumo" c WHERE c."ctpEntryId" = e."id")
    -- D1: sólo si el match es ÚNICO.
    AND (
      SELECT COUNT(*) FROM "WoodEntry" w2
      WHERE w2."tenantId"  = e."tenantId"
        AND w2."deletedAt" IS NULL
        AND lower(trim(w2."gtfNumber")) = lower(trim(e."gtfIngreso"))
        AND (e."speciesCommon" IS NULL
             OR lower(trim(w2."speciesCommonName")) = lower(trim(e."speciesCommon")))
    ) = 1
)
INSERT INTO "ForestCtpConsumo" ("id", "tenantId", "ctpEntryId", "woodEntryId", "volumeM3", "createdBy")
SELECT
  gen_random_uuid()::text,
  tenant_id,
  ctp_id,
  wood_id,
  LEAST(declarado, saldo_ingreso),   -- I1 e I2 por construcción
  'backfill:adr-134'                 -- createdBy trazable: se distingue de lo cargado a mano
FROM candidatos
WHERE saldo_ingreso > 0
ON CONFLICT ("ctpEntryId", "woodEntryId") DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. BACKFILL — WoodEntry.supplierId por providerName
--
-- ⚠️ MEDIDO EN PROD 2026-07-15: matchea 0 filas.
--    Los 2 providerName ('Maderera El Aguajal SAC', 'Concesión TEST') no existen
--    como Supplier, y los 2 Suppliers viven en OTROS tenants (ninguno en 'main').
--    Se deja igual: es idempotente y correcto para cuando haya datos reales.
--    Todas las filas quedan supplierId NULL + providerName intacto (D2) ⇒ sin pérdida.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE "WoodEntry" w
SET "supplierId" = s."id"
FROM "Supplier" s
WHERE w."supplierId" IS NULL
  AND w."deletedAt"  IS NULL
  AND s."tenantId"   = w."tenantId"                                   -- aislamiento multi-tenant
  AND lower(trim(s."name")) = lower(trim(w."providerName"))
  AND (
        SELECT COUNT(*) FROM "Supplier" s2
        WHERE s2."tenantId" = w."tenantId"
          AND lower(trim(s2."name")) = lower(trim(w."providerName"))
      ) = 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- SIGUIENTE PASO (en orden, no negociable):
--   1. node scripts/forestal-ctp-backfill-verify.mjs   ← confirmar antes de seguir
--   2. aplicar el bloque "Campos nuevos" de docs/adr/134-forestal-ctp-fk-costos.md
--      a prisma/schema.prisma  →  npx prisma generate  →  npx tsc --noEmit
--   3. guards en lib/db/forest-ctp.db.ts (D3 multi-tenant + D7 invariantes I1/I2,
--      TODO en una transacción). El FK de Postgres NO impide apuntar a otro tenant
--      ni consumir el mismo ingreso dos veces.
-- ═══════════════════════════════════════════════════════════════════════════
