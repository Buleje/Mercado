---
name: serfor-osinfor-compliance
description: "Normas SERFOR y OSINFOR del módulo forestal: Libro de Operaciones (LO-CTP), GTF, cadena de custodia, CITES, plazos y mapeo campo↔norma. Usar cuando Brandon pregunte por SERFOR, OSINFOR, GTF, libro, plazos o fiscalización, o antes de cambiar un campo de ingreso, producción o despacho."
user-invocable: true
disable-model-invocation: false
context: main
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
argument-hint: "[ingreso | transformacion | despacho | gtf | cites | export | plazos]"
---

# SERFOR / OSINFOR en el CTP aserradero

Un dato que el fiscalizador no puede cruzar con su documento de origen no sirve: toda salida responde «¿de qué GTF o árbol salió?». Lo no negociable (invariantes I1-I6 + L1 + T1, origen = GTF, CITES, costos `null`, fechas UTC) está en la **regla `forestal-serfor`**; acá no se repite.

## Quién es quién

**SERFOR** rige (Ley 29763): Libro, GTF, SNIFFS. **OSINFOR** supervisa títulos habilitantes y puede auditar la cadena de custodia del CTP hacia atrás. **ARFFS** (el GORE) registra el CTP y autoriza correlativo y foliado. Norma: D.S. 018-2015-MINAGRI y **RDE D000025-2023-MIDAGRI-SERFOR-DE** (formato del LO-CTP; manda en campos y plazos). Contrato de trazabilidad o schema forestal nuevo → `/adr` (precedentes ADR-134, 135, 137, 311).

## Obligatorio

- Registrar **ingresos, transformación y salidas** en el LO-CTP (manual o electrónico; con soporte informático va al SNIFFS).
- Plazo del CTP: **2 días hábiles** (`PLAZO_REGISTRO_DIAS` en `lib/forestal/ctp-compliance.ts`; `FUERA_DE_PLAZO_SQL` en `lib/db/wood-entries.db.ts` repite la fórmula). Los **15 días** de `loth-constants.ts` son del libro TH (RDE 264-2019), no un bug del CTP.
- Ingreso amparado por una GTF; la salida lleva la GTF que emite el propio CTP. CITES es legal con permiso archivado y no resta score (`CATEGORIAS_QUE_RESTAN`). Detalle: `references/gtf-y-plazos.md`.
- Existencias = Σ ingresos − Σ consumidos y Σ producido − Σ despachado: se derivan, nunca son un contador aparte.

## Mapeo campo oficial ↔ código

**Ingreso → `WoodEntry`** (`lib/db/wood-entries.db.ts`)

| Oficial | Código |
|---|---|
| (1) N° de registro | `libroNro` (folio por tenant) |
| Fecha | `entryDate`; llegada a planta: `fechaRecepcion` |
| (3) Tipo de documento | `docType` (GTF o GRR) |
| (4) N° de documento | `gtfNumber` + `gtfSeries` + `gtfDate` |
| (5) N° de fuente de origen | `originSourceNumber` (texto libre, lo emite la ARFFS) |
| (9) Código de origen | `originCode` (el de la fuente; en trozas, el del bosque) |
| (10) Código de CTP | `ctpProductCode` |
| Procedencia | `originType` + `originRegion` / `originDistrict` |
| Producto y especie | `productType`; `speciesCommonName` + `speciesScientificName` |
| (11) Unidad, (12) Cantidad | `unit` (m3); `volumeM3` Decimal(12,4) |
| Proveedor | `providerName`, `providerDocument` + `providerDocumentType`, `supplierId` |
| CITES, observaciones | `speciesCites`; `notes` |

Guía consultada en SNIFFS: `serforNumeroRegistro` + `serforGtf` (ADR-312).

**Transformación → `ForestCtpEntry` con `section="produccion"`**

| Oficial | Código |
|---|---|
| Producto y especie | `productType`; `speciesCommon` + `speciesScientific` |
| Materia prima consumida | `volumeInputM3` + puente `ForestCtpConsumo` (N:M) |
| Coeficiente de rendimiento | `rendimientoPct` (salida/entrada, %) |
| Cantidad y unidad | `quantity` Decimal(14,4); `unit` (m3, pt, kg, unidad) |
| Lote | `ForestProdLote` + `ForestProdLoteMiembro` |
| Observaciones | `observations` |

**Salida → `ForestCtpEntry` con `section="despacho"`**

| Oficial | Código |
|---|---|
| Fecha | `entryDate` |
| (3) Tipo y (4) N° de documento | `docType`; `gtfNumber` (la GTF emitida) |
| (9) Código del producto | `codigoProducto` |
| Producto, especie, cantidad, lote | como en producción |
| Destino | `destino` |
| Qué producción la respalda | puente `ForestCtpDespachoOrigen` (N:M) |

Volúmenes con la precisión del schema, nunca `float` de JS.

## Más

- `references/gtf-y-plazos.md`: GTF (serie, correlativo, impresión, gemelo del LO-TH), plazos, CITES, fuentes oficiales.
- `references/invariantes-y-guardrails.md`: qué previene cada invariante, en lenguaje de fiscalizador, y qué hacer o no al meter una feature.
- Argumento: `ingreso`, `transformacion` o `despacho` → tablas de arriba; `gtf`, `plazos`, `cites` o `export` → `references/`.
