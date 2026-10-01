# ADR-398 — Un pegado arma el lote entero, y la tarjeta lo cuadra con el SNIFFS

- **Fecha:** 2026-09-08
- **Estado:** aceptado
- **Pedido por:** Brandon — tres de las cuatro opciones que eligió tras ADR-397: pegar en el
  paso 1 para que la captura arme el lote completo, cuadre SNIFFS ↔ libro en la tarjeta, e
  importar la lista de programaciones de golpe.

## Contexto

ADR-397 dejó el pegado en el paso 2 (los paquetes). El paso 1 —N° de lote, fechas, especie,
volumen consumido— seguía tipeándose a mano, y la MISMA captura ya trae esos cuatro datos.
Además, un CTP que empieza a llevar el libro tiene decenas de programaciones ya declaradas
en el SNIFFS, y armarlas de a una es la tarde entera. Y una vez armadas, nada afirmaba si el
libro dice lo mismo que quedó declarado allá: eso se cruzaba a mano entre dos sistemas.

## Decisión

### 1. La captura llena el paso 1 y viaja al paso 2

`CtpPegarSniffsLote` en «Armar lote → Inventario» vuelca lo leído a los campos —que siguen
siendo editables— y pasa el detalle al paso 2 vía `MaterialDeInventario.sniffs`.
`CtpPegarSniffs` acepta `detalleInicial` y arranca directo en la revisión: un pegado, un
click. El producto del paso 2 se precarga con el primero que declaró el SNIFFS.

El Ctrl+V global, el arrastrar, el «Elegir imagen» y el progreso del OCR se factorizaron a
`use-lectura-pegada.ts` + `ZonaPegarSniffs`, que ahora comparten las tres puertas. Tres
copias del mismo listener es debt, no estilo.

### 2. El lote guarda la foto de lo que dijo el SNIFFS

Columna `ForestLoteAserrio.sniffs` (JSONB, nullable, migración `adr-398-lote-sniffs-ref.sql`):
lote, fechas, especie, consumido y productos con sus m³. Es la foto de un documento externo
para COMPARAR entero, no datos propios del libro — por eso JSON y no columnas.

`cuadreSniffs()` (en `lotes-aserrio.ts`, con tests) compara contra las corridas VIVAS en m³ y
devuelve `cuadra` / `difiere` / `pendiente`. La tarjeta lo muestra con el delta. Tolerancia:
**un litro** — el SNIFFS imprime tres decimales, y una tolerancia más fina que la del
documento de origen sólo fabrica rojos falsos (lección del umbral de I3).

`pendiente` no es un error: es la programación cuya producción todavía no se declaró.

### 3. La lista de programaciones entra de golpe, como PROGRAMACIÓN

`interpretarListaProgramacionesSniffs()` lee una fila por lote (N°, fechas, especie,
consumido, estado) y `CtpImportarProgramacionesModal` las revisa una por una antes de crear
nada. Cada fila nace con `crearInventario({ paquetes: [] })`: **consumo declarado, producción
pendiente** — la corrida queda abierta, que es el estado que ADR-364/365 ya saben completar
desde la tabla de Producción. Reusar esa puerta da gratis el tope del 56 % cuando se declare.

Dos guardas: una fila **sin volumen consumido no se importa** (un lote de 0 m³ no significa
nada en el libro) y un **código que ya existe llega desmarcado** — importar dos veces la
misma lista no puede duplicar el libro. Una fila que falla no aborta las otras.

## Alternativas descartadas

- **Columnas propias para lo del SNIFFS** (sniffsLote, sniffsConsumido…): cuatro columnas y
  una migración por cada dato nuevo que traiga la pantalla, para algo que sólo se compara
  entero y nunca se filtra por dentro.
- **Crear las programaciones ya declaradas con su producción**: la lista no trae los
  productos; inventarlos sería declarar producción que nadie declaró.

## Consecuencias

- Un lote de programación tiene rendimiento `null` hasta que se declare: correcto, y la
  tarjeta lo dice con «falta declararlos acá».
- `paquetes` pasó de `.min(1)` a `.max(200)` en el schema de la API: el formulario de
  paquetes sigue exigiendo al menos uno, la puerta de programación no.
- El cuadre sólo existe para lotes armados desde el SNIFFS. Los de siempre no muestran nada.
