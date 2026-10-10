-- ADR-312 — sello de verificación de la GTF de salida contra SERFOR.
-- Idempotente (se aplica con scripts/apply-sql.mjs; el pooler no admite migrate).
-- Después: `npx prisma generate` + REINICIAR el dev server.

ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "serforNumeroRegistro" TEXT;
ALTER TABLE "ForestCtpEntry" ADD COLUMN IF NOT EXISTS "serforVerificadoEn" TIMESTAMP(3);
