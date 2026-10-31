-- ADR-335 · Fecha de recepción en planta del ingreso. Idempotente.
ALTER TABLE "WoodEntry" ADD COLUMN IF NOT EXISTS "fechaRecepcion" TIMESTAMP(3);
