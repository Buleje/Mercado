-- Migration: 20260404191000_add_mercadopago_fields
-- Agrega los campos de Mercado Pago al modelo Tenant para soportar
-- pagos locales peruanos (Yape, BCP, PagoEfectivo, Plin, etc.)
-- como alternativa a Stripe.

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "mpCustomerId"    TEXT,
  ADD COLUMN IF NOT EXISTS "mpSubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "mpPaymentMethod"  TEXT;
