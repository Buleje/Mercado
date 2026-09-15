-- ADR-313 — los dos extremos del tronco, no sólo el promedio.
-- Idempotente. Después: `npx prisma generate` + REINICIAR el dev server.

ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "d1Cm" DECIMAL(8,2);
ALTER TABLE "WoodEntryTroza" ADD COLUMN IF NOT EXISTS "d2Cm" DECIMAL(8,2);

-- Backfill desde el texto que publica SERFOR ("73.0 X 58.0 X 9.7" = d1 X d2 X largo).
-- Sólo donde el formato calza exacto: una fila que no matchee se deja en NULL en
-- vez de adivinarle los números.
UPDATE "WoodEntryTroza"
SET "d1Cm"  = NULLIF(split_part(replace(upper("dimensiones"), ' ', ''), 'X', 1), '')::numeric,
    "d2Cm"  = NULLIF(split_part(replace(upper("dimensiones"), ' ', ''), 'X', 2), '')::numeric
WHERE "d1Cm" IS NULL
  AND "dimensiones" ~ '^\s*[0-9]+(\.[0-9]+)?\s*[xX]\s*[0-9]+(\.[0-9]+)?\s*[xX]\s*[0-9]+(\.[0-9]+)?\s*$';
