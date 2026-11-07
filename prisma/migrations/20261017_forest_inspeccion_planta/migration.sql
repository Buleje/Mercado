-- ADR-498 · Inspecciones de planta del superadmin con el libro congelado
-- (fase 3 de «Plantas forestales», Brandon 17-10: «Crear la tabla»).
--
-- EXPAND puro: una tabla nueva y su índice; ninguna tabla existente cambia (sin
-- locks sobre tablas vivas, sin backfill). El código viejo no la lee.
--
-- Convención de los `Forest*` vecinos (`ForestPatioConteo`): sin FK a "Tenant"
-- (el aislamiento es el `tenantId` en cada WHERE de la DB class), `updatedAt`
-- sin DEFAULT (lo llena `@updatedAt`), un solo índice `(tenantId, fecha)`: sirve
-- la lista por planta (fecha DESC) y la última por planta (DISTINCT ON). Sin
-- índice suelto por `estado`: toda lectura va por planta (regla del índice que
-- empieza por tenantId).
--
-- Los CHECK no los declara Prisma (no los suelta ni los ve el diff): son la red
-- de la base debajo de la guardia de la DB class.
--
-- Idempotente: IF NOT EXISTS, la 2.ª corrida no cambia nada.

CREATE TABLE IF NOT EXISTS "ForestInspeccionPlanta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "inspector" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierta',
    "libro" JSONB NOT NULL,
    "conteoPatioId" TEXT,
    "trozas" JSONB,
    "aserrada" JSONB NOT NULL DEFAULT '[]',
    "hallazgos" JSONB NOT NULL DEFAULT '[]',
    "conclusion" TEXT,
    "responsablePlanta" TEXT,
    "notas" TEXT,
    "motivoAnulacion" TEXT,
    "cerradaAt" TIMESTAMP(3),
    "anuladaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForestInspeccionPlanta_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ForestInspeccionPlanta_estado_check"
        CHECK ("estado" IN ('abierta', 'cerrada', 'anulada')),
    CONSTRAINT "ForestInspeccionPlanta_anulada_motivo_check"
        CHECK ("estado" <> 'anulada' OR "motivoAnulacion" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "ForestInspeccionPlanta_tenantId_fecha_idx"
    ON "ForestInspeccionPlanta"("tenantId", "fecha");
