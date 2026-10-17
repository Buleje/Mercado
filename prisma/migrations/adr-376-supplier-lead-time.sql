-- ADR-376 — Días de entrega del proveedor.
--
-- Sin este dato el punto de reorden no se puede calcular y la reposición se
-- decide contra un `stockMax` escrito a mano: un producto que llega en 2 días
-- lleva el mismo colchón que uno que llega en 15.
--
-- Nullable a propósito: si nadie lo declara, se deriva del historial de
-- órdenes de ese proveedor (createdAt → deliveryDate).
--
-- Idempotente.
-- Uso: USE_POOLER=1 node -r dotenv/config scripts/apply-376-migration.mjs dotenv_config_path=.env.local

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "leadTimeDias" INTEGER;
