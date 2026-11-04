-- 01 · Proveedor × producto: presentación, factor, mínimo y múltiplo
-- Compras C11 (comparar ofertas por unidad) · C21 (escanear la caja = 12 unidades) · C30 (mínimos y múltiplos).
-- PROPUESTA 17-10 (noche autónoma) — SIN APLICAR. Decide Brandon.
--
-- Hoy: el sistema no sabe que «Caja x 12» son 12 unidades; el comparador y las sugerencias
-- mezclan unidades y la recepción cuenta una caja como 1. No hay tabla equivalente
-- (SupplierOffer = promoción; SupplierPriceVersion = sólo precio).
--
-- EXPAND puro: tabla nueva, nadie la lee todavía. Sin FK a "Product"/"Supplier" (tablas
-- calientes; relación a nivel de app como ForestCubicacionTrozas). Idempotente (IF NOT EXISTS);
-- los CHECK viven dentro del CREATE TABLE. MIGRATE: sin backfill. CONTRACT: nada que soltar.
--
-- DB class nueva: lib/db/proveedor-producto.db.ts (tenantId 1.º, cache + invalidateByPrefix
--   `proveedor-producto:<tenantId>`): listarPorProducto, listarPorProveedor, porCodigoBarras,
--   guardar (upsert por la clave única), archivar (activo=false).
-- Rutas: GET/POST /api/compras/presentaciones · PATCH /api/compras/presentaciones/[id]
--   requireAdmin(req, ["tienda_owner","admin","encargado","almacenero"]).
-- Pantallas: ficha del proveedor › «Lo que le compras»; Recibir (escaneo caja→unidades);
--   Sugerencias (redondear a cajas, C30); Comparar (precio por unidad equivalente, C11).
--
-- Aplicar (copiar a prisma/migrations/20261017_proveedor_producto/migration.sql):
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs <sql> --ensayo dotenv_config_path=.env.local
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs <sql> dotenv_config_path=.env.local   (2.ª vez = «0 nuevas»)
--   node scripts/migraciones-cruce.mjs --verificar
--   node scripts/prisma-session.mjs migrate resolve --applied 20261017_proveedor_producto
-- Revertir: contar filas de "ProveedorProducto"; si es 0, eliminar la tabla a mano desde la terminal de Brandon.
--
-- Modelo para prisma/schema.prisma:
-- model ProveedorProducto {
--   id           String    @id @default(cuid())
--   tenantId     String
--   supplierId   String
--   productId    Int
--   presentacion String              /// «Caja x 12», «Saco 50 kg»
--   factor       Decimal   @db.Decimal(12, 4)   /// unidades de inventario por unidad de compra
--   codigoBarras String?             /// el de la caja; el de la unidad sigue en Product
--   minimoCompra Decimal?  @db.Decimal(12, 4)
--   multiplo     Decimal?  @db.Decimal(12, 4)
--   precio       Decimal?  @db.Decimal(12, 4)   /// por unidad de compra, último acordado
--   moneda       String    @default("PEN")
--   precioFecha  DateTime?
--   plazoDias    Int?
--   preferida    Boolean   @default(false)
--   activo       Boolean   @default(true)
--   createdBy    String
--   createdAt    DateTime  @default(now())
--   updatedAt    DateTime  @updatedAt
--   @@unique([tenantId, supplierId, productId, presentacion])
--   @@index([tenantId, productId])
--   @@index([tenantId, codigoBarras])
-- }

CREATE TABLE IF NOT EXISTS "ProveedorProducto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "presentacion" TEXT NOT NULL,
  "factor" DECIMAL(12,4) NOT NULL,
  "codigoBarras" TEXT,
  "minimoCompra" DECIMAL(12,4),
  "multiplo" DECIMAL(12,4),
  "precio" DECIMAL(12,4),
  "moneda" TEXT NOT NULL DEFAULT 'PEN',
  "precioFecha" TIMESTAMP(3),
  "plazoDias" INTEGER,
  "preferida" BOOLEAN NOT NULL DEFAULT false,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProveedorProducto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProveedorProducto_factor_chk" CHECK ("factor" > 0),
  CONSTRAINT "ProveedorProducto_minimo_chk" CHECK ("minimoCompra" IS NULL OR "minimoCompra" > 0),
  CONSTRAINT "ProveedorProducto_multiplo_chk" CHECK ("multiplo" IS NULL OR "multiplo" > 0),
  CONSTRAINT "ProveedorProducto_precio_chk" CHECK ("precio" IS NULL OR "precio" >= 0),
  CONSTRAINT "ProveedorProducto_moneda_chk" CHECK ("moneda" IN ('PEN', 'USD'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProveedorProducto_tenantId_supplierId_productId_presentacion_key"
  ON "ProveedorProducto"("tenantId", "supplierId", "productId", "presentacion");
CREATE INDEX IF NOT EXISTS "ProveedorProducto_tenantId_productId_idx"
  ON "ProveedorProducto"("tenantId", "productId");
CREATE INDEX IF NOT EXISTS "ProveedorProducto_tenantId_codigoBarras_idx"
  ON "ProveedorProducto"("tenantId", "codigoBarras");
