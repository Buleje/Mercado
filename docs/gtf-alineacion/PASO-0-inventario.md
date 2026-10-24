# Alinear el sistema con la GTF — Paso 0: inventario (2026-10-03)

> Misión de Brandon: el sistema debe dar **exactamente** los números de la GTF de SERFOR.
> Caso real: la GTF suma **31,188 m³** y el sistema **31,185 m³** (39 filas, 2 082 piezas).
> Este documento lista dónde se calculan, suman, redondean, muestran y exportan m³, piezas y
> pies tablares (PT). **Nada se modificó todavía**: se espera el OK.
>
> Fuente: 4 barridos de solo lectura (lógica forestal, base de datos/SQL, API, pantallas) y las
> líneas clave verificadas a mano con `sed -n`/`grep -n` (marcadas ✔).

## 0. En corto

| Hallazgo | Medido |
|---|---|
| El total de la GTF que imprime el sistema suma crudo | ✔ `lib/forestal/ctp-gtf-formato.ts:136` imprime cada fila con `toFixed(3)`; `:142` suma `l.total` sin redondear; `:152` imprime `total.toFixed(3)` → filas que suman 31,188 con un total de 31,185 en el MISMO papel |
| El Anexo 04 redondea la fila pero suma el exacto | ✔ `anexo04-serfor.ts:262` fila `r3`; `:270` subtotal `r3(Σ exactos)` (a propósito, comentario `:268`); `:286` total por hoja y `:291` total del anexo `r3(Σ m³ crudo)` |
| El total de una GTF guardada suma crudo | ✔ `lib/db/forest-gtf.db.ts:149` `volumenTotal = Σ Number(volumeM3)` → `ForestGtf.volumenTotalM3` |
| El PT de cada fila del cubicador se redondea ANTES de sacar el m³ | ✔ `cubicacion.ts:143` `pieTablar = r2(ptUnit × cant)` y `:144` `m3 = r4(pieTablar/424)` → el m³ sale de un PT ya redondeado a 2 decimales |
| No hay librería decimal | ✔ `package.json` sin `decimal.js`/`big.js`; todo es `float` con `Math.round(x·10ᵏ)/10ᵏ` o `toFixed` (falla en casos como 1,0005) |
| Redondeos sueltos | ~131 archivos de `lib/forestal` con `const r2/r3/r4` propios; ~40 `Math.round(…×10000)` y ~109 `toFixed` en pantallas; ~340 sumas/redondeos en `lib/db` |
| Precisión guardada | Todo volumen es `Decimal(12,4)` o `(14,4)`; no existe ningún `(12,3)` ni `(18,6)` de volumen |
| La «fila GTF» (científico + tipo) no existe como clave | La especie se compara por **nombre común** en 3 `claveEspecie` distintas; el científico sólo se usa en `acomodar-trozas.ts:51` |
| Copal TABLA vs COMERCIAL | El tipo lo decide `clasificarTipo` por medidas (`cubicacion-tipo.ts:61`); 1″ de espesor y ≥ 6′ = TABLA. La GTF lo dice COMERCIAL: no hay validador de m³/pieza por tipo |

La tabla de la GTF real que pasaste se verificó: **39 filas · 2 082 piezas · 31,188 m³ · página 1 = 5,633 · página 2 = 25,555** (Python `Decimal`).

## 1. Dónde nace la diferencia (prioridad 1)

