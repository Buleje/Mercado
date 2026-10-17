-- ADR-380 — Registro de Plantación Forestal (RNPF).
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS. Sin CONCURRENTLY (tablas
-- nuevas, sin filas — no hay lock contention que evitar), corre vía pooler.

CREATE TABLE IF NOT EXISTS "ForestPlantacionTramite" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,

  "codigoInterno" TEXT NOT NULL,
  "codigoPlantacionSerfor" TEXT,

  "tipoTramite" TEXT NOT NULL DEFAULT 'inscripcion',
  "estado" TEXT NOT NULL DEFAULT 'borrador',

  "titularTipoPersona" TEXT,
  "titularTipoDocumento" TEXT,
  "titularNumeroDocumento" TEXT,
  "titularRazonSocial" TEXT,
  "titularApellidoPaterno" TEXT,
  "titularApellidoMaterno" TEXT,
  "titularNombres" TEXT,
  "titularTelefonoFijo" TEXT,
  "titularCelular" TEXT,
  "titularEmail" TEXT,
  "titularDepartamento" TEXT,
  "titularProvincia" TEXT,
  "titularDistrito" TEXT,
  "titularTipoVia" TEXT,
  "titularDireccion" TEXT,
  "titularNumero" TEXT,
  "titularDocumentoAutorizaUso" TEXT,

  "repTiene" BOOLEAN NOT NULL DEFAULT false,
  "repTipoDocumento" TEXT,
  "repNumeroDocumento" TEXT,
  "repApellidoPaterno" TEXT,
  "repApellidoMaterno" TEXT,
  "repNombres" TEXT,
  "repTelefonoFijo" TEXT,
  "repCelular" TEXT,
  "repEmail" TEXT,
  "repDepartamento" TEXT,
  "repProvincia" TEXT,
  "repDistrito" TEXT,
  "repTipoVia" TEXT,
  "repDireccion" TEXT,
  "repNumero" TEXT,

  "predioNombre" TEXT,
  "predioAreaTotalHa" DECIMAL(12,4),
  "predioDepartamento" TEXT,
  "predioProvincia" TEXT,
  "predioDistrito" TEXT,
  "predioSectorAnexo" TEXT,
  "predioZonaUtm" TEXT,
  "predioEste" DECIMAL(12,3),
  "predioNorte" DECIMAL(12,3),
  "predioDatum" TEXT NOT NULL DEFAULT 'WGS84',

  "titularidadTipo" TEXT,
  "titularidadTipoPersona" TEXT,
  "titularidadDocumentoTipo" TEXT,
  "titularidadDocumentoNumero" TEXT,
  "titularidadNombre" TEXT,
  "titularidadDocAcreditaTipo" TEXT,
  "titularidadDocAcreditaNumero" TEXT,
  "titularidadInscripcionSunarp" TEXT,
  "titularidadDocAutorizaUso" TEXT,
  "posesionarioNombre" TEXT,
  "posesionarioDocumentoAcredita" TEXT,
  "posesionarioAniosConduccion" INTEGER,

  "tituloHabilitanteTiene" BOOLEAN NOT NULL DEFAULT false,
  "tituloHabilitanteTipo" TEXT,
  "tituloHabilitanteCodigo" TEXT,

  "djLugar" TEXT,
  "djFecha" TIMESTAMP(3),
  "djTitularNombre" TEXT,
  "djDni" TEXT,
  "djAceptado" BOOLEAN NOT NULL DEFAULT false,
  "djAceptadoAt" TIMESTAMP(3),

  "documentosJson" JSONB,
  "notas" TEXT,

  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForestPlantacionTramite_tenantId_codigoInterno_key"
  ON "ForestPlantacionTramite" ("tenantId", "codigoInterno");
CREATE INDEX IF NOT EXISTS "ForestPlantacionTramite_tenantId_estado_idx"
  ON "ForestPlantacionTramite" ("tenantId", "estado");
CREATE INDEX IF NOT EXISTS "ForestPlantacionTramite_tenantId_updatedAt_idx"
  ON "ForestPlantacionTramite" ("tenantId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "ForestPlantacionTramite_deletedAt_idx"
  ON "ForestPlantacionTramite" ("deletedAt");

CREATE TABLE IF NOT EXISTS "ForestPlantacionBloque" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "plantacionId" TEXT NOT NULL,

  "numero" INTEGER NOT NULL,
  "nombre" TEXT,
  "superficieHa" DECIMAL(12,4),

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "ForestPlantacionBloque_tenantId_plantacionId_idx"
  ON "ForestPlantacionBloque" ("tenantId", "plantacionId");
CREATE INDEX IF NOT EXISTS "ForestPlantacionBloque_deletedAt_idx"
  ON "ForestPlantacionBloque" ("deletedAt");

CREATE TABLE IF NOT EXISTS "ForestPlantacionVertice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "bloqueId" TEXT NOT NULL,

  "orden" INTEGER NOT NULL,
  "zonaUtm" TEXT,
  "este" DECIMAL(12,3) NOT NULL,
  "norte" DECIMAL(12,3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "ForestPlantacionVertice_tenantId_bloqueId_orden_idx"
  ON "ForestPlantacionVertice" ("tenantId", "bloqueId", "orden");

CREATE TABLE IF NOT EXISTS "ForestPlantacionEspecie" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "bloqueId" TEXT NOT NULL,

  "nombreComun" TEXT NOT NULL,
  "nombreCientifico" TEXT,
  "tipoVegetativo" TEXT,
  "cantidad" INTEGER,
  "finalidad" TEXT,
  "mesInstalacion" INTEGER,
  "anioInstalacion" INTEGER,
  "observaciones" TEXT,

  "cites" BOOLEAN NOT NULL DEFAULT false,
  "citesProcedencia" TEXT,

  "situacionActual" TEXT,
  "produccionCantidad" DECIMAL(14,4),
  "produccionUnidad" TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "ForestPlantacionEspecie_tenantId_bloqueId_idx"
  ON "ForestPlantacionEspecie" ("tenantId", "bloqueId");
CREATE INDEX IF NOT EXISTS "ForestPlantacionEspecie_deletedAt_idx"
  ON "ForestPlantacionEspecie" ("deletedAt");
