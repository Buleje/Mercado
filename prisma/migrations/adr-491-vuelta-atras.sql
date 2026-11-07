-- ADR-491 · VUELTA ATRÁS de adr-491-registro-firmas-adelantos.sql.
-- NO se aplica salvo decisión explícita de Brandon. Solo sirve con el registro
-- VACÍO: una firma o huella guardada es respaldo de plata entregada (y la
-- huella, dato sensible Ley 29733) y no se tira con un rollback de schema.
--
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/adr-491-vuelta-atras.sql --ensayo dotenv_config_path=.env.local
--
-- Una sola tx (el script): si la guarda falla, no se toca nada. Si ya se
-- revirtió, la guarda falla con «does not exist»: no queda nada que hacer.
-- Después: sacar los modelos del schema.prisma, `npx prisma generate` y
-- reiniciar el dev server.

-- Guardas: división por cero = aborta la tx si quedó algo que se perdería.
SELECT 1 / (CASE WHEN EXISTS (SELECT 1 FROM "AdelantoFirma") THEN 0 ELSE 1 END) AS "registro_de_firmas_vacio";

SELECT 1 / (CASE WHEN EXISTS (SELECT 1 FROM "AdelantoEnlaceFirma") THEN 0 ELSE 1 END) AS "enlaces_de_firma_vacios";

SELECT 1 / (CASE WHEN EXISTS (SELECT 1 FROM "Settings" WHERE "adelantoTopeCajero" IS NOT NULL) THEN 0 ELSE 1 END) AS "ningun_tope_configurado";

DROP TRIGGER IF EXISTS "AdelantoFirma_sin_truncate" ON "AdelantoFirma";

DROP TRIGGER IF EXISTS "AdelantoFirma_inmutable" ON "AdelantoFirma";

DROP FUNCTION IF EXISTS "adelanto_firma_inmutable"();

DROP TABLE IF EXISTS "AdelantoFirma";

DROP TABLE IF EXISTS "AdelantoEnlaceFirma";

DROP TYPE IF EXISTS "AdelantoFirmaCanal";

DROP TYPE IF EXISTS "AdelantoFirmaTipo";

DROP INDEX IF EXISTS "Adelanto_tenantId_id_key";

ALTER TABLE "Settings" DROP COLUMN IF EXISTS "adelantoTopeCajero";
