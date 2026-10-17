-- Limpieza del 2º test de historial (ya sin corrida fantasma tras el fix).
DELETE FROM "WoodEntry" WHERE "gtfNumber" = 'IMP-H-001';
DELETE FROM "ActivityLog" WHERE entity = 'ForestCtpImport' AND "entityId" = 'historial-test.xlsx';
