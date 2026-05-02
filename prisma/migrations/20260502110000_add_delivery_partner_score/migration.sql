-- Migration: add_delivery_partner_score
-- Agrega el campo `score` al modelo DeliveryPartner para el sistema de niveles/gamificacion.

ALTER TABLE "DeliveryPartner" ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0;
