-- Recursos Humanos (ADR-414): personal, puestos, tarifa de referencia versionada
-- y asistencia diaria. Los contratos se vinculan con una columna nueva en "Contract".
--
-- APLICADA en Supabase 2026-09-14 (verificado contra information_schema: las 4
-- tablas, los 3 enums y Contract.colaboradorId existen). Reintentarla es seguro
-- (idempotente, ver abajo) si hace falta correrla de nuevo en otro entorno.
--
-- EXPAND puro: 3 tipos enum, 4 tablas nuevas y 1 columna nullable en "Contract".
-- Ningun dato existente cambia y el codigo actual no lee nada de esto.
--
-- Idempotente CON el script de abajo: parte el archivo por punto y coma, corre
-- cada sentencia en autocommit y salta las que responden "already exists".
-- Por eso no hay bloques DO, ni comentarios al final de una linea de SQL, ni
-- punto y coma dentro de un literal. Si algo falla a mitad, se vuelve a correr
-- el archivo entero.
--
-- Para revertir, en este orden: quitar el indice y la columna "Contract"."colaboradorId",
-- las tablas "Asistencia", "ColaboradorTarifa", "Colaborador" y "Puesto", y los tipos
-- "AsistenciaEstado", "ColaboradorEstado" y "TarifaModalidad".
--
-- Uso: USE_POOLER=1 SQL_FILE=prisma/migrations/adr-414-recursos-humanos.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local
-- Leer que cada linea con check diga la sentencia esperada.
-- Despues: npx prisma generate y reiniciar el dev server.

-- 1. Tipos. Sin IF NOT EXISTS (Postgres no lo tiene para CREATE TYPE): la segunda
--    corrida responde "already exists" y el script la salta.
CREATE TYPE "ColaboradorEstado" AS ENUM ('ACTIVO', 'VACACIONES', 'LICENCIA', 'SUSPENDIDO', 'CESADO');

CREATE TYPE "AsistenciaEstado" AS ENUM ('PRESENTE', 'TARDANZA', 'MEDIO_DIA', 'FALTA', 'PERMISO', 'DESCANSO', 'VACACIONES');

CREATE TYPE "TarifaModalidad" AS ENUM ('HORA', 'DIA', 'SEMANA', 'MES', 'SIN_PAGO');

-- 2. Puestos. La tarifa es SUGERIDA: prellena la de la persona, nunca entra al calculo.
--    Las CHECK son la red: una tarifa a medias o "sin pago" como sugerencia no puede existir.
CREATE TABLE IF NOT EXISTS "Puesto" (
  "id"              TEXT              NOT NULL,
  "tenantId"        TEXT              NOT NULL,
  "nombre"          TEXT              NOT NULL,
  "descripcion"     TEXT,
  "tarifaModalidad" "TarifaModalidad",
  "tarifaMonto"     DECIMAL(12,2),
  "horasJornada"    DECIMAL(4,2)      NOT NULL DEFAULT 8,
  "orden"           INTEGER           NOT NULL DEFAULT 0,
  "createdBy"       TEXT              NOT NULL,
  "createdAt"       TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"       TIMESTAMP(3),
  CONSTRAINT "Puesto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Puesto_nombre_chk" CHECK (length(btrim("nombre")) > 0),
  CONSTRAINT "Puesto_tarifa_chk" CHECK (
    ("tarifaModalidad" IS NULL AND "tarifaMonto" IS NULL)
    OR ("tarifaModalidad" <> 'SIN_PAGO' AND "tarifaMonto" > 0)
  ),
  CONSTRAINT "Puesto_horas_chk" CHECK ("horasJornada" > 0 AND "horasJornada" <= 24)
);

-- (tenantId, id) unico: destino de la FK compuesta desde "Colaborador".
CREATE UNIQUE INDEX IF NOT EXISTS "Puesto_tenantId_id_key"
  ON "Puesto" ("tenantId", "id");

-- Sin mayusculas y entre vivos: "Motosierrista" y "MOTOSIERRISTA " son el mismo puesto.
CREATE UNIQUE INDEX IF NOT EXISTS "Puesto_tenantId_nombre_vivo_key"
  ON "Puesto" ("tenantId", lower(btrim("nombre")))
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Puesto_tenantId_deletedAt_idx"
  ON "Puesto" ("tenantId", "deletedAt");

