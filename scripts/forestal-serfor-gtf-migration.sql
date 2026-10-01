-- Ficha oficial de la GTF consultada en SERFOR, guardada con el ingreso.
--
-- El libro ya guarda el N° de guía, pero la consulta pública del SNIFFS devuelve
-- el documento COMPLETO (titular, propietario, destinatario, transportista,
-- placa, detalle de productos y lista de trozas). Guardarlo permite reimprimir
-- la GTF y probar de dónde salió cada dato, sin volver a consultar un servicio
-- de terceros que puede estar caído el día de la fiscalización.
--
-- JSONB y no 30 columnas: es el cuerpo de un documento ajeno cuyo formato lo
-- decide SERFOR; ninguno de esos campos se filtra ni se suma.
--
-- Idempotente. Aplicar vía scripts/apply-sql.mjs; luego `prisma generate` +
-- REINICIAR el dev server.
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "serforGtf" JSONB;
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "serforNumeroRegistro" TEXT;

CREATE INDEX IF NOT EXISTS "WoodEntry_tenantId_serforNumeroRegistro_idx"
  ON "WoodEntry" ("tenantId", "serforNumeroRegistro");
