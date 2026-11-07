-- 03 · Rendición del efectivo que cobra el repartidor
-- Pedidos P32 (cuenta por pedido y persona) · P33 (rendición con diferencia explicada) · Ventas M51.
-- PROPUESTA 17-10 — SIN APLICAR. Es DINERO + CAJA: reviewer y security antes del merge.
--
-- Hoy: el repartidor cobra contra entrega y no hay dónde anotar cuánto entregó a la caja
-- (PartnerPayout = lo que el negocio LE PAGA; DeliveryAssignment.fee = su tarifa).
-- Ejemplo del PDF: cobró 300, rindió 280 → quedan 20 pendientes, sin compensarlos solos con su tarifa.
--
-- EXPAND puro: dos tablas nuevas. Un pedido se rinde UNA vez (único parcial «vivo»: anular la
-- rendición libera sus pedidos). Índices parciales sólo en la base (MEMORIA-PROYECTO §3: NO
-- prender previewFeatures partialIndexes). Sin FK a "Order"; FK hija→madre dentro de lo nuevo.
-- CHECK de cierre: diferencia = esperado − entregado − ajustes (la fórmula cierra en la base).
--
-- DB class nueva: lib/db/rendicion-reparto.db.ts — pendientesDe(tenantId, partnerId, jornada)
--   (pedidos entregados en efectivo sin rendir); registrar(tenantId, {…, idempotencyKey}) en UNA tx
--   con candado (lib/db/candado.ts) + CashMovement de ingreso a la caja abierta;
--   anular(tenantId, id, motivo) revierte el movimiento. Invalidar `reparto:<tenantId>` y `caja:<tenantId>`.
-- Rutas: GET /api/delivery/rendiciones?partnerId=&jornada= · POST /api/delivery/rendiciones
--   requireAdmin(req, ["tienda_owner","admin","cajero"]); POST /api/delivery/rendiciones/[id]/anular
--   sólo ["tienda_owner","admin"].
-- Pantalla: Reparto › ficha del repartidor › «Rendir efectivo»; Caja › Hoy muestra lo rendido.
--
-- Aplicar: igual que 01, carpeta 20261017_rendicion_reparto.
-- Revertir: contar filas de "RendicionReparto"; si es 0, eliminar primero "RendicionRepartoPedido" y luego "RendicionReparto" a mano.
--
-- Modelos para prisma/schema.prisma:
-- model RendicionReparto {
--   id              String    @id @default(cuid())
--   tenantId        String
--   codigo          String              /// REN-2026-0001
--   partnerId       String
--   jornada         DateTime  @db.Date
--   esperado        Decimal   @db.Decimal(12, 2)
--   entregado       Decimal   @db.Decimal(12, 2)
--   ajustes         Decimal   @default(0) @db.Decimal(12, 2)
--   ajustesDetalle  Json?               /// [{motivo, monto, autorizadoPor}]
--   diferencia      Decimal   @db.Decimal(12, 2)
--   estado          String    @default("rendida")   /// rendida | con_diferencia | saldada | anulada
--   cashMovementId  String?
--   recibidoPor     String
--   idempotencyKey  String?
--   notas           String?
--   anuladaAt       DateTime?
--   anuladaPor      String?
--   motivoAnulacion String?
--   createdAt       DateTime  @default(now())
--   updatedAt       DateTime  @updatedAt
--   pedidos         RendicionRepartoPedido[]
--   @@unique([tenantId, codigo])
--   @@unique([tenantId, idempotencyKey])
--   @@index([tenantId, partnerId, jornada(sort: Desc)])
--   @@index([tenantId, estado])
-- }
-- model RendicionRepartoPedido {
--   id          String    @id @default(cuid())
--   tenantId    String
--   rendicionId String
--   orderId     String
--   monto       Decimal   @db.Decimal(12, 2)
--   anuladoAt   DateTime?
--   rendicion   RendicionReparto @relation(fields: [rendicionId], references: [id], onDelete: Cascade)
--   @@index([rendicionId])
--   @@index([tenantId, orderId])
-- }

CREATE TABLE IF NOT EXISTS "RendicionReparto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "jornada" DATE NOT NULL,
  "esperado" DECIMAL(12,2) NOT NULL,
  "entregado" DECIMAL(12,2) NOT NULL,
  "ajustes" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "ajustesDetalle" JSONB,
  "diferencia" DECIMAL(12,2) NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'rendida',
  "cashMovementId" TEXT,
  "recibidoPor" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "notas" TEXT,
  "anuladaAt" TIMESTAMP(3),
  "anuladaPor" TEXT,
  "motivoAnulacion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RendicionReparto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RendicionReparto_estado_chk" CHECK ("estado" IN ('rendida', 'con_diferencia', 'saldada', 'anulada')),
  CONSTRAINT "RendicionReparto_montos_chk" CHECK ("esperado" >= 0 AND "entregado" >= 0),
  CONSTRAINT "RendicionReparto_cierre_chk" CHECK ("diferencia" = "esperado" - "entregado" - "ajustes"),
  CONSTRAINT "RendicionReparto_anulada_chk" CHECK ("estado" <> 'anulada' OR ("anuladaAt" IS NOT NULL AND "motivoAnulacion" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "RendicionReparto_tenantId_codigo_key"
  ON "RendicionReparto"("tenantId", "codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "RendicionReparto_tenantId_idempotencyKey_key"
  ON "RendicionReparto"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "RendicionReparto_tenantId_partnerId_jornada_idx"
  ON "RendicionReparto"("tenantId", "partnerId", "jornada" DESC);
CREATE INDEX IF NOT EXISTS "RendicionReparto_tenantId_estado_idx"
  ON "RendicionReparto"("tenantId", "estado");

CREATE TABLE IF NOT EXISTS "RendicionRepartoPedido" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "rendicionId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "anuladoAt" TIMESTAMP(3),
  CONSTRAINT "RendicionRepartoPedido_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RendicionRepartoPedido_monto_chk" CHECK ("monto" >= 0),
  CONSTRAINT "RendicionRepartoPedido_rendicionId_fkey" FOREIGN KEY ("rendicionId")
    REFERENCES "RendicionReparto"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RendicionRepartoPedido_rendicionId_idx"
  ON "RendicionRepartoPedido"("rendicionId");
CREATE INDEX IF NOT EXISTS "RendicionRepartoPedido_tenantId_orderId_idx"
  ON "RendicionRepartoPedido"("tenantId", "orderId");
-- Un pedido se rinde una sola vez mientras su rendición esté viva (sólo en la base).
CREATE UNIQUE INDEX IF NOT EXISTS "RendicionRepartoPedido_orderId_vivo_key"
  ON "RendicionRepartoPedido"("tenantId", "orderId") WHERE "anuladoAt" IS NULL;
