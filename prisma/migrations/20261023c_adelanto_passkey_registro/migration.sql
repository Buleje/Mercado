-- ADR-513 (revisión de seguridad 23-10) — de dónde salió cada passkey.
--
-- EXPAND puro: 3 columnas NULLABLE en "AdelantoPasskey" (las 2 filas que ya
-- existen, de QA, quedan en null):
--   "enlaceId"           el enlace de firma con que se registró la llave. Si la
--                        persona firma con ese MISMO enlace, la constancia y el
--                        papel lo dicen (prueba más débil que una llave
--                        registrada antes, con otro enlace). Sin FK: es un rastro,
--                        y el enlace nunca se borra desde la app.
--   "registroIp"         la IP del pedido que la registró (rastro, Ley 29733:
--                        dato de auditoría, no sale a la ficha).
--   "registroUserAgent"  el navegador que la registró; la ficha muestra el
--                        sistema que DECLARA ese navegador, rotulado así.
--
-- El Prisma viejo de producción no lee estas columnas.
-- Revertir: DROP de las 3 columnas.
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261023c_adelanto_passkey_registro/migration.sql dotenv_config_path=.env.local

ALTER TABLE "AdelantoPasskey" ADD COLUMN IF NOT EXISTS "enlaceId" TEXT;
ALTER TABLE "AdelantoPasskey" ADD COLUMN IF NOT EXISTS "registroIp" TEXT;
ALTER TABLE "AdelantoPasskey" ADD COLUMN IF NOT EXISTS "registroUserAgent" TEXT;
