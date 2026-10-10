# ADR-450 — Recibir contando las trozas y la troza recuerda su árbol

**Estado:** Aceptado (2026-09-29), construido el servidor (L1 + L4). La pantalla (modal de recibir, ficha «Del bosque», chip del patio, columna de la corrida) va aparte, con este contrato.
**Relacionados:** ADR-325 (recepción física: la que no llegó se marca, no se borra), ADR-326 (consumo por pieza, T1), ADR-334/436 (código de planta, índice parcial), ADR-434 (fecha de llegada), ADR-442 (guía del Libro TH guardada en el CTP), I2 (`≤`, nunca `==`).

## Contexto

«Recibir» (puente Libro TH → CTP, 28-09) metía TODAS las trozas de la guía como llegadas: no había forma de decir «la guía dice 8 y bajaron 7» ni «esta llegó más corta». Y aunque en el bosque se sabe de qué árbol salió cada troza (Trozado: `treeCode` + `trozaCode`), el CTP sólo guardaba el código.

Medido (29-09, sólo lectura): Blas tiene 4 talas (100, 111, 113, 114, todas con GPS) y 2 trozados (111-A, 113-A), 0 guías del TH y 84 trozas en el CTP con 0 «no llegó»; el censo de Blas no tiene `utmZona` en ningún árbol. `main`: 375 trozas, 2 «no llegó», 6 guías del TH (1 emitida), 0 guardadas vivas.

**La trampa:** `WoodEntriesDB.crearDesdeGtfEnTx` guardaba sólo `parcela` de cada troza. `noRecepcionada`, `fechaRecepcion` y `codigoPlanta` del input se perdían sin error: L1 hubiera entrado todo como llegado.

## Decisión

### L1 · Recibir contando

1. La pantalla manda el **conteo de TODAS las trozas** de la guía (`TrozaContada`: `orden`, `llego`, `como?`, `medida?`, `obs?`), una vez cada una, y la **huella** que le dio el GET.
2. **La que no llegó entra igual**, marcada: `noRecepcionada = true`, sin `fechaRecepcion`, con el motivo en `recepcionObs` (por defecto «No llegó al patio al recibir la guía»). T1 ya la saca del consumo.
3. **m³ del ingreso = el de la guía** (I2). La diferencia es `brechaM3` y va en los avisos. **R1** (decidido 29-09): una especie de la que no llegó ninguna troza igual se registra con el m³ declarado y aviso obligatorio; no queda pendiente.
4. **La que llegó distinta** no toca D1, D2, largo, m³ ni `dimensiones` de la guía. Lo medido va en `recibidaD1Cm`, `recibidaD2Cm`, `recibidaLargoM`, `recibidaVolumenM3`; lo no corregido se copia de la guía. El m³ lo calcula el servidor con `smalianVolume` (la fórmula del Libro TH, no la de `cubicacion-verificacion`) y queda congelado. El consumo por pieza sigue con el m³ de la guía. Tolerancia de cinta: 5 cm de largo, 1 cm de Ø: dentro de ella no se guarda nada. Si mide más que la guía: aviso «¿es otra troza?», sin bloquear.
5. **Rechazos:** 409 `GUIA_CAMBIO` (la huella no es la de la lista releída bajo el candado) · 422 `CONTEO_INCOMPLETO` (un `orden` que falta, se repite o no es de la guía, o una medida en una que no llegó) · 422 `NADA_LLEGO` · 422 `FALTANTES_SIN_CONFIRMAR` (hay `llego: false` sin `confirmaFaltantes: true`). El servidor nunca deduce «no llegó» de una fila que no vino.
6. `como` (escaneada / a mano) y los `sobrantes` (códigos escaneados que no son de la guía) van **sólo a la auditoría**.
7. `leerEscaneo` reconoce el QR chico del Libro TH (`/verificar/<código>`, **R3**), menos `lote/` y `despacho/`.

### L4 · La troza recuerda su árbol