| Archivo:línea | Qué hace | Cómo redondea hoy | Regla GTF |
|---|---|---|---|
| ✔ `lib/forestal/ctp-gtf-formato.ts:136,142,152` | Tabla (37a–37g) y «Volumen Total» de la GTF de salida | fila `toFixed(3)`; total `Σ crudo` → `toFixed(3)` | total = Σ filas redondeadas |
| `lib/forestal/ctp-gtf-desde-libro.ts:172` | GTF armada desde el libro | `volumen = Σ l.total` crudo → `fmtM3` | idem |
| `lib/forestal/ctp-gtf-desde-serfor.ts:145-149` | Reproduce la hoja de SERFOR | `volumenTotal ?? Σ p.volumen` → `toFixed(3)` | usar el total oficial o Σ filas redondeadas |
| `lib/forestal/serfor-gtf-print.ts:31,43` | Impresión de la GTF de SERFOR | `toFixed(dec)`; total `volumenTotal ?? Σ` | idem |
| `lib/forestal/loth-guia-despacho.ts:112-114,123-153` | GTF del LO-TH: total y detalle por especie | `r4(Σ crudo)`; agrupa **sólo por especie común** (sin tipo) | fila = científico + tipo |
| `lib/forestal/guia-th-al-ctp.ts:255,273-308` | Lista de trozas → líneas de ingreso | agrupa sólo por especie; acumula `r4` | idem |
| ✔ `lib/db/forest-gtf.db.ts:149-152` | Total y piezas de la GTF al guardar | `Σ Number(volumeM3)` sin redondeo | Σ filas redondeadas |
| ✔ `lib/forestal/anexo04-serfor.ts:262,270,286,291` | Fila, subtotal de bloque, total de hoja y del anexo | fila `r3`; subtotal `r3(Σ exactos)`; hoja y total `r3(Σ m³)` | bloque = fila GTF (`r3(Σ exactos)`); totales = Σ bloques redondeados |
| `lib/forestal/anexo04-excel.ts:63,99,246-249` | Excel del Anexo 04 | `ROUND(SUM(…),3)` por hoja; TOTAL = Σ totales ya redondeados | idem |
| `lib/forestal/serfor-gtf-a-ingresos.ts:158-171,207-210` | GTF de SERFOR → ingresos | `declarado ?? Number(Σ troza.toFixed(4))`; compara `toFixed(3)` | el número oficial manda |
| `lib/forestal/loth-importar-guia.ts:54-56,619-624,731,933-946` | Importa la GTF al LO-TH | `r2/r3/r4`; compara `Σ trozas` con el declarado | idem |

## 2. Funciones que ya existen (reusar o reemplazar)

| Función | Archivo:línea | Qué hace hoy | Uso aprox. |
|---|---|---|---|
| `PT_POR_M3 = 424` | `cubicacion.ts:78` | factor comercial único | ~25 archivos |
| `cubicarPieza` | `cubicacion.ts:125` | PT `r2` por fila, m³ `r4(PT/424)` | 13 |
| `m3DesdePt` / `ptDesdeM3` | `cubicacion.ts:148,168` | `r4(pt/424)` / `r2(r3(m3)·424)` | 7 / 8 |
| `pieTablarAserrableDe` | `cubicacion.ts:90` | `Math.round(m3·rend·424)` | pocos |
| `fmtM3` `fmtPt` `fmtPiezas` | `cubicacion-formato.ts:25-62` | presentación (m³ 3 dec, PT entero) | `fmtM3` ~320 archivos |
| `fmtAnexo` | `anexo04-serfor.ts:152` | `toFixed(dec)` con coma | 8 |
| `reconciliarTotales` | `anexo04-serfor.ts:200` | reparte milésimos entre hojas para que sumen | 1 |
| `repartirPt` | `detalle-de-jornada.ts:224` | mayor resto (PT enteros que suman el total) | 2 |
| `ptOxapampa` / `redondearPt` / `DIVISOR_OXAPAMPA=24.5` | `cubicacion-oxapampa.ts:91,59,23` | PT rolliza por troza a 2 dec | 1 |
| `redondear2` | `medidas-troza.ts:28` | con `Number.EPSILON` | 1 |
| `aPieTablar` | `loctp-catalogos.ts:253` | `toFixed(1)` de m³·424 (regla distinta) | — |
| `r4` exportado | `loth-guia-despacho.ts:96` | único `r4` exportado | — |

**Dos reglas de PT distintas conviven**: `Math.round(m3·424)` (entero) en `lotes-aserrio.ts:307`, `consumo-trozas.ts:365,411`, `detalle-de-jornada.ts:196,317`, `reportes-produccion.ts:337`, `saldo-por-permiso.ts:290`; y `ptDesdeM3` (2 decimales). Más `aPieTablar` (1 decimal) y `lote-metricas.ts:48` `r1`.

## 3. Inventario por capa

Leyenda: ⚠️ suma valores sin redondear por fila y redondea al final · 🔁 redondeo suelto que duplica un helper · 📥 entra el número oficial de una guía.

### 3.1 Base de datos — campos (`prisma/schema.prisma`)