-- 3. La persona. Lo bancario vive en su AdelantoBeneficiario vinculado, no aca.
--    beneficiarioId y adminUserId son texto sin FK (otros modulos), leidos siempre con tenantId.
CREATE TABLE IF NOT EXISTS "Colaborador" (
  "id"                        TEXT                NOT NULL,
  "tenantId"                  TEXT                NOT NULL,
  "nombre"                    TEXT                NOT NULL,
  "apodo"                     TEXT,
  "tipoDocumento"             TEXT,
  "documento"                 TEXT,
  "celular"                   TEXT,
  "direccion"                 TEXT,
  "contactoEmergenciaNombre"  TEXT,
  "contactoEmergenciaCelular" TEXT,
  "puestoId"                  TEXT,
  "estado"                    "ColaboradorEstado" NOT NULL DEFAULT 'ACTIVO',
  "fechaIngreso"              DATE,
  "fechaCese"                 DATE,
  "motivoCese"                TEXT,
  "observaciones"             TEXT,
  "beneficiarioId"            TEXT,
  "adminUserId"               TEXT,
  "createdBy"                 TEXT                NOT NULL,
  "createdAt"                 TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"                 TIMESTAMP(3),
  CONSTRAINT "Colaborador_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Colaborador_nombre_chk" CHECK (length(btrim("nombre")) > 0),
  CONSTRAINT "Colaborador_documento_chk" CHECK (
    "documento" IS NULL
    OR ("tipoDocumento" IN ('DNI', 'CE', 'PASAPORTE', 'OTRO') AND "documento" ~ '^[A-Z0-9]{4,20}$')
  ),
  CONSTRAINT "Colaborador_dni_chk" CHECK (
    "documento" IS NULL OR "tipoDocumento" IS DISTINCT FROM 'DNI' OR "documento" ~ '^[0-9]{8}$'
  ),
  CONSTRAINT "Colaborador_cese_chk" CHECK (("estado" = 'CESADO') = ("fechaCese" IS NOT NULL)),
  CONSTRAINT "Colaborador_fechas_chk" CHECK (
    "fechaCese" IS NULL OR "fechaIngreso" IS NULL OR "fechaCese" >= "fechaIngreso"
  )
);

-- (tenantId, id) unico: destino de las FK compuestas desde tarifas y asistencia.
CREATE UNIQUE INDEX IF NOT EXISTS "Colaborador_tenantId_id_key"
  ON "Colaborador" ("tenantId", "id");

-- Un documento, una persona viva. Sin el tipo: el cruce con Adelantos tampoco lo mira.
-- Los NULL no chocan (personas sin documento). Un cesado sigue vivo: vuelve por reingreso.
CREATE UNIQUE INDEX IF NOT EXISTS "Colaborador_tenantId_documento_vivo_key"
  ON "Colaborador" ("tenantId", "documento")
  WHERE "deletedAt" IS NULL AND "documento" IS NOT NULL;

-- Una cuenta de Adelantos, una persona viva (mismo criterio que ADR-412b).
CREATE UNIQUE INDEX IF NOT EXISTS "Colaborador_tenantId_beneficiarioId_vivo_key"
  ON "Colaborador" ("tenantId", "beneficiarioId")
  WHERE "deletedAt" IS NULL AND "beneficiarioId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Colaborador_tenantId_adminUserId_vivo_key"
  ON "Colaborador" ("tenantId", "adminUserId")
  WHERE "deletedAt" IS NULL AND "adminUserId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Colaborador_tenantId_estado_idx"
  ON "Colaborador" ("tenantId", "estado");

CREATE INDEX IF NOT EXISTS "Colaborador_tenantId_nombre_idx"
  ON "Colaborador" ("tenantId", "nombre");

CREATE INDEX IF NOT EXISTS "Colaborador_tenantId_puestoId_idx"
  ON "Colaborador" ("tenantId", "puestoId");

