-- ADR-457 · Enchufes y piezas por negocio — tabla de asignaciones.
--
-- Expand puro: una tabla NUEVA y vacía. No toca ninguna tabla existente (la FK
-- a "Tenant" sólo la referencia). Idempotente: se puede correr dos veces.
-- La FK va dentro del CREATE TABLE para no necesitar un `DO $$` que pregunte si
-- ya existe: si la tabla existe, el CREATE entero se saltea.
--
-- Mismo SQL que `prisma migrate diff` para el modelo `TenantPieza`, salvo el
-- `IF NOT EXISTS` y la FK en línea.
CREATE TABLE IF NOT EXISTS "TenantPieza" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "piezaId" TEXT NOT NULL,
    "enchufe" TEXT NOT NULL,
    "prendida" BOOLEAN NOT NULL DEFAULT false,
    "opciones" JSONB NOT NULL DEFAULT '{}',
    "version" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "actualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPieza_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TenantPieza_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TenantPieza_tenantId_prendida_idx" ON "TenantPieza"("tenantId", "prendida");

CREATE UNIQUE INDEX IF NOT EXISTS "TenantPieza_tenantId_piezaId_enchufe_key" ON "TenantPieza"("tenantId", "piezaId", "enchufe");