| Línea | Modelo.campo | Tipo |
|---|---|---|
| 5809 / 5810 | `WoodEntry.volumeM3` / `pieces` | Decimal(12,4) «4 decimales, precisión forestal» / Int |
| 5925 / 5924 / 5989 | `WoodEntryTroza.volumenM3` / `cantidad` / `recibidaVolumenM3` | (12,4) / Int / (12,4) |
| 5952 · migración 20260926 | `WoodEntryTroza.oxLargoPies` / `oxPt` | (8,2) / (12,2) |
| 6163 / 6167 / 6169 | `ForestLothEntry.volumeM3` / `quantity` / `pieces` | (12,4) / (14,4) / Int |
| 6333 / 6366 | `ForestPlanSpecies.volumenAutorizadoM3` / `ForestCensusTree.volumenEstimadoM3` | (12,4) |
| 6413 / 6414 / 6415 | `ForestGtf.items` / `volumenTotalM3` / `piezasTotal` | Json / (12,4) / Int |
| 6473 / 6482 / 6484 | `ForestCtpEntry.volumeInputM3` / `quantity` / `pieces` | (12,4) / (14,4) / Int |
| 6637 | `ForestCtpReproceso.quantity` | (14,4) |
| 6672 / 6675 / 6682 | `ForestCtpPaquete.cantidad` / `volumenM3` / `pieTablar` | Int / (14,4) / (12,2) |
| 6764 / 6852 / 7154 | `ForestCtpDespachoOrigen.quantity` / `ForestCtpConsumo.volumeM3` / `ForestProdLoteMiembro.quantity` | (14,4) / (12,4) / (14,4) |
| 7338 / 7412 | `ForestVehiculo.capacidadM3` / `ForestFlete.volumenM3` | (10,3) / (12,4) |
| 8582-8583 | `ForestPatioConteo.m3Esperado` / `m3Contado` | (12,4) |
| 5488 / 5556 | `AdelantoEntrega.piesTablares` / `cantidad` | (12,2) / (12,3) |

JSON con m³ y PT embebidos: `costoDetalle`, `aserrioDetalle`, `faltantes`, `detalle` (5868, 6529, 8585, 8594). DDL de esas columnas en `scripts/forestal-*-migration.sql`, `prisma/manual-migrations/313,318,349-*.sql`, `prisma/migrations/20260926_*`, `20260929_*`, `adr-429-*`: todas en 4 decimales.

### 3.2 Base de datos — clases `lib/db` (representativos de ~340 sitios)

| Archivo:línea | Qué hace | Redondeo |
|---|---|---|
| ⚠️ `forest-gtf.db.ts:149-153` | total y piezas de la GTF → `volumenTotalM3` | ninguno |
| `wood-entries.db.ts:6178` / `6200` | suma de piezas → `volumeM3` / `pieces` | `toFixed(4)` al final / entero |
| ⚠️ `wood-entries.db.ts:1905, 3541, 5709, 5714, 3070, 4805, 6323-6330` | volumen de ingresos creados, trozas candidatas, m³ agregados, total `ox.pt`, sin costo, agregado por especie | ninguno |
| `wood-entries.db.ts:2223, 3257, 4261, 4380, 4600-4707` | `_sum` de volumen (stock, KPIs, CITES, valorizado) | `Number(Decimal)`; `r4` por total (4741-4817) |
| `wood-entries.db.ts:5215` | `m3` de `sin` | `Math.round(×1000)/1000` al final |
| `forest-ctp.db.ts:1546, 1802, 4113, 4706` | paquetes, disponible, apertura | `r4` |
| ⚠️ `forest-ctp.db.ts:877, 955, 1264-1356, 3504-3526, 4864-4931, 5509, 5818` | saldos de corrida (producido − despachado − reprocesado − consumido), apertura, consumido | crudo |
| ⚠️ `forest-ctp-consumo.db.ts:500, 519-521` / `727` | atribuido y ya consumido por ingreso / atribuido | crudo / `r4` |
| ⚠️ `forest-ctp-despacho.db.ts:385, 829` / `957-976` | atribuido del despacho / `_sum` quantity | crudo / `r4` |
| ⚠️ `forest-ctp-saldo-corrida.ts:85-100`, `forest-ctp-anular-dia.db.ts:101` | saldo de corrida, consumo del día | crudo |
| `forest-ctp-usado-lotes.db.ts:326-327`, `forest-ctp-guia-desde-anexo.db.ts:412` | totales | `r4`/`r2` |
| `forest-lote.db.ts:153-187, 266-276, 787` | m³ por miembro y lote | `r4` (177-187 crudo ⚠️) |
| `forest-lote-aserrio.db.ts:452-491, 2721-2733` ⚠️ / `578, 969, 1452, 1608, 2226, 1938` | salidas y reprocesos / volúmenes de trozas y paquetes | crudo / `r4` |
| `forest-lote-mixto.db.ts:288`, `forest-vincular-corrida.db.ts:689,692,803`, `forest-vincular-trozas.db.ts:1011,1260`, `forest-lote-propuesta.db.ts:286`, `forest-loth.db.ts:642`, `forest-loth-importar.db.ts:708` | volúmenes | `r4` |
| ⚠️ `forest-loth.db.ts:975-977, 1058-1062, 1166-1180, 1541-1547, 1571-1577` | topes y totales del LO-TH | crudo |
| ⚠️ `forest-plan.db.ts:303, 425-430, 1085-1086, 1158`, `forest-contrato.db.ts:381-422, 503-605, 721-781` | plan y contrato | crudo |

