-- Metas y tareas del panel (ADR-415): de local-data/*.json sin tenantId a dos tablas por tenant.
--
-- Aplicado 2026-09-14 (pooler, script de abajo). EXPAND puro: 2 tablas nuevas y 4 indices. Ningun dato existente
-- cambia y el codigo actual (lib/file-store.ts) no las lee: se puede aplicar antes de subir
-- el codigo que las usa, y la rama prod vieja sigue igual.
--
-- Sin backfill ni escritura doble: medido 2026-09-14, no hay un solo local-data/*.json que
-- copiar (ni en el checkout, ni bajo /home/usuario, ni en las carpetas tipicas de C:\Users),
-- y en Vercel el disco del proyecto es de solo lectura: produccion nunca guardo una meta.
--
-- Las listas cerradas (category, period, priority, status) son CHECK sobre TEXT y no enums:
-- la lista de categorias ya crecio una vez (ticket_promedio, retencion) y va a crecer otra
-- (producto_top). Un CHECK se cambia en dos sentencias; un valor de enum no se puede quitar.
-- La misma lista vive en z.enum dentro de lib/admin/metas-tareas.ts (gate de la API).
--
-- Idempotente CON el script: parte por punto y coma, salta lineas que empiezan con --,
-- autocommit por sentencia, "already exists" = skip. Por eso no hay bloques DO, ni
-- comentarios al final de una linea de SQL, ni punto y coma dentro de un literal.
--
-- Uso: USE_POOLER=1 SQL_FILE=prisma/migrations/adr-415-metas-y-tareas.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local
-- Leer que cada linea con check diga la sentencia esperada.
-- Despues: bloques del ADR-415 en schema.prisma, "adminGoal" y "adminTask" en TENANT_MODELS
-- (lib/tenant.ts), npx prisma generate y reiniciar el dev server.
--
-- Para revertir (SOLO si las dos tablas tienen 0 filas: contar primero):
--   DROP TABLE IF EXISTS "AdminTask"
--   DROP TABLE IF EXISTS "AdminGoal"

-- 1. Metas. target/current en DECIMAL(14,2): hay metas en soles con centimos (ticket promedio).
--    La API los devuelve como number: un Decimal serializado es string y "50000" >= "9000" es false.
CREATE TABLE IF NOT EXISTS "AdminGoal" (
  "id"        TEXT          NOT NULL,
  "tenantId"  TEXT          NOT NULL,
  "name"      TEXT          NOT NULL,
  "category"  TEXT          NOT NULL DEFAULT 'ventas',
  "period"    TEXT          NOT NULL DEFAULT 'mensual',
  "target"    DECIMAL(14,2) NOT NULL,
  "current"   DECIMAL(14,2) NOT NULL DEFAULT 0,
  "unit"      TEXT          NOT NULL DEFAULT 'S/',
  "dueDate"   DATE,
  "createdBy" TEXT          NOT NULL,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminGoal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminGoal_name_chk" CHECK (length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "AdminGoal_category_chk" CHECK ("category" IN ('ventas', 'pedidos', 'clientes', 'productos', 'caja', 'ticket_promedio', 'retencion')),
  CONSTRAINT "AdminGoal_period_chk" CHECK ("period" IN ('diario', 'semanal', 'mensual')),
  CONSTRAINT "AdminGoal_target_chk" CHECK ("target" > 0),
  CONSTRAINT "AdminGoal_current_chk" CHECK ("current" >= 0),
  CONSTRAINT "AdminGoal_unit_chk" CHECK (length(btrim("unit")) BETWEEN 1 AND 20)
);

-- (tenantId, id) unico, como "Puesto": la DB class actualiza y borra con where tenantId_id,
-- asi un id de otro tenant da P2025 en la misma sentencia (sin leer primero).
CREATE UNIQUE INDEX IF NOT EXISTS "AdminGoal_tenantId_id_key"
  ON "AdminGoal" ("tenantId", "id");

-- El GET lista todas las metas del tenant ordenadas por fecha de alta.
CREATE INDEX IF NOT EXISTS "AdminGoal_tenantId_createdAt_idx"
  ON "AdminGoal" ("tenantId", "createdAt");

-- 2. Tareas. completedAt lo pone el SERVIDOR al pasar a completada y lo borra al reabrir:
--    el CHECK impide una tarea completada sin fecha o una pendiente con fecha de cierre.
CREATE TABLE IF NOT EXISTS "AdminTask" (
  "id"          TEXT         NOT NULL,
  "tenantId"    TEXT         NOT NULL,
  "title"       TEXT         NOT NULL,
  "description" TEXT,
  "priority"    TEXT         NOT NULL DEFAULT 'media',
  "status"      TEXT         NOT NULL DEFAULT 'pendiente',
  "assignedTo"  TEXT,
  "module"      TEXT,
  "dueDate"     DATE,
  "completedAt" TIMESTAMP(3),
  "createdBy"   TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminTask_title_chk" CHECK (length(btrim("title")) BETWEEN 1 AND 200),
  CONSTRAINT "AdminTask_priority_chk" CHECK ("priority" IN ('baja', 'media', 'alta', 'urgente')),
  CONSTRAINT "AdminTask_status_chk" CHECK ("status" IN ('pendiente', 'en_progreso', 'completada', 'cancelada')),
  CONSTRAINT "AdminTask_completedAt_chk" CHECK (("status" = 'completada') = ("completedAt" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminTask_tenantId_id_key"
  ON "AdminTask" ("tenantId", "id");

CREATE INDEX IF NOT EXISTS "AdminTask_tenantId_createdAt_idx"
  ON "AdminTask" ("tenantId", "createdAt");

-- 3. Mismos permisos que las tablas hermanas. Medido 2026-09-14: "Note", "Colaborador", "Puesto",
--    "Tenant" y "AdminUser" tienen 0 privilegios para anon/authenticated, y app_user recibe
--    SELECT/INSERT/UPDATE/DELETE por el default ACL de postgres. Nada del codigo lee tablas con
--    supabase-js, asi que revocar no rompe nada. En un Postgres sin los roles de Supabase,
--    saltar estas dos sentencias.
REVOKE ALL ON TABLE "AdminGoal" FROM anon, authenticated;

REVOKE ALL ON TABLE "AdminTask" FROM anon, authenticated;
