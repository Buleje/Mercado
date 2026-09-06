-- ═══════════════════════════════════════════════════════════════════════════
-- ADR-135 · Libro CTP: puente N:M despacho → producción (ForestCtpDespachoOrigen)
-- Fase: EXPAND (aditiva) — NO hay fase CONTRACT (ADR-134 D2: gtfNumber/destino
--       son el acta legal del despacho; el puente es índice, no reemplazo)
--
-- QUÉ CIERRA: hoy la cadena es ingreso →(FK real, ADR-134)→ producción →(TEXTO
--   LIBRE)→ despacho. O sea que "¿de qué árbol salió esta tabla que despaché?"
--   no se puede responder de punta a punta — que es lo que exige EUDR y lo que
--   fiscaliza SERFOR. Este SQL agrega el último tramo.
--
-- POR QUÉ SQL MANUAL Y NO `prisma migrate deploy` (igual que ADR-134):
--   B1: DIRECT_URL → ENOTFOUND desde esta red (CLAUDE.md regla 14)
--   B2: las tablas forestales NO están en prisma/migrations/ (creadas por db push)
--       ⇒ `migrate dev` generaría CREATE TABLE de todo y fallaría en prod
--   Precedente: scripts/forestal-ctp-fk-costos-migration.sql (ADR-134, aplicado)
--
-- APLICAR:  node scripts/apply-sql.mjs scripts/forestal-ctp-despacho-origen-migration.sql
-- ENSAYAR:  node scripts/forestal-ctp-despacho-rehearse.mjs   ← corre y REVIERTE
-- ROLLBACK: scripts/forestal-ctp-despacho-origen-rollback.sql (sólo pre-deploy de código)
--
-- IDEMPOTENTE: correr N veces == correr 1 vez.
-- ORDEN: este SQL corre ANTES de tocar prisma/schema.prisma (si no → P2021/P2022).
-- REQUIERE: ADR-134 aplicado (ForestCtpConsumo existe). Verificado en prod 2026-07-15.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ForestCtpDespachoOrigen — puente N:M despacho → producción (ADR-135 D1)
--    1 despacho ← N corridas · 1 corrida → N despachos.
--
--    Las DOS puntas son "ForestCtpEntry": la tabla se referencia a sí misma.
--    Por eso los campos se llaman por su ROL (despachoEntryId / produccionEntryId)
--    y no por su tabla — sin eso, el modelo no se lee.
--
--    `quantity` es DECIMAL(14,4), NO 12,4: está acotada por ForestCtpEntry.quantity,
--    que es Decimal(14,4). Copiar el 12,4 de ForestCtpConsumo (que espeja
--    WoodEntry.volumeM3) haría que una atribución no pudiera representar la
--    cantidad de la línea que la contiene. La precisión se copia de la columna
--    que la ACOTA, no de la tabla que se parece.
--
--    SIN costo propio (ADR-135 D7): el costo del producto despachado se deriva
--    de la corrida atribuida (ForestCtpConsumoDB.costoDeLinea), que YA tiene su
--    congelado al cierre. Un 2º punto de congelado = 2 relojes que se desincronizan.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ForestCtpDespachoOrigen" (
  "id"                TEXT          NOT NULL,
  "tenantId"          TEXT          NOT NULL,  -- denormalizado (regla 3 + detección de fuga)
  "despachoEntryId"   TEXT          NOT NULL,  -- la línea de despacho (section='despacho')
  "produccionEntryId" TEXT          NOT NULL,  -- la corrida de donde salió  (section='produccion')
  "quantity"          DECIMAL(14,4) NOT NULL,  -- cuánto de ESA corrida salió en ESE despacho
  "createdBy"         TEXT          NOT NULL,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForestCtpDespachoOrigen_pkey" PRIMARY KEY ("id"),

  -- Postgres garantiza la FORMA; la capa DB garantiza la POLÍTICA (I4/I5, tenant,
  -- orientación, unidad, producto). Mismo reparto que ADR-134 D3/D7 — no es una
  -- preferencia de estilo: las invariantes son AGREGADAS y el aislamiento de
  -- Buleje es app-level (no RLS). Un CHECK no puede expresar ninguna de las dos.
  CONSTRAINT "ForestCtpDespachoOrigen_quantity_positive" CHECK ("quantity" > 0),

  -- Ésta SÍ la puede Postgres (compara dos columnas de la MISMA fila): una línea
  -- no puede salir de sí misma. Es el único ciclo posible — los de largo >1
  -- los corta el guard de orientación (despacho→producción) en la capa DB.
  CONSTRAINT "ForestCtpDespachoOrigen_no_autoreferencia"
    CHECK ("despachoEntryId" <> "produccionEntryId")
);