### 3.3 SQL crudo, migraciones y seeds

- `wood-entries.db.ts:2493` `COALESCE(SUM(t."volumenM3"),0)::float8` (sin ROUND) · `forest-contrato.db.ts:547-556` prorrateo con `sum(…)`.
- `scripts/forestal-ctp-despacho-origen-migration.sql:154` `p.quantity - SUM(o2.quantity)` · `scripts/forestal-ctp-fk-costos-migration.sql:180` `w.volumeM3 - SUM(c2.volumeM3)`.
- No hay vistas, funciones ni triggers de volumen.
- Seeds: `scripts/seed-forestal-ctp.mjs:71,158,215,226,257` (π/4 y `r4`; `pieces = round(producido·12)`), `scripts/qa-sembrar-libro.mjs:149-262` (`r3`/`r4`).
- KV (`PlatformSetting`): cubicaciones (`forest-cubicaciones.db.ts:26`, totales con m³ = PT total ÷ 424), anexos (`forest-anexos.db.ts:29`), distribuciones (`forest-distribuciones.db.ts:19`, `r4`/`r2`).

### 3.4 API (`app/api/**`)

Las rutas casi no calculan: delegan a `lib/db` y `lib/forestal`. Lo propio:

| Archivo:línea | Qué hace |
|---|---|
| ⚠️ `forestal/wood-entries/import/route.ts:404` | suma consumos de MP sin redondeo |
| ⚠️ `forestal/wood-entries/aggregate/route.ts:44` | `grandTotal` = Σ totales por especie (no por fila) |
| `forestal/ctp/cierre/route.ts:149-151` | snapshot de cierre (valores de `lib/db`) |
| `forestal/ctp/to-product/route.ts:84` | `stock = Math.round(quantity)` (trunca m³ a entero) |
| `forestal/ctp-serfor-import/route.ts:80, 270-272` | diámetros a 2 dec; tolerancia de consumo 0,0001 |
| Zod (todas `z.coerce.number()` sin `.multipleOf`) | `ctp/route.ts:75-382`, `ctp/consumos`, `ctp/origenes`, `ctp/reproceso`, `lotes*`, `loth`, `gtf/route.ts:28-31`, `wood-entries*`, `anexos/route.ts:30-78`, `cubicaciones/route.ts:34`, `distribuciones`, `trozas/retrozar`, `plan*` |
| 📥 `forestal/gtf-ocr/route.ts:66,104,125` | foto/PDF de GTF por visión (total, no filas) |
| 📥 `forestal/sniffs-ocr/route.ts:34,44,92` | SNIFFS por foto (pide 3 decimales sin redondear) |
| 📥 `forestal/gtf/serfor/route.ts:11` · `wood-entries/desde-serfor/route.ts:15-16,196,234` | consulta y reparte la GTF de SERFOR (`serfor-gtf-a-ingresos`) |
| 📥 `forestal/wood-entries/import/route.ts:73-166` | importador Excel/CSV |
| 📥 `forestal/ctp-serfor-import/route.ts:201` · `loth/importar-guia/*` · `guias/guardadas/*` | reportes y guías de SERFOR |
| `forestal/loth/export/route.ts:61-66` | único export del servidor (Excel LO-TH) |

### 3.5 `lib/forestal` por subárea (lo que no está en §1)

