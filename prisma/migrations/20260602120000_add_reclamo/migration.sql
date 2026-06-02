-- ADR-129: Libro de Reclamaciones — modelo `Reclamo` (platform-level, aditivo).
-- Idempotente (IF NOT EXISTS) para convivir con `prisma migrate deploy` y con la
-- aplicación previa al Supabase compartido vía MCP. Sin DROP, sin NOT NULL sobre
-- datos existentes (tabla nueva vacía).

CREATE TABLE IF NOT EXISTS "Reclamo" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "codigo" TEXT,
    "nombre" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "domicilio" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "esMenor" BOOLEAN NOT NULL DEFAULT false,
    "apoderado" TEXT,
    "tipoBien" TEXT NOT NULL,
    "montoReclamado" DECIMAL(12,2),
    "descripcionBien" TEXT NOT NULL,
    "numeroPedido" TEXT,
    "tienda" TEXT,
    "tenantId" TEXT,
    "tipoReclamo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "pedidoConsumidor" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "respuesta" TEXT,
    "respondidoEn" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reclamo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Reclamo_numero_key" ON "Reclamo"("numero");
CREATE UNIQUE INDEX IF NOT EXISTS "Reclamo_codigo_key" ON "Reclamo"("codigo");
CREATE INDEX IF NOT EXISTS "Reclamo_createdAt_idx" ON "Reclamo"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Reclamo_estado_idx" ON "Reclamo"("estado");
CREATE INDEX IF NOT EXISTS "Reclamo_email_idx" ON "Reclamo"("email");
CREATE INDEX IF NOT EXISTS "Reclamo_tenantId_idx" ON "Reclamo"("tenantId");
