-- ADR-516 — Código único y correlativo por documento (Brandon 24-10).
--
-- Todo aditivo y nullable: la producción vieja (16-07) no conoce estas columnas
-- y sigue leyendo y escribiendo `Document` igual. El trigger le pone código
-- también a lo que ella inserte, así no quedan huecos sin numerar.
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs <este .sql> [--ensayo] dotenv_config_path=.env.local
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE (2.ª corrida = «0 nuevas»).
-- NO numera los documentos existentes: eso lo hace el relleno
-- (`scripts/documentos-codigo-relleno.mjs --tenant <id>`), negocio por negocio.

-- 1. Columnas en Document.
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "codigo" INTEGER;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "codigoFisicoAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "codigoFisicoPor" TEXT;

-- 2. Un código no se repite dentro del negocio (NULL repetible: fotos de máquina
--    y negocios todavía sin relleno). ~800 filas en total: sin CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS "Document_tenantId_codigo_key" ON "Document"("tenantId", "codigo");

-- 3. Contador por negocio: el último código entregado. Sólo sube.
CREATE TABLE IF NOT EXISTS "DocumentCodigoContador" (
    "tenantId" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentCodigoContador_pkey" PRIMARY KEY ("tenantId")
);

-- 4. Asignación en el INSERT (misma transacción que crea el documento).
--    · `codigo` ya viene (restaurar un respaldo) → se respeta y el contador
--      sube hasta él si hacía falta: el contador nunca queda debajo de un código.
--    · Foto de máquina (etiquetas = TAGS_FOTOS_DE_MAQUINA en
--      lib/documents/fotos-de-maquina.ts; un test fija que coincidan) → sin código.
--    · Negocio con contador → ultimo + 1. El candado de la fila del contador
--      serializa dos altas simultáneas: nunca sale el mismo número dos veces.
--    · Negocio sin contador:
--        - con papeles sin numerar (viejo, sin relleno) → sin código; el relleno
--          los numera a todos en orden de subida.
--        - sin papeles por numerar (negocio nuevo) → crea el contador y arranca en 1.
CREATE OR REPLACE FUNCTION "documento_asignar_codigo"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."codigo" IS NOT NULL THEN
    UPDATE "DocumentCodigoContador"
       SET "ultimo" = NEW."codigo", "updatedAt" = CURRENT_TIMESTAMP
     WHERE "tenantId" = NEW."tenantId" AND "ultimo" < NEW."codigo";
    RETURN NEW;
  END IF;
  IF NEW."tags" && ARRAY['personas', 'asistencia']::TEXT[] THEN
    RETURN NEW;
  END IF;

  UPDATE "DocumentCodigoContador"
     SET "ultimo" = "ultimo" + 1, "updatedAt" = CURRENT_TIMESTAMP
   WHERE "tenantId" = NEW."tenantId"
  RETURNING "ultimo" INTO NEW."codigo";
  IF FOUND THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Document"
     WHERE "tenantId" = NEW."tenantId"
       AND "codigo" IS NULL
       AND NOT ("tags" && ARRAY['personas', 'asistencia']::TEXT[])
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO "DocumentCodigoContador" ("tenantId", "ultimo")
  VALUES (NEW."tenantId", 0)
  ON CONFLICT ("tenantId") DO NOTHING;

  UPDATE "DocumentCodigoContador"
     SET "ultimo" = "ultimo" + 1, "updatedAt" = CURRENT_TIMESTAMP
   WHERE "tenantId" = NEW."tenantId"
  RETURNING "ultimo" INTO NEW."codigo";
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE TRIGGER "documento_asignar_codigo"
  BEFORE INSERT ON "Document"
  FOR EACH ROW EXECUTE FUNCTION "documento_asignar_codigo"();