- **Cubicación**: `cubicacion-oxapampa.ts:110-120` ⚠️ (total PT crudo) · `cubicacion-resumen.ts:105-136` ⚠️ (`agruparPor`), `:169-173` (CSV `toFixed(2/4)`) · `cubicacion-registro.ts:103-107` ⚠️ (m³ = PT total ÷ 424, a propósito) · `cubicacion-meta.ts:94-99` · `cubicacion-trozas.ts:72,118` ⚠️ · `cubicacion-trozas-resumen.ts:59` · `cubicacion-liquidacion.ts:41-52` (🔁 `fmtPt`) · `cubicacion-insights.ts:37,65,112` · `lote-mixto.ts:285-330` · `madera-del-lote.ts:79-90` · `lote-metricas.ts:43-65` (`r1`) · `productos-de-lote.ts:99,153-159,235` ⚠️ (acumula `r3`) · `productos-disponibles-resumen.ts:184,207,373-376` · `lotes-aserrio.ts:232-242,307`.
- **Reparto/distribución**: `cubicacion-reparto.ts:402-403` 🔁, `473-482`, `564-656`, ⚠️ `694-699, 804-889` (`amparadaPt` 811/842), `957-993` (acumula redondeado), `2298-2377`, `2449-2474`, `2515-2518` (CSV `toFixed(4)`), tolerancias `1532-1591` · `reparto-cuadre.ts:115-156` · `reparto-revision.ts:35` · `cubicacion-cuadre.ts:52-254` · `consumo-en-jornadas.ts:57,131` · `variado-desglose.ts:100`.
- **Anexo 04 (resto)**: `anexo04-serfor.ts:165-168` (`ptExacto` sin redondeo), `304-308` · `anexo04-partir.ts:54-56` · `anexo04-vista.ts:127,184-186` · `anexo04-cuadre.ts:97-303` (`TOL_CUADRE_M3=0.0005`) · `anexo04-comparar.ts:24-190` · `anexo04-validacion.ts:234` · `anexo04-registro.ts:281` · `anexo04-pdf.ts` · `anexo-por-permiso.ts`, `anexo-encadenado.ts`, `anexo-a-despacho.ts:56-57,186-250`.
- **Guías (resto)**: `ctp-gtf-print.ts:53` · `conteo-guia-th.ts:53-55,132,197,269-278` · `ingresos-por-guia.ts:99,144-193` ⚠️ · `ficha-guia-resumen.ts:97-99,115` · `guia-descuadre.ts:33,50-74` (`TOLERANCIA_M3=0.001`) · `cuadre-trozas.ts:23` · `ctp-verificacion.ts:19,49`.
- **Saldos**: `ctp-saldos-analisis.ts:26,117-209` · `ctp-saldos-vista.ts:64,77-165` · ⚠️ `ctp-saldos-csv.ts:36,143-221` · `saldo-por-permiso.ts:46,131-314` · `volumen-del-permiso.ts:375-695` · `volumen-disponible.ts:84,308-381` · `loth-saldo-cascada.ts:68-121` · `loth-restante.ts:29-228` · `loth-kardex.ts:150-377` · `loth-kardex-reporte.ts:44-126` · `disponibles-csv.ts:46` · `ctp-secciones-csv.ts:40` · `ctp-ingresos-csv.ts:94` · `permiso-ficha-export.ts:70-148` · `planta-resumen.ts:47` · `trozas-disponibles.ts:62,452`.
- **Despacho y consumo**: `despacho-lista.ts:42,132-171,229,275-277` · `atribucion-despacho.ts:42-56` · `consumo-trozas.ts:358-514` · `loctp-consumos-analisis.ts:20-290`.
- **Producción y lotes**: `produccion-paquetes.ts:32-122,296-314` · `produccion-sin-lote.ts:26-312` · `produccion-import.ts:143-238` · `declarar-produccion.ts:29-212` · `declarar-por-dueno.ts:38-89` · `piezas-del-dia.ts:132-301` · `origen-y-salida-del-dia.ts:107-312` · `resumen-de-jornadas.ts:104-238` · `detalle-de-jornada.ts:127-345` · `reportes-produccion.ts:91-829` · `sniffs-produccion-parse.ts:23` · `sniffs-cotejo-sin-lote.ts:46` · `reprocesos-declarados.ts:30` · `lote-programacion.ts`, `lote-desde-propuesta.ts`, `propuesta-de-lotes.ts`, `lote-por-escaneo.ts`, `lote-certificado.ts`, `historia-lote.ts:35,279-337`.
- **Radar, cierre y reportes**: `ctp-radar*.ts` · ⚠️ `ctp-cierre-checklist.ts:49` (¡2 decimales!) · `loth-cierre-resumen.ts:60-122` · `ctp-cuadros-resumen.ts:57-98` · ⚠️ `ctp-kpis-seccion.ts:81-135` · `ctp-cadena-import.ts:34-333` · `ctp-cogs.ts:86-154` · `ctp-pnl.ts:21-144` · precios y cobro por PT (`precio-de-pieza.ts`, `precio-cliente.ts`, `tarifa-aserrio.ts`, `aserrio-cobro.ts`, `cuenta-corriente.ts`, `proveedor-trazabilidad.ts`) · LO-TH (`loth-extraccion.ts`, `loth-trace.ts:246-394`, `loth-analitica.ts:77`, `loth-zafra.ts:75`, `loth-medicion.ts:38`…).
- **Exportadores**: ⚠️ `cubicador-export.ts:51-58, 78-85, 138-144, 348-389, 441-452` · ⚠️ `distribucion-export.ts:32-81, 262, 291, 356-399, 463, 491, 555-606, 633-726` · `ctp-export.ts:156-162` · `loth-export.ts:234` · `historia-lote-export.ts:29-30` · `ctp-informe.ts:35` · `ctp-existencias-print.ts:270-321` · `lib/export-excel.ts` y `lib/export-utils.ts` (no redondean: escriben lo que reciben).

