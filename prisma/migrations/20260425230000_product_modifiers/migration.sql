-- Product Modifiers (universal options) — V1
--
-- Crea modelos para grupos de opciones de personalizacion:
--   * ProductModifierGroup: agrupa opciones (ej: "Cremas", "Talla", "Presa")
--   * ProductModifierOption: opcion individual con priceDelta opcional
--
-- Tambien agrega OrderItem.modifiersJson para persistir las opciones
-- elegidas por el cliente al momento del pedido.
--
-- Idempotente: usa IF NOT EXISTS para que pueda re-aplicarse sin error
-- en DBs donde se haya corrido manualmente.

-- ─── ProductModifierGroup ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProductModifierGroup" (
  "id"          TEXT          NOT NULL,
  "productId"   INTEGER       NOT NULL,
  "name"        TEXT          NOT NULL,
  "description" TEXT,
  "required"    BOOLEAN       NOT NULL DEFAULT false,
  "minSelect"   INTEGER       NOT NULL DEFAULT 0,
  "maxSelect"   INTEGER       NOT NULL DEFAULT 1,
  "position"    INTEGER       NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN       NOT NULL DEFAULT true,
  "tenantId"    TEXT          NOT NULL,
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "ProductModifierGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductModifierGroup_productId_idx"
  ON "ProductModifierGroup"("productId");
CREATE INDEX IF NOT EXISTS "ProductModifierGroup_tenantId_idx"
  ON "ProductModifierGroup"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductModifierGroup_productId_fkey'
  ) THEN
    ALTER TABLE "ProductModifierGroup"
      ADD CONSTRAINT "ProductModifierGroup_productId_fkey"
      FOREIGN KEY ("productId")
      REFERENCES "Product"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── ProductModifierOption ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProductModifierOption" (
  "id"         TEXT             NOT NULL,
  "groupId"    TEXT             NOT NULL,
  "name"       TEXT             NOT NULL,
  "priceDelta" DECIMAL(12, 2)   NOT NULL DEFAULT 0,
  "position"   INTEGER          NOT NULL DEFAULT 0,
  "isDefault"  BOOLEAN          NOT NULL DEFAULT false,
  "isActive"   BOOLEAN          NOT NULL DEFAULT true,
  "imageUrl"   TEXT,
  "tenantId"   TEXT             NOT NULL,
  "createdAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductModifierOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductModifierOption_groupId_idx"
  ON "ProductModifierOption"("groupId");
CREATE INDEX IF NOT EXISTS "ProductModifierOption_tenantId_idx"
  ON "ProductModifierOption"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductModifierOption_groupId_fkey'
  ) THEN
    ALTER TABLE "ProductModifierOption"
      ADD CONSTRAINT "ProductModifierOption_groupId_fkey"
      FOREIGN KEY ("groupId")
      REFERENCES "ProductModifierGroup"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── OrderItem.modifiersJson ──────────────────────────────────────
-- Persiste un snapshot de los modifiers elegidos al crear el pedido,
-- inmutable aunque el dueño cambie las opciones despues. Permite
-- mostrar la composicion exacta del item en historial / tracking.
ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "modifiersJson" JSONB;
