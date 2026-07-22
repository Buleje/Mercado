-- Compartir carpeta completa por link público (`/c/{token}`).
-- Tabla nueva idempotente. Aplicada a la DB de prod (Supabase "Mercado",
-- sofkgguriggocouiuamx) el 2026-07-21 vía el MCP de Supabase (apply_migration
-- "add_document_folder_share"). Se deja acá para reproducibilidad: `prisma migrate`
-- cuelga en el pooler → aplicar este SQL con DIRECT_URL, luego `npx prisma generate`
-- + reiniciar el dev server.

CREATE TABLE IF NOT EXISTS "DocumentFolderShare" (
  "id" TEXT PRIMARY KEY,
  "folderId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "password" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accessCount" INTEGER NOT NULL DEFAULT 0,
  "lastAccessAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "DocumentFolderShare_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DocumentFolder"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentFolderShare_token_key" ON "DocumentFolderShare"("token");
CREATE INDEX IF NOT EXISTS "DocumentFolderShare_tenantId_createdAt_idx" ON "DocumentFolderShare"("tenantId","createdAt");
