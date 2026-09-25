-- ADR-311 — Paridad de campos con el formato oficial del LO-CTP (SERFOR).
--
-- Cinco columnas en el ingreso y dos en la salida, nombradas por la columna del
-- formato que cubren. Todas nullables: los ingresos ya cargados no tienen esos
-- datos y el libro no puede rechazar lo que ya está registrado.
--
-- Idempotente. Aplicar vía scripts/apply-sql.mjs (pooler); luego `prisma generate`
-- + REINICIAR el dev server (el cliente Prisma viejo no conoce las columnas).

-- ── Ingreso de materia prima (WoodEntry) ────────────────────────────────────
-- (1) N° Registro del libro de operaciones — folio correlativo por tenant.
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "libroNro" INTEGER;
-- (3) Tipo de documento: GTF | GRR.
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "docType" TEXT DEFAULT 'GTF';
-- (5) N° Fuente de origen / procedencia (ej. "RD-SD-549").
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "originSourceNumber" TEXT;
-- (9) Código de CTP — sólo cuando la materia prima llega de OTRO CTP.
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "originCtpCode" TEXT;
-- (10) Unidad de medida declarada en el documento (el libro calcula en m³).
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "unit" TEXT DEFAULT 'm3';

-- Folio: el orden del libro es el cronológico de los hechos, no el de inserción
-- en la base. Se backfillea una sola vez (WHERE libroNro IS NULL) para que
-- re-correr el script no renumere un libro ya foliado.
WITH numerados AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "tenantId"
           ORDER BY "entryDate" ASC, "createdAt" ASC, id ASC
         ) AS folio
    FROM "WoodEntry"
   WHERE "libroNro" IS NULL
)
UPDATE "WoodEntry" w
   SET "libroNro" = n.folio
  FROM numerados n
 WHERE w.id = n.id;

-- Buscar por folio dentro del tenant (el libro se consulta "traeme el N° 128").
CREATE INDEX IF NOT EXISTS "WoodEntry_tenantId_libroNro_idx"
  ON "WoodEntry" ("tenantId", "libroNro");

-- ── Salida de producto (ForestCtpEntry, section='despacho') ─────────────────
-- (3) Tipo de documento con el que sale: GTF | GRR.
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "docType" TEXT;
-- (7) Código del producto/lote que sale (ej. "1-13-51-A-1").
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "codigoProducto" TEXT;
