-- Estados / workflow de documentos (Documentación → drive).
-- Columna aditiva idempotente. Aplicada a la DB de prod (Supabase "Mercado",
-- sofkgguriggocouiuamx) el 2026-07-21 vía el MCP de Supabase (apply_migration
-- "add_document_status_workflow"). Se deja acá para reproducibilidad en otros
-- entornos: `prisma migrate` cuelga en el pooler → aplicar este SQL con DIRECT_URL
-- y luego `npx prisma generate` + reiniciar el dev server.
--
-- Valores de status: none (default) | draft | review | approved | archived.

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'none';
CREATE INDEX IF NOT EXISTS "Document_tenantId_status_idx" ON "Document" ("tenantId", "status");
