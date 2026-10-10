# ADR-342 — El lote se programa antes de cargarlo

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · pestaña Lotes de aserrío · formulario «Programar producción» del SNIFFS
- **Relacionado:** ADR-334 (lote de aserrío) · ADR-337 (pestaña propia) · ADR-339 (bandeja de guías) · ADR-340 (consumir en el patio) · ADR-341 (el montón en Consumos)

## El problema

El modal de lote pedía **identidad y piezas a la vez**: no se podía anotar una
orden de producción sin tener ya decidida la madera. En la planta el orden es el
opuesto — la orden se programa a la mañana y la pila se elige frente a la sierra
— y el formulario del SNIFFS lo refleja: «Programar producción» pide N° de lote,
orden, tipo de producto a consumir, ventana del proceso, especie y descripción.
Ninguna troza.

## La decisión

### 1. El modal es el formulario oficial

| Campo | De dónde sale |
|---|---|
| **N° de lote** | Correlativo del centro, asignado al guardar (`LA-2026-00N`) |
| **Orden de producción** | Texto libre — cada planta numera a su manera |
| **Tipo de producto a consumir** | Rolliza (default) · aserrada · tablones · otro |
| **Inicio / Fin del proceso** | La ventana; el fin puede quedar abierto |
| **Especie** | **Las que hay en el patio**, con su conteo y volumen a la vista |
| **Descripción** | Para qué se armó |

Cuatro columnas nuevas en `ForestLoteAserrio` (migración 342, idempotente,
aplicada por el pooler).

La especie no es un texto libre: se elige de lo que **de verdad hay**, porque un
lote programado para una especie sin madera nace vacío y nadie sabe por qué.

### 2. Elegir el lote en Consumos filtra la tabla sola

`trozasDelLote()` (puro, 12 tests) decide qué piezas le corresponden: su especie,
libres o ya apartadas en él, **de guías recibidas**. Al elegir el lote la tabla
del patio se acota y lo dice con un chip —«sólo Tornillo · Madera rolliza»—:
una tabla que muestra menos sin explicar por qué se lee como que falta madera.

El botón de la tarjeta pasó de «Piezas» a **«Cargar»**, y lleva a Consumos con
el lote ya elegido.

### 3. Filtros por permiso y resolución

El patio devuelve ahora el **título habilitante** (casillero 6) y la
**resolución** (casillero 8) de cada pieza: cuando entra la carga de un permiso
entero, es por ahí que se busca. Los selectores sólo se dibujan si hay más de un
valor — uno solo es ruido.

## Consecuencias

- **El bug que destapó la verificación:** el selector de lote prometía «4 pza
  disponibles» y la tabla mostraba 1, porque `trozasDelLote` no miraba la
  recepción y tres de esas Capirona eran de una guía que seguía en la bandeja.
  Ahora el criterio es uno solo y hay un test que compara los dos caminos.
- Verificado en el tenant real: lote `LA-2026-009` programado con orden
  `OP-QA-001`, rolliza, 06→08 ago, Capirona y descripción — todo guardado y
  visible en la tarjeta; `LA-2026-010` (Tornillo) mostró **16 pza disponibles**
  en el selector y **16 filas, sólo Tornillo** en la tabla. Ambos deshechos
  después: 59 trozas, 52 libres.
