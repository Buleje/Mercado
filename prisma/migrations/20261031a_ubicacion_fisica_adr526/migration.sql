-- ADR-526 — Dónde está el papel original (Brandon 31-10): cada carpeta del
-- Archivo dice en qué archivador/separador guarda sus papeles físicos, y cada
-- papel registrado («Ya lo anoté», ADR-516) lo hereda si no tiene uno propio.
--
-- EXPAND puro: dos columnas nullable, sin default, sin índice y sin enum. El
-- Prisma viejo de producción nombra sus columnas en cada SELECT/INSERT: no las
-- lee ni las escribe. `ADD COLUMN … NULL` sin default no reescribe la tabla.
-- El tope de 120 caracteres lo pone el Zod de las rutas (no un CHECK).
-- Revertir: soltar las dos columnas (nadie más las lee).
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261031a_ubicacion_fisica_adr526/migration.sql dotenv_config_path=.env.local

ALTER TABLE "DocumentFolder" ADD COLUMN IF NOT EXISTS "ubicacionFisica" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "ubicacionFisica" TEXT;
