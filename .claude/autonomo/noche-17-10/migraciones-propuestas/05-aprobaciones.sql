-- 05 · Solicitudes de aprobación (una tabla para 4 módulos)
-- Comprobantes F15 (emitir sobre umbral) · Compras C12 (orden sobre umbral) · Ventas M37 (pasar el
-- límite de crédito) · M45 (liquidación de comisiones) · Pedidos N04 (devolución sobre umbral).
-- PROPUESTA 17-10 — SIN APLICAR. Toca permisos: security antes del merge.
--
-- Hoy: cada módulo que quiere «pedir permiso al dueño» lo haría en su propia columna; no hay
-- rastro de quién aprobó qué versión. PaymentApproval sirve sólo a pagos con foto.
-- La «huella» (sha256 del contenido aprobado) impide aprobar una cosa y emitir otra:
-- si el registro cambia después de aprobado, la huella no coincide y vuelve a pedir.
--
-- EXPAND puro: tabla nueva. Idempotente. MIGRATE: nada. CONTRACT: nada.
-- Los umbrales NO van acá: KV PlatformSetting `aprobaciones:<tenantId>` ({comprobante, orden, credito, devolucion}).
--
-- DB class nueva: lib/db/aprobaciones.db.ts — solicitar(tenantId, {modulo, tipo, registroId, version, huella, resumen, motivo}),
--   resolver(tenantId, id, {aprobada|devuelta, motivo}) con candado; consumir(tenantId, modulo, registroId, huella)
--   marca 'usada' en la misma tx que la acción; pendientes(tenantId, modulo?). Invalidar `aprobaciones:<tenantId>`.
-- Rutas: GET /api/aprobaciones?estado=&modulo= · POST /api/aprobaciones (quien pide: su rol del módulo)
--   POST /api/aprobaciones/[id]/resolver — requireAdmin(req, ["tienda_owner","admin"]); «quien pide no resuelve lo suyo» se decide en la app (regla b-14), no en la base.
-- Pantalla: campana del panel «Por aprobar (n)» + bandeja en Inicio; cada módulo muestra «Esperando aprobación».
--
-- Aplicar: igual que 01, carpeta 20261017_solicitud_aprobacion.
-- Revertir: contar filas de "SolicitudAprobacion"; si es 0, eliminar la tabla a mano.
--
-- Modelo para prisma/schema.prisma:
-- model SolicitudAprobacion {
--   id               String    @id @default(cuid())
--   tenantId         String
--   modulo           String              /// comprobantes | compras | ventas | pedidos | comisiones
--   tipo             String              /// emitir | orden | credito | devolucion | liquidacion
--   registroId       String
--   version          Int       @default(1)
--   huella           String              /// sha256 del contenido aprobado
--   resumen          Json?               /// {monto, cliente, …} para la bandeja
--   motivo           String?
--   solicitadoPor    String
--   estado           String    @default("pendiente")   /// pendiente | aprobada | devuelta | usada | vencida
--   resueltoPor      String?
--   resueltoEn       DateTime?
--   motivoResolucion String?
--   usadaEn          DateTime?
--   venceEn          DateTime?
--   createdAt        DateTime  @default(now())
--   updatedAt        DateTime  @updatedAt
--   @@unique([tenantId, modulo, registroId, huella])
--   @@index([tenantId, estado, modulo])
-- }

CREATE TABLE IF NOT EXISTS "SolicitudAprobacion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "modulo" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "registroId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "huella" TEXT NOT NULL,
  "resumen" JSONB,
  "motivo" TEXT,
  "solicitadoPor" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'pendiente',
  "resueltoPor" TEXT,
  "resueltoEn" TIMESTAMP(3),
  "motivoResolucion" TEXT,
  "usadaEn" TIMESTAMP(3),
  "venceEn" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SolicitudAprobacion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SolicitudAprobacion_estado_chk" CHECK ("estado" IN ('pendiente', 'aprobada', 'devuelta', 'usada', 'vencida')),
  CONSTRAINT "SolicitudAprobacion_resuelta_chk" CHECK ("estado" IN ('pendiente', 'vencida') OR ("resueltoPor" IS NOT NULL AND "resueltoEn" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "SolicitudAprobacion_tenantId_modulo_registroId_huella_key"
  ON "SolicitudAprobacion"("tenantId", "modulo", "registroId", "huella");
CREATE INDEX IF NOT EXISTS "SolicitudAprobacion_tenantId_estado_modulo_idx"
  ON "SolicitudAprobacion"("tenantId", "estado", "modulo");
