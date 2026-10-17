-- 332 · La fecha en que el adelanto se tenía que devolver.
--
-- POR QUÉ. La cobranza mide el atraso contra la ENTREGA PACTADA incumplida
-- (ver lib/adelantos/urgencia-cobranza.ts), pero sólo los adelantos de
-- modalidad ENTREGAS_PACTADAS tienen esas cuotas. Para todos los demás —la
-- mayoría— el único proxy era la ANTIGÜEDAD: un adelanto de 45 días con
-- devolución acordada para el mes que viene salía «vencido», y uno de 20 días
-- que se tenía que devolver hace cinco salía «al día».
--
-- Con una fecha pactada por adelanto, TODO adelanto tiene contra qué medirse,
-- sin obligar a armar un plan de cuotas.
--
-- NULLABLE: quien no acuerda fecha sigue trabajando como hasta ahora.

ALTER TABLE "Adelanto"
  ADD COLUMN IF NOT EXISTS "fechaVencimiento" TIMESTAMP(3);

-- El cron de recordatorios y la cobranza barren por vencidos.
CREATE INDEX IF NOT EXISTS "Adelanto_tenantId_fechaVencimiento_idx"
  ON "Adelanto" ("tenantId", "fechaVencimiento");
