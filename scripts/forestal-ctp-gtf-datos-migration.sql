-- ADR-309 — Cuerpo de la GTF de salida: propietario del producto, destinatario,
-- transportista, vehículo, traslado y títulos de la guía.
--
-- JSONB y no ~20 columnas: son los campos de un documento cuyo formato lo fija una
-- RDE del SERFOR (puede cambiar), y ninguno se filtra, agrupa ni suma. La forma la
-- valida `gtfDatosSchema` (Zod) antes de escribir.
--
-- Idempotente. Aplicar vía scripts/apply-sql.mjs (pooler); luego `prisma generate`
-- + reiniciar el dev server (el cliente Prisma viejo no conoce la columna).
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "gtfDatos" JSONB;
