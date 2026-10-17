-- 333 · La bitácora de cobranza.
--
-- POR QUÉ. Hasta acá lo único que quedaba de una gestión era una fecha:
-- `AdelantoBeneficiario.ultimoRecordatorio`. Eso alcanza para no escribirle dos
-- veces el mismo día, y para nada más. La cobranza de verdad necesita saber QUÉ
-- pasó: «prometió pagar el viernes», «no contesta hace tres llamadas», «pidió
-- refinanciar». Sin eso, cada vez que alguien retoma la lista empieza de cero, y
-- una promesa de pago —que es el compromiso más fácil de reclamar— se pierde en
-- la memoria de quien atendió.
--
-- La promesa vive acá y no en el adelanto porque es de la PERSONA y puede
-- abarcar varios adelantos suyos: se promete «te pago todo el viernes».

CREATE TABLE IF NOT EXISTS "AdelantoGestion" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "beneficiarioId"  TEXT NOT NULL,
  "fecha"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- RECORDATORIO | PROMESA | NO_CONTESTA | REFINANCIAR | VISITA | PAGO | OTRO
  "tipo"            TEXT NOT NULL DEFAULT 'RECORDATORIO',
  "nota"            TEXT,
  -- Sólo tipo PROMESA: para cuándo se comprometió y por cuánto.
  "fechaPrometida"  TIMESTAMP(3),
  "montoPrometido"  DECIMAL(12,2),
  -- Quién la anotó: una gestión sin autor no se le puede preguntar a nadie.
  "usuario"         TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdelantoGestion_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AdelantoGestion_beneficiarioId_fkey'
  ) THEN
    ALTER TABLE "AdelantoGestion"
      ADD CONSTRAINT "AdelantoGestion_beneficiarioId_fkey"
      FOREIGN KEY ("beneficiarioId") REFERENCES "AdelantoBeneficiario"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- La última gestión de cada persona se pide en CADA fila de la lista.
CREATE INDEX IF NOT EXISTS "AdelantoGestion_tenantId_beneficiarioId_fecha_idx"
  ON "AdelantoGestion" ("tenantId", "beneficiarioId", "fecha" DESC);

-- «Quién prometió pagar hoy» es la pregunta con la que se abre el día.
CREATE INDEX IF NOT EXISTS "AdelantoGestion_tenantId_fechaPrometida_idx"
  ON "AdelantoGestion" ("tenantId", "fechaPrometida");
