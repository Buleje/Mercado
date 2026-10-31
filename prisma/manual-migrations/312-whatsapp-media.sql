-- 312: WhatsApp Inbox — media entrante (fotos/audios/videos/documentos). Idempotente.
-- mediaId = id del asset en Meta (el binario vive en su CDN ~30 días; se sirve
-- vía proxy autenticado /api/admin/whatsapp/media/[id], sin storage propio).

ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "mediaId" TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "mediaMime" TEXT;