### 3.6 Pantallas (`components/admin/forestal/**`, `app/verificar/**`)

Conteo aproximado: ~109 `toFixed` y ~68 `Math.round(…×1000/10000)` sobre volúmenes, ~182 `.reduce` de m³/PT/piezas, ~111 `formatNumber(…,3|4)`. Ninguna pantalla redondea por fila antes de sumar.

| Archivo:línea | Qué hace |
|---|---|
| ⚠️ `CubicadorMadera.tsx:1577-1578, 1720, 1965, 2164-2165`; 🔁 `:171-172` (`fmtPt` 2 dec, `fmtM3` propios) | totales y CSV de la cubicación (m³ desde PT crudo) |
| ⚠️ `CubicacionResumenes.tsx:187-193, 257-260` | resúmenes y CSV (4 dec) |
| ⚠️ `ResumenReparto.tsx:980-1156, 1687`; `reparto-vistas.tsx:167,242,499`; `reparto-reprocesos.tsx:112,446,605`; `reparto-paquetes.tsx:134`; `reparto-anexo-permiso.tsx:200-204` (CSV 4 dec) | reparto |
| `Anexo04Campos.tsx:51-53, 570-585`; `Anexo04Modal.tsx:420-464`; `Anexo04BloquesPapel.tsx:41,61`; `Anexo04Hoja.tsx:189-298`; `Anexo04Cuadre.tsx:115`; `Anexo04Comparar.tsx:19-25`; `Anexo04Historial.tsx:162-170` | Anexo 04 (muestran lo que arma `anexo04-serfor`) |
| ⚠️ `productos-disponibles-tabla.tsx:60-61,110,190`; `productos-disponibles-acciones.tsx:52`; `volumen-disponible-combinado.tsx:188,253`; `volumen-disponible-pilas.tsx:58` | stock y volumen disponible |
| ⚠️ `CtpCubicacionParaConsumo.tsx:111-114`, `CtpConsumosPicker.tsx:43`, `CtpProduccionDeLote.tsx:287,313`, `CtpCorridaSinDeclarar.tsx:121,152`, `CtpSumarALaCorrida.tsx:64`, `CtpTrozasDelLote.tsx:153`, `CtpPegarSniffsLote.tsx:49`, `CtpImportarProgramacionesModal.tsx:139`, `CtpLotesAvisos.tsx:40`, `CtpDespacharDesdeLotesModal.tsx:147`, `CtpSerforImportModal.tsx:288` | sumas con `round ×1000/10000` |
| ⚠️ `CtpIngresosView.tsx:156`, `CtpGtfIngresadasKpis.tsx:74-75`, `CtpGuiaFichaModal.tsx:152`, `CtpGuiaSerforTrozas.tsx:113`, `CtpResumenPermisoModal.tsx:139,369-377`, `LothGtfView.tsx`, `LothGuiaRegistrada.tsx:103`, `LothImportarGuiasFicha.tsx:88`, `LothImportarGuiasEspecies.tsx:148`, `LothTrozadoMultipleModal.tsx:118` | guías e ingresos |
| 🔁 `CtpIngresosKpis.tsx:276-507` (2 y 3 dec), `CtpGuiasBandeja.tsx:66` (2 dec), `SpeciesAggregateChart.tsx:105,147` (2 dec), `CtpBalanceProduccion.tsx:228`, `LothMedicionFuste.tsx:101` (4 dec), `CtpListaProductosTab.tsx:170-256` (4 dec), `CtpBuscarGtf.tsx:325` | formatos sueltos |
| 🔁 `r4` propio: `LoteMiembrosEditor.tsx:33`, `ctp-sin-origen-comun.ts:10`, `vincular-cubicacion-cuadre.ts:68`, `CtpAtribucionEditor.tsx:67`, `loth-extraccion-excel.ts:12`; `ImportarTrozasModal.tsx:24` (`fmtM3` propio) | duplicados |
| `app/verificar/despacho/[id]/page.tsx:41,134,251`, `app/verificar/lote/[id]/page.tsx:15`, `app/verificar/[code]/page.tsx:105` | páginas públicas del QR: muestran con 4 decimales lo del servidor |

