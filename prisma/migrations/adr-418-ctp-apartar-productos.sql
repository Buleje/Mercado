-- Apartar un producto del patio: la reserva entre elegir y emitir la GTF (ADR-418).
--
-- EXPAND puro: una tabla nueva. Ningún dato existente cambia, ninguna columna se
-- toca y el código viejo no la lee — «Productos disponibles» sigue funcionando
-- igual si esta tabla está vacía.
--
-- POR QUÉ: entre que el operador elige los paquetes de un pedido y emite la guía
-- pasan horas o días (falta confirmar transportista, conductor y placa). En ese
-- hueco la madera sigue apareciendo libre para todos y dos vendedores prometen
-- los mismos paquetes. El apartado NO mueve stock ni toca ningún saldo declarado
-- (mismo criterio que `ForestCtpEntry.usadoAt`): sólo dice «esto ya tiene dueño».
--
-- `paqueteId NULL` = se aparta la corrida entera, que es la otra forma de fila
-- que arma la pantalla cuando la corrida no declaró paquetes.
--
-- Para revertir (contar primero que no haya reservas vivas):
--   SELECT count(*) FROM "ForestCtpApartado" WHERE "liberadoAt" IS NULL;
--   DROP TABLE "ForestCtpApartado";
--
-- Uso: node scripts/apply-sql.mjs prisma/migrations/adr-418-ctp-apartar-productos.sql
-- (por DIRECT_URL: el pooler no sirve para DDL en este repo)

CREATE TABLE IF NOT EXISTS "ForestCtpApartado" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "ctpEntryId"     TEXT NOT NULL,
  "paqueteId"      TEXT,
  "para"           TEXT NOT NULL,
  "hasta"          TIMESTAMP(3),
  "nota"           TEXT,
  "creadoPor"      TEXT NOT NULL,
  "creadoAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "liberadoAt"     TIMESTAMP(3),
  "liberadoPor"    TEXT,
  "liberadoMotivo" TEXT,
  CONSTRAINT "ForestCtpApartado_pkey" PRIMARY KEY ("id")
);

-- Borrar la corrida o el paquete se lleva sus reservas: una reserva sobre algo
-- que ya no existe no es un dato, es basura que ensucia la pantalla.
DO $$ BEGIN
  ALTER TABLE "ForestCtpApartado" ADD CONSTRAINT "ForestCtpApartado_ctpEntryId_fkey"
    FOREIGN KEY ("ctpEntryId") REFERENCES "ForestCtpEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ForestCtpApartado" ADD CONSTRAINT "ForestCtpApartado_paqueteId_fkey"
    FOREIGN KEY ("paqueteId") REFERENCES "ForestCtpPaquete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Las dos lecturas reales: las reservas de una corrida (para pintar la fila) y
-- las vivas del tenant (para el listado y el aviso de vencidas). Ambas arrancan
-- por `tenantId` — regla 1 del repo.
CREATE INDEX IF NOT EXISTS "ForestCtpApartado_tenantId_ctpEntryId_idx"
  ON "ForestCtpApartado" ("tenantId", "ctpEntryId");

CREATE INDEX IF NOT EXISTS "ForestCtpApartado_tenantId_liberadoAt_idx"
  ON "ForestCtpApartado" ("tenantId", "liberadoAt");

-- ── El índice que Prisma NO sabe declarar ──────────────────────────────────
-- Una fila del patio no puede tener dos dueños a la vez. Prisma no soporta ni
-- el `WHERE` (índice parcial) ni el `COALESCE` (índice sobre expresión), así que
-- esta garantía vive SÓLO acá y está documentada en el modelo del schema.
--
-- `COALESCE("paqueteId", '')` porque en SQL dos NULL no chocan: sin eso, la
-- corrida entera (paqueteId NULL) podría apartarse N veces. Con `''` como
-- sustituto, las reservas «de la corrida entera» compiten entre sí igual que las
-- de un mismo paquete.
--
-- El `WHERE "liberadoAt" IS NULL` deja pasar todo el historial: una pila puede
-- haberse apartado y soltado veinte veces, lo único único es la reserva VIVA.
CREATE UNIQUE INDEX IF NOT EXISTS "ForestCtpApartado_vivo_unico"
  ON "ForestCtpApartado" ("ctpEntryId", COALESCE("paqueteId", ''))
  WHERE "liberadoAt" IS NULL;
