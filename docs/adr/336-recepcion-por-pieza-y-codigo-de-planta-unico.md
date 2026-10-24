# ADR-336 — La recepción se hace pieza por pieza, y el código de planta es único

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro de Operaciones del CTP · Sección 1 (Ingresos) · modal de alta · fiscalización OSINFOR/SERFOR
- **Relacionado:** ADR-312 (la troza trazable) · ADR-320 (pegar la lista de trozas) · ADR-325 (recepción física) · ADR-326 (consumo por pieza) · ADR-335 (fecha de recepción del ingreso) · ADR-317 (libreta del CTP)

## El problema

El alta de un ingreso hacía tres cosas a medias:

1. **La recepción era un tilde por fila.** Una guía trae sesenta trozas; marcar
   cuáles llegaron, con qué número las marca el centro y qué día bajaron del
   camión eran sesenta interacciones. Lo que cuesta sesenta clicks no se hace en
   el patio: se hace de memoria en la oficina, tres días después.

2. **El código de planta no era único.** Se generaba desde `MAX + 1`, sin ningún
   guard: dos tablets numerando a la vez —o dos cargas de la misma guía— se
   llevaban el mismo número. Medido en la base al escribir este ADR: **61
   códigos repetidos** sobre 160 asignados en el tenant `main`. El código de
   planta es la marca **física** que alguien pinta sobre la testa; dos piezas
   con el mismo número son dos piezas que el patio no puede distinguir, y un
   inventario que no distingue sus piezas no prueba nada ante OSINFOR.

3. **Del documento se guardaba la mitad.** El libro se quedaba con titular,
   origen, especie y volumen, y perdía **el propietario del producto**
   (casilleros 13-21 de la GTF), el destinatario (22-28) y el transportista
   (29-34). En modo SERFOR se veían en pantalla porque la ficha los traía; en
   carga manual no había dónde escribirlos. El propietario puede NO ser el
   titular del título habilitante (D.S. 018-2015 art. 172 inciso d) — es
   justamente lo que se cruza cuando la madera cambió de manos en el camino.

## La decisión

### 1. La recepción se hace en LOTE sobre una selección

`lib/forestal/trozas-recepcion.ts` (puro, 17 tests) concentra las operaciones:
marcar llegada, fechar, numerar, limpiar y ordenar. La UI (`CtpPiezasDelIngreso`
+ `CtpPiezasTabla`) selecciona piezas —con click, shift+click para rango, o los
atajos «sin código» / «sin fecha»— y aplica la acción a todas. **Sin selección,
la acción vale para todas**, que es lo que espera el patio.

Reglas que la lógica hace cumplir y no dependen de que el operador se acuerde:

- una pieza que **no llegó** no se numera (no se pinta lo que no está) ni recibe
  fecha de recepción, y marcarla como faltante se la borra;
- un código **tipeado a mano no se pisa** (puede ser el que ya está en la madera),
  salvo que se pida explícitamente «Renumerar»;
- **lo vacío ordena último en las dos direcciones**: un dato que falta no es «el
  más chico», es el que hay que completar.

### 2. Fecha de recepción POR PIEZA

`WoodEntryTroza.fechaRecepcion`. El ingreso ya tenía la suya (ADR-335), pero una
guía grande se descarga en dos viajes: el saldo del patio del lunes no puede
incluir la madera que bajó el miércoles. `NULL` = vale la del ingreso.

### 3. El código de planta es único por centro — con guard app-level

- `guardCodigoPlantaUnico()` corre **dentro de la transacción** de `create` y de
  `actualizarRecepcion`, y rechaza con `CODIGO_PLANTA_DUPLICADO` tanto el
  repetido dentro del mismo pedido como el que ya existe en el libro. La
  comparación es insensible a mayúsculas: `13/a` y `13/A` son la misma marca.
- Los ingresos **anulados o rechazados no bloquean**: su código volvió a estar
  libre, igual que el resto del módulo trata a una corrida anulada.
- El **índice único parcial** `(tenantId, codigoPlanta) WHERE codigoPlanta IS NOT
  NULL` está escrito en la migración 336 pero **se crea sólo cuando no queden
  duplicados**. Renumerar a ciegas una troza cuyo código está pintado en la
  madera rompería la correspondencia con la pila: esa limpieza es una decisión
  del dueño del libro, no de una migración. Mientras tanto manda el guard.