## 4. Tipo de producto y especie

- **Tipo**: `TipoComercial` en `cubicacion-tipo.ts:26-33` = Comercial, Paquetería larga, Paquetería corta, Tabla, Larga angosta, Corta, Otro. Regla `clasificarTipo` (`:61`) y single source `tipoDePieza` (`:108`, 24 consumidores). El LO-CTP tiene ~17 productos «MADERA ASERRADA (…)» (`loctp-catalogos.ts:24-46`) con `tipoComercialDelProducto` (`:138`) y `productoDelTipoComercial` (`:163`). La GTF que mandaste usa 4: COMERCIAL, LARGA ANGOSTA, CORTA, TABLA.
- **Especie**: tres `claveEspecie` distintas — `loth-constants.ts:89` (quita el paréntesis científico, tildes, mayúsculas: nombre común; ~104 imports), `cubicacion-reparto.ts:408` (sólo trim/minúscula) y `especies-fotos.ts:52` (sin tildes, no quita el paréntesis). El científico vive en el catálogo (`especies-catalogo.ts`, campo `cientifico`) y sólo se usa como clave en `acomodar-trozas.ts:51`. Las guías agrupan por nombre común (`loth-guia-despacho.ts:130`, `guia-th-al-ctp.ts:255`).

## 5. Conciliación que ya existe (para no reinventar)

`guia-descuadre.ts` (cabecera vs lista, propuestas de cuadre) · `cuadre-trozas.ts:36` · `anexo04-comparar.ts:166` (exacto / redondeo / difiere por especie × tipo) · `anexo04-cuadre.ts` + `reconciliarTotales` · `reparto-cuadre.ts:232` (7 controles) + `cuadre-del-papel.ts` · `reparto-revision.ts:74` · `cubicacion-cuadre.ts:77,254` · `cubicacion-comparar.ts:39` · `ctp-verificacion.ts:49` · avisos de total declarado vs suma en `serfor-gtf-a-ingresos.ts:207`, `guia-th-al-ctp.ts:301`, `loth-importar-guia.ts:619` · `conteo-guia-th.ts` · `ctp-cuadros-resumen.ts` · cotejo SNIFFS · importadores SERFOR (`serfor-gtf*.ts`, `ctp-gtf-desde-serfor.ts`, `ctp-serfor-a-libro.ts`, `loth-importar-guia*.ts`). El candado de cierre ya existe en el cierre mensual del libro (`ctp/cierre`).

## 6. Decisiones que necesito antes de tocar código

