-- Limpieza del test de historial + la corrida fantasma que reveló el bug.
DELETE FROM "ForestCtpConsumo" WHERE "ctpEntryId" IN (
  SELECT id FROM "ForestCtpEntry" WHERE section = 'produccion' AND "productType" = 'rolliza' AND "speciesCommon" = 'Tornillo' AND quantity = 7
);
DELETE FROM "ForestCtpEntry" WHERE section = 'produccion' AND "productType" = 'rolliza' AND "speciesCommon" = 'Tornillo' AND quantity = 7;
DELETE FROM "WoodEntry" WHERE "gtfNumber" = 'IMP-H-001';
DELETE FROM "ActivityLog" WHERE entity = 'ForestCtpImport' AND "entityId" = 'historial-test.xlsx';