-- Una corrida aparece UNA vez por despacho: si sale más de la misma corrida se
-- SUMA en la fila existente, no se agrega otra. (También hace el backfill
-- idempotente vía ON CONFLICT.)
CREATE UNIQUE INDEX IF NOT EXISTS "ForestCtpDespachoOrigen_despacho_produccion_key"
  ON "ForestCtpDespachoOrigen" ("despachoEntryId", "produccionEntryId");

CREATE INDEX IF NOT EXISTS "ForestCtpDespachoOrigen_despachoEntryId_idx"
  ON "ForestCtpDespachoOrigen" ("despachoEntryId");
CREATE INDEX IF NOT EXISTS "ForestCtpDespachoOrigen_tenantId_produccionEntryId_idx"
  ON "ForestCtpDespachoOrigen" ("tenantId", "produccionEntryId");

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Foreign keys — patrón NOT VALID + VALIDATE (zero-downtime, ADR-134)
--
--    CASCADE  en despachoEntryId   → el origen es DETALLE del despacho; sin
--                                     despacho no significa nada.
--    RESTRICT en produccionEntryId → borrar una corrida citada por un despacho
--                                     rompe la cadena de custodia justo en el
--                                     tramo que este ADR viene a cerrar.
--    (Ambas son soft-delete ⇒ casi nunca disparan. Se ponen igual: cuestan cero
--     y son la red para el día que alguien corra un DELETE desde un script.)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ForestCtpDespachoOrigen_despachoEntryId_fkey') THEN
    ALTER TABLE "ForestCtpDespachoOrigen"
      ADD CONSTRAINT "ForestCtpDespachoOrigen_despachoEntryId_fkey"
      FOREIGN KEY ("despachoEntryId") REFERENCES "ForestCtpEntry" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ForestCtpDespachoOrigen_produccionEntryId_fkey') THEN
    ALTER TABLE "ForestCtpDespachoOrigen"
      ADD CONSTRAINT "ForestCtpDespachoOrigen_produccionEntryId_fkey"
      FOREIGN KEY ("produccionEntryId") REFERENCES "ForestCtpEntry" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE "ForestCtpDespachoOrigen" VALIDATE CONSTRAINT "ForestCtpDespachoOrigen_despachoEntryId_fkey";
ALTER TABLE "ForestCtpDespachoOrigen" VALIDATE CONSTRAINT "ForestCtpDespachoOrigen_produccionEntryId_fkey";