1. **Dónde vive el «m³ oficial»**. No existe una entidad «fila GTF» en la base: `ForestGtf.items` es JSON. Opciones: (a) **recomendada** — calcular el m³ oficial con la función central al armar la fila GTF (y guardarlo en el JSON de la guía/anexo emitido), sin migrar columnas: las líneas siguen con 4 decimales como dato intermedio; (b) migrar las columnas oficiales a `NUMERIC(12,3)` y las intermedias a `NUMERIC(18,6)` como pediste (DDL en producción, zona de peligro, con respaldo y plan expand → migrate → contract).
2. **Paquetería y «Otro»** no están entre los 4 tipos de la GTF. Propuesta: Paquetería larga → COMERCIAL, Paquetería corta → CORTA (es lo que dice la medida 6×6), «Otro» → no se emite sin revisar. ¿Así, o la GTF de Blas usa «MADERA ASERRADA (PAQUETERIA)»?
3. **Validador de m³/pieza**: con el rango fijo 0,07–0,11 para COMERCIAL, en tu propia GTF saldrían **3 falsos positivos** (Cachimbo 0,054 · Shimbillo 0,049 · Panguana 0,112). Propuesta: marcar cuando el m³/pieza de una fila cae en la banda de OTRO tipo (Copal COMERCIAL = 0,0053, igual que todas las TABLA de la guía: 0,0052–0,0054), con bandas sacadas del histórico y configurables.
4. **PT de cada fila del cubicador**: hoy se redondea a 2 decimales antes de pasar a m³ (`cubicacion.ts:143-144`). «Precisión completa» pide sacar el m³ del PT exacto. No cambia la fórmula, sí el número guardado de cubicaciones viejas al re-cubicar. ¿Lo cambio?
5. **Factor**: el sistema usa m³ = PT ÷ 424 para aserrada. Lo asumo como el de la GTF salvo que digas otro.
6. **Las GTF de ingreso que vienen de SERFOR** ya traen su número oficial: propongo NO recalcularlas en la migración (guardar el de SERFOR tal cual) y recalcular sólo lo que el sistema produce (GTF de salida, Anexo 04, totales derivados).

### Decidido por Brandon (2026-10-03)

| # | Decisión |
|---|---|
| 1 | El m³ oficial se calcula al armar la fila GTF y se guarda en lo emitido (JSON); **sin migrar columnas** |
| 2 | Paquetería larga → COMERCIAL, corta → CORTA; «Otro» no se emite sin revisar |
| 3 | Validador: marca si el m³/pieza cae en la banda de OTRO tipo (bandas del histórico, configurables) |
| 4 | ~~El m³ de la pieza sale del PT **exacto**~~ **Revertida 2026-10-03**: el m³ de cada línea vuelve a ser PT a 2 decimales ÷ 424 a 4 decimales (`cubicarPieza`), porque es lo que ya está en el LO-CTP de SERFOR. Con el PT exacto, 7 de las 39 filas de la GTF real se movían 0,001 (31,183 contra 31,188). Verificado con las 3 cubicaciones reales de Blas: 0 filas distintas de lo que mostraba el sistema antes. El Anexo 04 en pie tablar sigue imprimiendo el PT exacto de cada renglón (`ptExactoDeLinea`). |
| 5 y 6 | Asumidos sin objeción: factor 424; las GTF de ingreso de SERFOR no se recalculan |

## 7. Fases propuestas (cada una con su commit y resumen)

1. **Redondeo central**: `lib/forestal/gtf-redondeo.ts` con `redondearGTF` (HALF_UP, `decimal.js`) y `totalizarGTF(filas)`; test 0,0955 → 0,096 y 0,0954 → 0,095; fixture de la GTF real (31,188 · 2 082 · 5,633 + 25,555). Se enchufa primero en §1 (GTF impresa, Anexo 04, total de `forest-gtf.db`), después en exportadores y pantallas; los `r2/r3/r4` sueltos se reemplazan por archivo tocado.
2. **Catálogo**: los 4 tipos con el texto exacto de la GTF; especie por científico (llave) con el común al lado; reporte de lo que no calce.
3. **Validador** de m³/pieza por tipo (según la decisión 3). **Hecho `84635f6d3`**: `lib/forestal/gtf-validador-tipo.ts` (banda = mediana ÷3 a ×3, de la guía con ≥3 filas del tipo o del histórico); con la GTF real sólo marca Copal COMERCIAL. Aviso en pantalla en la sección GTF del despacho, la guía registrada, la GTF desde el Anexo 04 y la hoja de la guía de SERFOR al aceptarla.
4. **Conciliación GTF vs sistema**: ingreso manual y CSV (punto de extensión para PDF), semáforo ✅ 🟡 🔴 ⚫, totales, PDF/Excel, candado del cierre con justificación. Reusa `anexo04-comparar`, `guia-descuadre` y el cierre existente.
5. **Migración**: reporte antes/después de qué totales cambian y respaldo; espera tu OK antes de sobrescribir.