1. `WoodEntryTroza.lothTrozadoId`: el id de su línea de Trozado, **sin FK** (como `planId` en el Libro TH) e índice **no único** (un único obligaría a soltarlo al anular, la lección de `codigoPlanta`).
2. `WoodEntryTroza.arbolCodigo`: copia del `treeCode`, para el acta y para buscar «las trozas del árbol 113» (búsqueda **exacta**).
3. Lo demás **se lee** del Libro TH con el estado de su línea (`ForestLothDB.arbolesDeTrozados`, 3 consultas): tala (fecha, N°, GPS y su origen) y censo (UTM, zona —supuesta 18S si falta—, parcela, condición). El mapa usa el GPS de la tala; si no, la UTM del censo.
4. Cómo se llena: `despacharConGuia` escribe `trozadoId` en cada ítem de la guía; para guías emitidas antes, «Recibir» lo busca dentro de la transacción por plan de la guía + `trozaCode` + trozado vigente (exactamente uno, si no queda vacío con aviso). Un `trozadoId` que no es de esa troza o de ese plan se descarta con aviso.
5. El freno `TROZA_YA_EN_EL_LIBRO` suma la comparación exacta por `lothTrozadoId`.
6. **R4** (decidido 29-09): anular o borrar en el Libro TH una línea de **Trozado o Tala** cuya troza está viva en el CTP → 409 `troza_ya_en_el_ctp`, con el mismo candado que «Recibir» (N° de cada guía que despachó esas trozas, en orden).

### Migración

`prisma/migrations/20260929_troza_recibida_y_arbol` — sólo EXPAND: 6 columnas nulas + 2 índices `(tenantId, lothTrozadoId)` y `(tenantId, arbolCodigo)`. Sin backfill: Blas no tiene guías del TH y en `main` las del TH están anuladas.

### Revisión del 29-09 (revisor + seguridad, sin veto)

| Hallazgo | Arreglo |
|---|---|
| Se podía RETROZAR una troza «no llegó» (los pedazos nacen llegados y T1 mira el pedazo, no la madre): madera consumible que nunca bajó | `motivoNoRetrozable` (puro, `ctp-retrozado.ts`): no llegó, ya aserrada o despachada (vigentes), descarte → 409 `TROZA_NO_RETROZABLE` con el camino; el botón «Retrozar» se esconde con la MISMA regla |
| El `trozadoId` de la guía se aceptaba aunque su línea estuviera anulada, o con otro árbol | `atarTrozadosDeGuia` (puro): vigente + misma troza + mismo plan + mismo árbol; si no, la vigente por plan + código, con aviso; un id de otro negocio no llega entre las candidatas |
| Con el m³ de la guía tipeado a mano, 10 cm más corta salía «mide más» con brecha negativa | lo medido se compara contra `smalianVolume` de las medidas de la guía (`volumenDeGuiaPorMedidas`); lo que llegó = m³ escrito + la diferencia física (`m3QueLlego`) |
| Candados de R4 ordenados por texto | por `claveNumeroGtf` |
| `sobrantes` aceptaba invisibles/bidi que entraban a la auditoría | `limpiarMotivo` + sin controles ASCII |
| `/admin/q/%E0` tiraba URIError | se captura: lectura nula |

Los pedazos de un retrozo heredan `lothTrozadoId` y `arbolCodigo` de su madre (salen del mismo árbol).

## Invariantes que se mantienen

- I2 con `≤`: el volumen del ingreso no se mueve.
- T1: la que no llegó no se consume (`motivoBloqueo` → `no_recepcionada`).
- Cierre: el mes cerrado se sigue revisando en `prepararAltaDesdeGtf`.
- Las tres lecturas de la troza (`buscarTrozas`, `trozasDe`, `trozasDelPatio`, todas con `include`) y las whitelists (`trozas`, `trozas/ficha`, `trozas/patio` vía `trozasComoConsumibles`, `ctp/consumos`) llevan los campos nuevos.
- `crearDesdeGtfEnTx` guarda cada clave de `WoodEntryTrozaInput` (`filaDeTrozaDeGuia`); un test recorre las claves con `satisfies Required<…>`.

## Alternativas descartadas

- No crear la fila de la que no llegó: cambia el acta.
- Bajar el volumen del ingreso: mueve I2 y deja un resto que nunca se consume.
- Pisar las medidas de la guía: el libro dejaría de decir lo que dice la GTF.
- Guardarlo en las medidas Oxapampa: otra unidad y otro fin (el pago), y «Medir» del patio lo reescribiría.
- Sacar el árbol del texto del código: el origen nunca va por texto libre, y en `main` hay 10 códigos repetidos en más de una guía.
- Enlazar directo al censo: un árbol talado fuera del censo quedaría sin nada.
- Índice único en `lothTrozadoId`: lo mismo que pasó con `codigoPlanta`.
