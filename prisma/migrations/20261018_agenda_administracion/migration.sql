-- ADR-501 · Agenda de Administración. Fase EXPAND (aditiva): 5 tablas nuevas + Note.fecha (NULL).
-- La app vieja de producción no conoce nada de esto y sigue igual. No hay fase contract.
--
-- Ninguna tabla existente se reescribe: las 5 tablas nacen vacías; "Note" suma una columna
-- NULL sin default (sólo catálogo, sin reescritura) y un índice sobre 1 fila (18-10: 1 nota
-- en toda la base), por eso el índice va dentro de la transacción y no CONCURRENTLY.
-- Sin FK a "Tenant" (convención de AdminTask/Asistencia): el aislamiento es el tenantId en
-- cada WHERE de la DB class. Los CHECK no los declara Prisma: son la red de la base debajo
-- del z.enum de lib/agenda/schemas.ts.
--
-- Aplicar (pooler de SESIÓN :5432, una tx, SAVEPOINT por sentencia, SET LOCAL lock_timeout 5s;
-- nunca SET de sesión):
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261018_agenda_administracion/migration.sql --ensayo dotenv_config_path=.env.local
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261018_agenda_administracion/migration.sql dotenv_config_path=.env.local
--   node scripts/migraciones-cruce.mjs --verificar 20261018_agenda_administracion
--   node scripts/prisma-session.mjs migrate resolve --applied 20261018_agenda_administracion
-- Después: `npx prisma generate` y reiniciar el dev server.
--
-- Idempotente: IF NOT EXISTS en tablas, columna e índices; las FK las salta el aplicador
-- («already exists» dentro de su SAVEPOINT). La 2.ª corrida no cambia nada.

CREATE TABLE IF NOT EXISTS "AgendaActividad" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "regla" TEXT NOT NULL DEFAULT 'manual',
  "objetivoTipo" TEXT,
  "objetivoId" TEXT,
  "objetivoNombre" TEXT,
  "frecuencia" TEXT NOT NULL,
  "desde" DATE NOT NULL,
  "hasta" DATE,
  "diasSemana" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "diaMes" INTEGER,
  "cadaN" INTEGER,
  "hora" TEXT,
  "canales" TEXT[] NOT NULL DEFAULT ARRAY['campana']::TEXT[],
  "responsableRol" TEXT,
  "parametros" JSONB NOT NULL DEFAULT '{}',
  "color" TEXT NOT NULL DEFAULT 'info',
  "nota" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" TEXT,
  CONSTRAINT "AgendaActividad_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgendaActividad_regla_chk" CHECK ("regla" IN ('asistencia','facturas','servicio_aserrio','gastos_ingresos','adelantos','cuenta_tercero','manual')),
  CONSTRAINT "AgendaActividad_frecuencia_chk" CHECK ("frecuencia" IN ('una_vez','diaria','semanal','quincenal','mensual','cada_n_dias')),
  CONSTRAINT "AgendaActividad_objetivoTipo_chk" CHECK ("objetivoTipo" IS NULL OR "objetivoTipo" IN ('parte','beneficiario')),
  CONSTRAINT "AgendaActividad_objetivo_par_chk" CHECK (("objetivoTipo" IS NULL) = ("objetivoId" IS NULL)),
  CONSTRAINT "AgendaActividad_diaMes_chk" CHECK ("diaMes" IS NULL OR "diaMes" BETWEEN 1 AND 31),
  CONSTRAINT "AgendaActividad_cadaN_chk" CHECK ("cadaN" IS NULL OR "cadaN" BETWEEN 1 AND 366),
  CONSTRAINT "AgendaActividad_hora_chk" CHECK ("hora" IS NULL OR "hora" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "AgendaActividad_diasSemana_chk" CHECK ("diasSemana" <@ ARRAY[0,1,2,3,4,5,6]),
  CONSTRAINT "AgendaActividad_color_chk" CHECK ("color" IN ('info','success','warning','error','neutral')),
  CONSTRAINT "AgendaActividad_rango_chk" CHECK ("hasta" IS NULL OR "hasta" >= "desde")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgendaActividad_tenantId_id_key" ON "AgendaActividad"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "AgendaActividad_tenantId_activo_idx" ON "AgendaActividad"("tenantId", "activo");

CREATE TABLE IF NOT EXISTS "AgendaOcurrencia" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actividadId" TEXT NOT NULL,
  "fecha" DATE NOT NULL,
  "estado" TEXT NOT NULL,
  "posponerA" DATE,
  "nota" TEXT,
  "marcadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaOcurrencia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgendaOcurrencia_estado_chk" CHECK ("estado" IN ('hecha','omitida','pospuesta')),
  CONSTRAINT "AgendaOcurrencia_posponer_chk" CHECK (("estado" = 'pospuesta') = ("posponerA" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgendaOcurrencia_tenantId_actividadId_fecha_key" ON "AgendaOcurrencia"("tenantId", "actividadId", "fecha");
CREATE INDEX IF NOT EXISTS "AgendaOcurrencia_tenantId_fecha_idx" ON "AgendaOcurrencia"("tenantId", "fecha");
ALTER TABLE "AgendaOcurrencia" ADD CONSTRAINT "AgendaOcurrencia_tenantId_actividadId_fkey"
  FOREIGN KEY ("tenantId", "actividadId") REFERENCES "AgendaActividad"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "AgendaFeedIcs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL DEFAULT 'Agenda del negocio',
  "tokenHash" TEXT NOT NULL,
  "tokenPista" TEXT NOT NULL,
  "incluye" TEXT[] NOT NULL DEFAULT ARRAY['actividades','notas','tareas']::TEXT[],
  "creadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimoUso" TIMESTAMP(3),
  "revocadoEn" TIMESTAMP(3),
  CONSTRAINT "AgendaFeedIcs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgendaFeedIcs_incluye_chk" CHECK ("incluye" <@ ARRAY['actividades','notas','tareas','vencimientos']::TEXT[])
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgendaFeedIcs_tokenHash_key" ON "AgendaFeedIcs"("tokenHash");
CREATE INDEX IF NOT EXISTS "AgendaFeedIcs_tenantId_idx" ON "AgendaFeedIcs"("tenantId");

CREATE TABLE IF NOT EXISTS "AgendaConexionGoogle" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "refreshTokenCifrado" TEXT NOT NULL,
  "calendarId" TEXT,
  "tasklistId" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'activa',
  "ultimoError" TEXT,
  "ultimaSync" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaConexionGoogle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgendaConexionGoogle_estado_chk" CHECK ("estado" IN ('activa','revocada','error'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgendaConexionGoogle_tenantId_adminUserId_key" ON "AgendaConexionGoogle"("tenantId", "adminUserId");

CREATE TABLE IF NOT EXISTS "AgendaGoogleEvento" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conexionId" TEXT NOT NULL,
  "actividadId" TEXT NOT NULL,
  "googleEventId" TEXT,
  "googleTaskId" TEXT,
  "huella" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaGoogleEvento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgendaGoogleEvento_conexionId_actividadId_key" ON "AgendaGoogleEvento"("conexionId", "actividadId");
CREATE INDEX IF NOT EXISTS "AgendaGoogleEvento_tenantId_idx" ON "AgendaGoogleEvento"("tenantId");
ALTER TABLE "AgendaGoogleEvento" ADD CONSTRAINT "AgendaGoogleEvento_conexionId_fkey"
  FOREIGN KEY ("conexionId") REFERENCES "AgendaConexionGoogle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "fecha" DATE;
CREATE INDEX IF NOT EXISTS "Note_tenantId_fecha_idx" ON "Note"("tenantId", "fecha");