- El aviso llega **antes** de guardar: `useCodigosPlantaEnUso` consulta
  `?codigosEnUso=` con debounce y marca la fila diciendo contra qué guía choca.

### 4. El cuerpo del documento entra al libro — con el MISMO esquema que la salida

`WoodEntry.gtfDatos` (JSON) usa `gtfDatosSchema`, el mismo que ya guardaba la
guía de salida en `ForestCtpEntry.gtfDatos`. **Un solo esquema para un solo
formato oficial**: dos habrían divergido, y un fiscalizador compara los dos lados
del libro. Se le agregaron los casilleros que no vivían en ningún lado —(2)
autoridad, (9) plan de manejo, (29) guía de remisión, (35) lista de trozas, (36)
GTF de origen—, que las dos guías tienen.

`gtfDatosDesdeSerfor()` traduce la ficha oficial a ese esquema y corre **en el
servidor** para el alta desde SERFOR: los dos caminos dejan el mismo dato
consultable, en vez de uno el blob y el otro los campos. No pisa lo que el
operador escribió, y **lo que la ficha no trae queda vacío** — un campo
autocompletado con una suposición es peor que uno en blanco, porque parece
verificado.

### 5. Salir de los repetidos que ya existen, sin adivinar

`?duplicados=1` lista los grupos con lo que hace falta para decidir —guía,
especie, si ya se aserró, si el ingreso está anulado— y
`POST /trozas/renumerar` le da un correlativo libre a las que no conservan el
número, en **un solo UPDATE** dentro de la transacción (con un update por fila,
59 piezas reventaban el timeout de 5 s y volvían un 500 con todo revertido).

Dos decisiones que se ganaron midiendo:

- **Las piezas de ingresos ANULADOS entran a la lista.** No tienen madera en el
  patio, pero su fila sigue ocupando la marca y el índice único mira la tabla,
  no el estado del ingreso. Ocultarlas dejaba la pantalla diciendo «1 grupo» y
  el candado «61 pendientes»: dos números sobre el mismo hecho que no se podían
  explicar.
- **El período cerrado sigue mandando.** Una pieza de un mes ya presentado no se
  renumera sin reabrir; se informa y la limpieza sigue con el resto.

Al quedar en cero, `intentarCandadoCodigoPlanta()` crea el índice único solo. El
problema deja de ser posible sin que nadie tenga que acordarse.

### 6. La recepción en lote también DESPUÉS del alta

Las mismas tres acciones viven en `CtpRecepcionTrozas` (la corrección posterior,
ADR-325), usando las MISMAS funciones puras. Corregir una guía de sesenta piezas
de a una es lo que nadie hace, y dos implementaciones del mismo trabajo terminan
diciendo cosas distintas sobre el mismo hecho.

## Consecuencias

- Recibir una guía de sesenta trozas pasa de sesenta interacciones a tres.
- Un código repetido ya no se puede crear; los 61 históricos siguen ahí y hay
  que limpiarlos a mano antes de que el índice único entre solo.
- `gtfDatos` es JSON: no se puede filtrar por placa ni por propietario sin
  promover columnas. Se aceptó porque son declaraciones de un documento ajeno,
  que se guardan enteras y se leen enteras.
- El bloque de casilleros va **plegado** en el alta manual: son veinte campos que
  el alta rápida no toca. Se despliega solo cuando la consulta a SERFOR ya trajo
  el propietario — esconder un dato que existe es peor que pedirlo.

## Alternativas descartadas

- **Columnas discretas para propietario/destinatario/transportista** (~27
  columnas): queryable, pero duplicaba el esquema de la guía de salida y obligaba
  a tocar todas las lecturas con whitelist. El JSON compartido gana en
  consistencia, que es lo que una fiscalización mira.
- **Crear el índice único renumerando los duplicados en la migración**: cambia
  datos que están pintados sobre madera real. No es una decisión de una
  migración.
- **Una pantalla de «recepción» posterior**: ya existía y es exactamente lo que
  no se usa. El que descarga el camión sabe AHORA cuáles llegaron; lo que se
  pospone no se hace.