-- FK compuesta: el puesto tiene que ser del MISMO negocio. Con puestoId NULL no se verifica.
ALTER TABLE "Colaborador"
  ADD CONSTRAINT "Colaborador_tenantId_puestoId_fkey"
  FOREIGN KEY ("tenantId", "puestoId") REFERENCES "Puesto" ("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Tarifa de referencia, versionada. Las filas no se editan: corregir es baja
--    logica mas fila nueva. SIN_PAGO con monto 0 significa "desde esta fecha no gana".
CREATE TABLE IF NOT EXISTS "ColaboradorTarifa" (
  "id"            TEXT              NOT NULL,
  "tenantId"      TEXT              NOT NULL,
  "colaboradorId" TEXT              NOT NULL,
  "modalidad"     "TarifaModalidad" NOT NULL,
  "monto"         DECIMAL(12,2)     NOT NULL,
  "moneda"        TEXT              NOT NULL DEFAULT 'PEN',
  "horasJornada"  DECIMAL(4,2)      NOT NULL DEFAULT 8,
  "vigenteDesde"  DATE              NOT NULL,
  "motivo"        TEXT,
  "createdBy"     TEXT              NOT NULL,
  "createdAt"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"     TIMESTAMP(3),
  "deletedBy"     TEXT,
  CONSTRAINT "ColaboradorTarifa_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ColaboradorTarifa_monto_chk" CHECK (
    ("modalidad" = 'SIN_PAGO' AND "monto" = 0)
    OR ("modalidad" <> 'SIN_PAGO' AND "monto" > 0)
  ),
  CONSTRAINT "ColaboradorTarifa_moneda_chk" CHECK ("moneda" = 'PEN'),
  CONSTRAINT "ColaboradorTarifa_horas_chk" CHECK ("horasJornada" > 0 AND "horasJornada" <= 24)
);

-- Una version viva por persona y fecha: guardar otra vez la misma fecha corrige esa version.
CREATE UNIQUE INDEX IF NOT EXISTS "ColaboradorTarifa_vigenteDesde_vivo_key"
  ON "ColaboradorTarifa" ("tenantId", "colaboradorId", "vigenteDesde")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "ColaboradorTarifa_tenantId_colaboradorId_vigenteDesde_idx"
  ON "ColaboradorTarifa" ("tenantId", "colaboradorId", "vigenteDesde");

ALTER TABLE "ColaboradorTarifa"
  ADD CONSTRAINT "ColaboradorTarifa_tenantId_colaboradorId_fkey"
  FOREIGN KEY ("tenantId", "colaboradorId") REFERENCES "Colaborador" ("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Asistencia. Horas de pared en minutos desde las 00:00 de Lima. Corregir es dar
--    de baja la viva con reemplazadaPorId y crear otra: el historial del dia son sus filas.
CREATE TABLE IF NOT EXISTS "Asistencia" (
  "id"               TEXT               NOT NULL,
  "tenantId"         TEXT               NOT NULL,
  "colaboradorId"    TEXT               NOT NULL,
  "fecha"            DATE               NOT NULL,
  "estado"           "AsistenciaEstado" NOT NULL,
  "entradaMin"       INTEGER,
  "salidaMin"        INTEGER,
  "refrigerioMin"    INTEGER            NOT NULL DEFAULT 0,
  "horas"            DECIMAL(4,2),
  "nota"             TEXT,
  "origen"           TEXT               NOT NULL DEFAULT 'manual',
  "marcadoPor"       TEXT               NOT NULL,
  "createdAt"        TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"        TIMESTAMP(3),
  "deletedBy"        TEXT,
  "reemplazadaPorId" TEXT,
  "motivoCorreccion" TEXT,
  CONSTRAINT "Asistencia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Asistencia_entrada_chk" CHECK ("entradaMin" IS NULL OR ("entradaMin" >= 0 AND "entradaMin" < 1440)),
  CONSTRAINT "Asistencia_salida_chk" CHECK ("salidaMin" IS NULL OR ("salidaMin" >= 0 AND "salidaMin" < 1440)),
  CONSTRAINT "Asistencia_turno_chk" CHECK ("entradaMin" IS NULL OR "salidaMin" IS NULL OR "salidaMin" > "entradaMin"),
  CONSTRAINT "Asistencia_refrigerio_chk" CHECK ("refrigerioMin" >= 0 AND "refrigerioMin" <= 240),
  CONSTRAINT "Asistencia_horas_chk" CHECK ("horas" IS NULL OR ("horas" > 0 AND "horas" <= 24)),
  CONSTRAINT "Asistencia_horas_estado_chk" CHECK (
    "estado" IN ('PRESENTE', 'TARDANZA', 'MEDIO_DIA')
    OR ("entradaMin" IS NULL AND "salidaMin" IS NULL AND "horas" IS NULL)
  ),
  CONSTRAINT "Asistencia_origen_chk" CHECK ("origen" IN ('manual', 'masivo')),
  CONSTRAINT "Asistencia_reemplazo_chk" CHECK ("reemplazadaPorId" IS NULL OR "deletedAt" IS NOT NULL)
);

-- Una marca viva por persona y dia. Las reemplazadas y las quitadas no chocan.
CREATE UNIQUE INDEX IF NOT EXISTS "Asistencia_tenantId_colaboradorId_fecha_vivo_key"
  ON "Asistencia" ("tenantId", "colaboradorId", "fecha")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Asistencia_tenantId_fecha_idx"
  ON "Asistencia" ("tenantId", "fecha");

CREATE INDEX IF NOT EXISTS "Asistencia_tenantId_colaboradorId_fecha_idx"
  ON "Asistencia" ("tenantId", "colaboradorId", "fecha");

-- FK compuesta: Postgres rechaza una marca que apunte a la persona de otro negocio.
ALTER TABLE "Asistencia"
  ADD CONSTRAINT "Asistencia_tenantId_colaboradorId_fkey"
  FOREIGN KEY ("tenantId", "colaboradorId") REFERENCES "Colaborador" ("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Contratos: de que persona es. Texto sin FK, igual que customerId y supplierId.
--    NULL en todas las filas existentes: ninguna lectura actual cambia.
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "colaboradorId" TEXT;

CREATE INDEX IF NOT EXISTS "Contract_tenantId_colaboradorId_idx"
  ON "Contract" ("tenantId", "colaboradorId");
