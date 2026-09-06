-- Contenido rico de producto (estilo Amazon) · 2026-07-03
-- Expand-only, aditivo, idempotente. Aplicable con pooler (DATABASE_URL).
-- Luego: agregar a prisma/schema.prisma → prisma generate → reiniciar dev.

-- Ficha técnica editable: pares { label, value } cargados por el vendedor.
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "specsJson" TEXT;

-- Contenido rico A+: bloques { heading?, body?, imageUrl? } (infografías).
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "richContentJson" TEXT;
