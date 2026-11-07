-- Cubicación de trozas (ADR-478) — el camión que trajo (o se llevó) la madera:
-- placa y chofer (Brandon 24-10: «hoy las cubicaciones de trozas no guardan ni
-- placa ni chofer»). Se ven en el detalle y en el comparador.
--
-- EXPAND puro: dos columnas TEXT nullable, sin default ni índice. El Prisma
-- viejo de producción nombra sus columnas en cada SELECT/INSERT: no las lee ni
-- las escribe, y una fila suya queda con NULL (= «no se anotó», como antes).
-- La madera aserrada usa la misma tabla y no las llena (su camión va en
-- ForestCubicacion.ficha).
-- Revertir: soltar las dos columnas (nadie más las lee).
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261024c_cubicacion_trozas_camion/migration.sql dotenv_config_path=.env.local

ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "placa" TEXT;
ALTER TABLE "ForestCubicacionTrozas" ADD COLUMN IF NOT EXISTS "chofer" TEXT;
