-- Migración 305 — Cacao campo: contorno dibujado de la parcela sobre el mapa.
-- Aditiva e idempotente: agrega la columna "poligono" (JSON [[lat,lng],…]) a
-- CacaoParcela para dibujar/dividir el terreno en secciones geográficas.
ALTER TABLE "CacaoParcela" ADD COLUMN IF NOT EXISTS "poligono" TEXT;
