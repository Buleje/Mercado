-- ─────────────────────────────────────────────────────────────────────────────
-- RLS TD-116 · Rol runtime SIN bypass (audit 2026-06-10)
--
-- El rol `postgres` (conexión actual de la app) tiene rolbypassrls=true →
-- las políticas RLS no le aplican. Este rol `buleje_app` NO bypasea: cuando
-- la app conecte con él, los paths migrados a withRlsTx quedan protegidos
-- a nivel Postgres (defensa en profundidad bajo el guard app-level).
--
-- La password NO vive en este archivo: se pasa como variable psql.
-- APLICAR:
--   PASS=$(openssl rand -base64 24)
--   psql "$DIRECT_URL" -v app_pass="'$PASS'" \
--     -f prisma/manual-scripts/MANUAL-rls-role-buleje-app-2026-06-10.sql
--   (guardar $PASS en el secret manager / .env.local como BULEJE_APP_DATABASE_URL)
-- ROLLBACK: DROP OWNED BY buleje_app; DROP ROLE buleje_app;
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'buleje_app') THEN
    EXECUTE 'CREATE ROLE buleje_app LOGIN NOBYPASSRLS';
  END IF;
END $$;

ALTER ROLE buleje_app WITH PASSWORD :app_pass;

GRANT USAGE ON SCHEMA public TO buleje_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO buleje_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO buleje_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO buleje_app;

-- Objetos futuros creados por postgres también quedan accesibles
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO buleje_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO buleje_app;

COMMIT;