-- ─────────────────────────────────────────────────────────────────────────
-- 3. BACKFILL — despacho → corrida (ADR-135 D6)
--
-- Qué hace: para cada línea de DESPACHO viva y registrada, si existe UNA SOLA
-- corrida viva del MISMO producto (productType+especie) y la MISMA unidad, crea
-- el origen. Si hay 2+ candidatas ⇒ NO se escribe nada: cuál de las dos corridas
-- alimentó el despacho es una pregunta que el dato no responde, y en un libro que
-- fiscaliza SERFOR **NULL honesto > FK adivinada** (ADR-134 D1, acá heredado).
--
-- Con match único no se está adivinando, se está DEDUCIENDO: si el libro sólo
-- conoce una corrida de ese producto, el producto despachado salió de ahí o de
-- ningún lado registrado.
--
-- Garantías por construcción (no por esperanza):
--   · I4 (Σ origenes del despacho ≤ despacho.quantity): sólo inserta en despachos
--     SIN origenes previos, con quantity = LEAST(...) ≤ despacho.quantity.
--   · I5 (Σ origenes de la corrida ≤ produccion.quantity): resta lo ya atribuido
--     a esa corrida y exige saldo > 0. Una corrida NO se despacha dos veces.
--   · Idempotente: NOT EXISTS + ON CONFLICT DO NOTHING ⇒ correrlo N veces == 1 vez
--     y NUNCA pisa una atribución hecha por el operador.
--
-- La normalización de abajo ESPEJA `productKey()`/`speciesKey()` de
-- lib/db/forest-ctp.db.ts (trim → lower → colapsar espacios → '—' si vacío).
-- Si divergen, el backfill atribuiría distinto de lo que I3 considera "el mismo
-- producto" y las dos capas se contradirían. Por eso el regexp_replace y no un
-- lower(trim()) a secas.
--
-- MEDIDO EN PROD 2026-07-15 (pooler, ensayo con rollback): 1 despacho candidato
--   ForestCtpEntry(main, despacho, lineNo=1, 'Madera aserrada'·'Tornillo', 4.0000 m3)
--   → única corrida viva del mismo producto:
--     ForestCtpEntry(main, produccion, lineNo=1, 'Madera aserrada'·'Tornillo', 6.2000 m3)
--   ⇒ 1 origen de 4.0000 · I4 con IGUALDAD exacta (sin residuo) · I5 deja 2.2000
--     de la corrida todavía disponibles para el próximo despacho.
-- ─────────────────────────────────────────────────────────────────────────
WITH candidatos AS (
  SELECT
    d."id"       AS despacho_id,
    d."tenantId" AS tenant_id,
    p."id"       AS produccion_id,
    d."quantity" AS despachado,
    -- Saldo de la corrida: lo que produjo menos lo ya atribuido a otros despachos.
    p."quantity" - COALESCE((
      SELECT SUM(o2."quantity") FROM "ForestCtpDespachoOrigen" o2
      WHERE o2."produccionEntryId" = p."id"
    ), 0) AS saldo_corrida
  FROM "ForestCtpEntry" d
  JOIN "ForestCtpEntry" p
    ON  p."tenantId"  = d."tenantId"                    -- aislamiento multi-tenant
    AND p."section"   = 'produccion'                    -- orientación del puente
    AND p."deletedAt" IS NULL
    AND p."status"    = 'registrado'                    -- una corrida anulada no despacha nada
    AND p."quantity" IS NOT NULL AND p."quantity" > 0
    -- mismo producto (espeja productKey) …
    AND COALESCE(NULLIF(lower(regexp_replace(trim(COALESCE(p."productType",   '')), '\s+', ' ', 'g')), ''), '—')
      = COALESCE(NULLIF(lower(regexp_replace(trim(COALESCE(d."productType",   '')), '\s+', ' ', 'g')), ''), '—')
    AND COALESCE(NULLIF(lower(regexp_replace(trim(COALESCE(p."speciesCommon", '')), '\s+', ' ', 'g')), ''), '—')
      = COALESCE(NULLIF(lower(regexp_replace(trim(COALESCE(d."speciesCommon", '')), '\s+', ' ', 'g')), ''), '—')
    -- … y misma unidad: I4/I5 SUMAN quantity. Sumar 3 m³ con 3 pt no da 6 de nada.
    AND COALESCE(p."unit", '') = COALESCE(d."unit", '')
  WHERE d."section"   = 'despacho'
    AND d."deletedAt" IS NULL
    AND d."status"    = 'registrado'
    AND d."quantity" IS NOT NULL AND d."quantity" > 0
    -- Idempotencia + respeto por el operador: sólo despachos todavía sin atribuir.
    AND NOT EXISTS (
      SELECT 1 FROM "ForestCtpDespachoOrigen" o WHERE o."despachoEntryId" = d."id"
    )
    -- D1 heredado: sólo si la corrida candidata es ÚNICA. Empate ⇒ no se escribe.
    AND (
      SELECT COUNT(*) FROM "ForestCtpEntry" p2
      WHERE p2."tenantId"  = d."tenantId"
        AND p2."section"   = 'produccion'
        AND p2."deletedAt" IS NULL
        AND p2."status"    = 'registrado'
        AND p2."quantity" IS NOT NULL AND p2."quantity" > 0
        AND COALESCE(NULLIF(lower(regexp_replace(trim(COALESCE(p2."productType",   '')), '\s+', ' ', 'g')), ''), '—')
          = COALESCE(NULLIF(lower(regexp_replace(trim(COALESCE(d."productType",    '')), '\s+', ' ', 'g')), ''), '—')
        AND COALESCE(NULLIF(lower(regexp_replace(trim(COALESCE(p2."speciesCommon", '')), '\s+', ' ', 'g')), ''), '—')
          = COALESCE(NULLIF(lower(regexp_replace(trim(COALESCE(d."speciesCommon",  '')), '\s+', ' ', 'g')), ''), '—')
        AND COALESCE(p2."unit", '') = COALESCE(d."unit", '')
    ) = 1
)
INSERT INTO "ForestCtpDespachoOrigen" ("id", "tenantId", "despachoEntryId", "produccionEntryId", "quantity", "createdBy")
SELECT
  gen_random_uuid()::text,   -- id: mismo precedente que ADR-134 (UUID en TEXT)
  tenant_id,
  despacho_id,
  produccion_id,
  LEAST(despachado, saldo_corrida),   -- I4 e I5 por construcción
  'backfill:adr-135'                  -- trazable: se distingue de lo cargado a mano, para siempre
FROM candidatos
WHERE saldo_corrida > 0
ON CONFLICT ("despachoEntryId", "produccionEntryId") DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SIGUIENTE PASO (en orden, no negociable — ADR-135 "Plan detallado"):
--   1. node scripts/forestal-ctp-backfill-verify.mjs   ← confirmar antes de seguir
--   2. bloque "Campos nuevos" de docs/adr/135-forestal-ctp-despacho-origen.md
--      → prisma/schema.prisma → npx prisma generate → npx tsc --noEmit
--   3. lib/db/forest-ctp-despacho.db.ts: guards I4/I5 + tenant + orientación +
--      unidad + producto, TODO en una transacción, LOCKEANDO LAS CORRIDAS (el
--      recurso disputado). Postgres no impide nada de eso — medido en el ensayo.
--   4. I3 NO se toca (ADR-135 D2): sigue siendo la invariante del ACTA.
-- ═══════════════════════════════════════════════════════════════════════════
