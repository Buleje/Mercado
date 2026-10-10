-- ADR-488: Metas por area con avance derivado.
--
-- Solo amplia las dos listas cerradas de "AdminGoal" (ADR-415). Nueva lista contiene a la vieja:
-- ninguna fila que hoy cumple deja de cumplir. No crea columnas, no toca datos, no toca indices.
-- Repetible con cualquier ejecutor: cada CHECK se borra con IF EXISTS y se vuelve a crear con el
-- MISMO nombre, dentro de la misma transaccion. Correrlo dos veces deja la base igual.
--
-- Medido 2026-10-09 (solo lectura, scripts/sql-lectura.mjs): "AdminGoal" tiene 0 filas en toda la
-- base y sus 6 CHECK son los de adr-415-metas-y-tareas.sql. El ADD CONSTRAINT valida la tabla
-- entera bajo ACCESS EXCLUSIVE: con 0 filas son milisegundos.
--
-- La misma lista vive en z.enum dentro de lib/admin/metas-tareas.ts (CATEGORIAS_META y
-- PERIODOS_META) y en el catalogo lib/admin/metas-catalogo.ts: una categoria nueva cambia los tres.
--
-- Aplicar (pooler de SESION :5432, una transaccion, SET LOCAL lock_timeout 5s, nunca SET SESSION):
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/adr-488-metas-por-area.sql --ensayo dotenv_config_path=.env.local
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/adr-488-metas-por-area.sql dotenv_config_path=.env.local
-- Archivo suelto como adr-415 (no carpeta de Prisma): no lleva prisma migrate resolve.
-- Solo despues de la revision de security. Revisar sin ejecutar: node scripts/apply-sql.mjs <este archivo> --dry-run
-- Estado 2026-10-09 15:15: los dos CHECK de abajo YA estan en la base (pg_get_constraintdef); correrlo de nuevo no cambia nada.
--
-- Vuelta atras (solo si ninguna fila usa un valor nuevo): recrear los dos CHECK con la lista de
-- adr-415-metas-y-tareas.sql. Contar antes con:
--   SELECT count(*) FROM "AdminGoal" WHERE "category" NOT IN ('ventas','pedidos','clientes','productos','caja','ticket_promedio','retencion') OR "period" NOT IN ('diario','semanal','mensual')

ALTER TABLE "AdminGoal" DROP CONSTRAINT IF EXISTS "AdminGoal_category_chk";

ALTER TABLE "AdminGoal" ADD CONSTRAINT "AdminGoal_category_chk" CHECK ("category" IN (
  'ventas', 'pedidos', 'clientes', 'productos', 'caja', 'ticket_promedio', 'retencion',
  'fiados_cobrados', 'compras', 'gastos',
  'marketplace_ventas', 'marketplace_pedidos',
  'madera_ingresada', 'produccion', 'despacho', 'venta_madera', 'cubicacion', 'cubicador',
  'loth_tala', 'loth_trozado',
  'tareas', 'manual'
));

ALTER TABLE "AdminGoal" DROP CONSTRAINT IF EXISTS "AdminGoal_period_chk";

ALTER TABLE "AdminGoal" ADD CONSTRAINT "AdminGoal_period_chk" CHECK ("period" IN (
  'diario', 'semanal', 'mensual', 'trimestral', 'anual'
));

-- Verificacion (solo lectura):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = '"AdminGoal"'::regclass AND conname IN ('AdminGoal_category_chk','AdminGoal_period_chk')
