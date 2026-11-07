# ADR-433 — T3: la madera no se asierra antes de llegar al patio

- **Fecha:** 2026-09-25
- **Estado:** Aceptado (hallazgo confirmado del revisor en la ronda de ADR-432)
- **Ámbito:** los escritores de consumo por pieza del Libro CTP: `ForestLoteAserrioDB.sumarACorrida` (vincular), `ForestLoteAserrioDB.consumir` y `consumirEnPatio` (Consumos, jornadas, corrida con lote), `WoodEntriesDB.marcarTrozasConsumidas` (patio e importador de Excel)
- **Contrato:** `lib/forestal/recepcion-antes-de-la-sierra.ts` (`diaDelLibro`, `ingresoDeLaTroza`, `trozasQueEntraronDespues`, `mensajeEntroDespues`), `exigirIngresoAntesDeLaCorrida` + código `T3_ASERRADA_ANTES_DE_LLEGAR` en `lib/db/forest-ctp-consumo.db.ts`

## Contexto

`revisarVinculacion` (regla 4) ya decía en pantalla «la madera no se asierra antes de entrar al patio», pero ningún llamador le pasaba la fecha de ingreso, y el servidor no comparaba fechas. Una regla que vive sólo en la pantalla la saltea cualquier POST.

Medido el 25-09 (SELECT dentro de `BEGIN READ ONLY`):

- **Blas, 10-HUA-PUE/PER-FMP-2026-007**: de sus 46 trozas, 7 figuran recibidas el 11/09 y 39 el 23/09. De sus 30 corridas, **18 (del 07/09 al 10/09) no tienen UNA troza del permiso que hubiera llegado a su fecha**. La vinculación nueva las habría escrito igual: el libro diría que se aserró madera antes de que llegara. La causa raíz es «Recibir en bloque», que propone HOY como fecha de recepción de todas las guías (`CtpRecepcionBloqueModal.tsx:69`). Se arregla en Ingresos en otra ronda.
- **Consumos por pieza que YA violan la regla**: Blas **0** (no hay ninguno vivo). `main` **2 de 16**: la corrida 95002 (23/07) tiene dos trozas de la guía 001-0000202, recibida el 19/09.
- **Consumos por guía (m³, `ForestCtpConsumo`)**: `main` 1 de 17 caería si la regla se aplicara por guía. No se aplica (ver Fuera de alcance).

## Decisión

1. **T3.** Una troza no entra a una corrida cuya fecha es ANTERIOR a su ingreso al patio. Ingreso = la recepción de la **troza** → la recepción de su **guía** → el **asiento** de la guía si nunca se recepcionó. Manda la de la troza porque una guía de sesenta trozas se descarga en dos viajes (ADR-336). **El mismo día pasa**: se descarga a la mañana y se asierra a la tarde.
2. **El día se lee en UTC** (`diaDelLibro`). Las fechas del libro son date-only a medianoche UTC, y las que traen hora también se leen en UTC: es el día que la fila muestra (`timeZone: "UTC"`) y el que corta la pantalla (`fechaIngresoDeTroza`). En Lima, el servidor nombraría un día distinto del que ve el operador.
3. **Sólo escrituras NUEVAS.** Cada escritor la aplica a las piezas que AGREGA, antes de escribir nada:
   - `sumarACorrida`: dentro de la transacción, bajo el lock de la corrida, antes de subir el volumen.
   - `consumir`: antes de atribuir los m³ por guía y de marcar piezas.
   - `consumirEnPatio`: **antes de abrir la corrida**, con la fecha que va a tener (`fecha ?? hoy`, lo mismo que pone `ForestCtpDB.create`). Rechazar después quemaría su N° de línea.
   - `marcarTrozasConsumidas`: sólo sobre las que esta corrida todavía no tenía.
4. **Nada de lo que corrige queda trabado.** Soltar piezas (`quitarDeCorrida`, `marcarTrozasConsumidas` con menos piezas), anular una corrida y deshacer no pasan por T3. La corrida 95002 de `main` se puede seguir corrigiendo y anulando.
5. **El rechazo dice el camino**: 422 con `T3_ASERRADA_ANTES_DE_LLEGAR`, qué troza, de qué guía, qué fecha manda y por qué («por la recepción de su guía»), y «Corrige la fecha de recepción de la guía X en Ingresos, o usa una corrida del dd/mm en adelante». No manda a «corregir la fecha de la corrida», porque `entryDate` no se corrige: lo prohíbe ADR-401, ya que mueve el mes del asiento. `detail` trae `corridaId`, `lineNo`, `fechaCorrida` y la lista de trozas.

## Consecuencias

- **En Blas, 18 corridas de 10-HUA no se pueden vincular** hasta corregir las recepciones (11/09 y 23/09) en Ingresos. Es lo que la regla tiene que hacer: hoy el dato de recepción está mal, y vincular igual escribiría una contradicción en el libro oficial.
- **El importador de Excel de ingresos** (`wood-entries/import`) marca las piezas de las corridas históricas con `marcarTrozasConsumidas`. Si la recepción de la guía es posterior a la corrida del archivo, las piezas no se marcan: la corrida queda con sus m³ y el error va al log, como ya pasaba con una troza consumida o un mes cerrado. **Es un llamador legítimo que choca con datos de recepción mal cargados. No se forzó**: se corrigen las fechas y se vuelve a marcar.
- La pantalla (`revisarVinculacion` + `fechaIngresoDeTroza`) y el servidor usan el mismo orden de fechas y el mismo día UTC.

## Fuera de alcance (deuda anotada)

- **El consumo por guía en m³** (`setConsumos`: editor de materia prima, importadores, corrida con `consumos`) no lleva piezas y no se revisa por fecha. Aplicarlo por guía rechazaría corridas históricas por recepciones mal cargadas.
- **La otra cara de la regla**: corregir la recepción de una guía a una fecha POSTERIOR a las corridas que ya se comieron sus trozas. Va con el arreglo de «Recibir en bloque», en Ingresos.
- Los 2 consumos viejos de `main` (corrida 95002) siguen como están. T3 no reescribe historia.

## Alternativas descartadas

- **Sólo en la pantalla** (regla 4 de `revisarVinculacion`): cualquier POST la saltea, y `sumar-corrida` admite una sola pasada.
- **Tomar sólo la recepción de la guía**: rechaza la pieza que bajó en el primer viaje de una guía que terminó de llegar días después.
- **Revisar también las piezas que la corrida ya tenía**: traba la corrección de datos viejos. Soltar una pieza de la 95002 sería imposible.
- **Leer los instantes en Lima**: el servidor nombraría un día distinto del que muestra la fila.
- **Agregarla a ADR-432**: es un invariante nuevo del libro (T1-T2 → T3) que vale para todos los escritores de consumo por pieza, no sólo para la ficha del permiso.
