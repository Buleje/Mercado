-- Store.whatsappPublic: WhatsApp público que el dueño configura para el FAB
-- del storefront. Expand-only (nullable, sin default) → cero downtime.
-- IF NOT EXISTS: la columna ya se aplicó vía Supabase MCP el 2026-05-30;
-- esto hace el migrate deploy idempotente (no falla si ya existe).
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "whatsappPublic" TEXT;
