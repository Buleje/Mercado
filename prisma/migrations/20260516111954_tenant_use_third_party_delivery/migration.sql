-- Brandon mayo 2026 v7: toggle por tenant para habilitar la red de
-- repartidores Buleje (DeliveryPartner cross-tenant). Si false, la tienda
-- no aparece en /delivery-app ni se generan DeliveryOffer para terceros.
--
-- Expand-safe: columna NUEVA con DEFAULT false. No rompe clientes viejos.
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "useThirdPartyDelivery" boolean NOT NULL DEFAULT false;
