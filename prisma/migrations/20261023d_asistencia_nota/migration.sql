-- Asistencia (ADR-414 §4) — nota del día SIN marca (Brandon 23-10: «poner
-- también motivo o nota, sin poner presente ni nada, sólo una nota»).
--
-- EXPAND puro: tabla nueva "AsistenciaNota", una fila por persona y día.
-- `Asistencia.estado` sigue obligatorio y el enum no cambia: el Prisma viejo de
-- producción no lee esta tabla. Cuando ese día se marca (Presente, Tardanza…),
-- la nota pasa a `Asistencia.nota` en la misma transacción y la fila de acá se
-- borra; si se quita la marca, la nota vuelve acá (una sola nota por día).
--
-- FK compuesta (tenantId, colaboradorId) → Colaborador(tenantId, id): la nota
-- nunca apunta a una persona de otro negocio. RESTRICT como `Asistencia`.
-- Revertir: borrar la tabla "AsistenciaNota" (nadie más la lee).
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261023d_asistencia_nota/migration.sql dotenv_config_path=.env.local

CREATE TABLE IF NOT EXISTS "AsistenciaNota" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "colaboradorId" TEXT NOT NULL,
  "fecha" DATE NOT NULL,
  "nota" TEXT NOT NULL,
  "autor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AsistenciaNota_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AsistenciaNota_tenantId_colaboradorId_fkey" FOREIGN KEY ("tenantId", "colaboradorId")
    REFERENCES "Colaborador"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AsistenciaNota_tenantId_colaboradorId_fecha_key" ON "AsistenciaNota"("tenantId", "colaboradorId", "fecha");
CREATE INDEX IF NOT EXISTS "AsistenciaNota_tenantId_fecha_idx" ON "AsistenciaNota"("tenantId", "fecha");
