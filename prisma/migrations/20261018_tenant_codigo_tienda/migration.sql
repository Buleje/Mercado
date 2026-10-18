-- ADR-500 · ID único de cada tienda: `Tenant.codigo`, 6 dígitos aleatorios
-- (100000-999999) para dictar por WhatsApp («ID 482-917») y buscar desde el
-- superadmin. Fase EXPAND (aditiva): la app vieja de producción no conoce la
-- columna y sus altas de tienda la reciben igual por el DEFAULT.
--
-- Aplicar (pooler de SESIÓN :5432, una tx, SAVEPOINT por sentencia,
-- SET LOCAL lock_timeout 5s; nunca un SET de sesión):
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261018_tenant_codigo_tienda/migration.sql --ensayo dotenv_config_path=.env.local
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261018_tenant_codigo_tienda/migration.sql dotenv_config_path=.env.local
--   node scripts/migraciones-cruce.mjs --verificar 20261018_tenant_codigo_tienda
--   node scripts/prisma-session.mjs migrate resolve --applied 20261018_tenant_codigo_tienda
-- Después: `npx prisma generate` y reiniciar el dev server.
--
-- Orden pensado para el candado: "Tenant" se lee en cada request y el
-- ADD COLUMN toma ACCESS EXCLUSIVE hasta el COMMIT. Por eso la función va
-- PRIMERO (no toca la tabla: plpgsql no valida el cuerpo al crearla) y lo que
-- sí la toca va junto y al final. 15 filas → el backfill, el NOT NULL y el
-- índice tardan milisegundos.
--
-- Aleatorio y no correlativo: un correlativo deja ver cuántas tiendas hay.
-- Choque (1 en 900.000 por alta): la función reintenta; si dos altas
-- simultáneas sacan el mismo número, el índice único corta la segunda (P2002
-- con target "codigo") y basta reintentar el alta.
--
-- Vuelta atrás (fase contract inversa, sólo si nadie lee la columna):
--   ALTER TABLE "Tenant" ALTER COLUMN "codigo" DROP DEFAULT; luego soltar el
--   índice, la columna y la función (a mano, el guard bloquea DROP en scripts).

CREATE OR REPLACE FUNCTION generar_codigo_tienda() RETURNS text
LANGUAGE plpgsql VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  candidato text;
  intento int := 0;
BEGIN
  LOOP
    intento := intento + 1;
    candidato := (100000 + floor(random() * 900000))::int::text;
    IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE "codigo" = candidato) THEN
      RETURN candidato;
    END IF;
    IF intento >= 50 THEN
      RAISE EXCEPTION 'generar_codigo_tienda: sin código libre tras % intentos', intento;
    END IF;
  END LOOP;
END;
$$;

-- La función no es una API: nadie fuera del dueño (postgres = la app) la llama.
REVOKE ALL ON FUNCTION generar_codigo_tienda() FROM PUBLIC, anon, authenticated;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "codigo" TEXT;

-- Backfill fila por fila: cada UPDATE es su propio comando, así la función ve
-- los códigos que ya repartió en esta misma vuelta (un UPDATE masivo no).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT "id" FROM "Tenant" WHERE "codigo" IS NULL ORDER BY "createdAt" LOOP
    UPDATE "Tenant" SET "codigo" = generar_codigo_tienda() WHERE "id" = r."id";
  END LOOP;
END;
$$;

ALTER TABLE "Tenant" ALTER COLUMN "codigo" SET DEFAULT generar_codigo_tienda();

ALTER TABLE "Tenant" ALTER COLUMN "codigo" SET NOT NULL;

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_codigo_formato" CHECK ("codigo" ~ '^[1-9][0-9]{5}$');

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_codigo_key" ON "Tenant"("codigo");
