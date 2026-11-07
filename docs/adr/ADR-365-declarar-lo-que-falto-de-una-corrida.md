# ADR-365 — Declarar lo que faltó de una corrida, sin volver a elegir trozas

- **Fecha:** 2026-08-08
- **Estado:** Aceptado
- **Ámbito:** Libro CTP · Producción (`ForestLoteAserrioDB.list`, `ForestCtpDB.getById`,
  `lib/forestal/produccion-paquetes.ts`, panel del lote y tabla del libro)
- **Relacionados:** ADR-349 (producir desde el lote), ADR-356 (consumo parcial del
  lote), ADR-358 (el tope del 56 %), ADR-361 (`ampliarProduccion`), ADR-364
  (sumar piezas a una corrida abierta)

## Contexto

Pedido de Brandon, con el caso completo: un lote de 4 trozas, entran 3 a la
sierra, esa madera permite declarar hasta 5 m³ y ese día salieron 3. **Al otro
día sale el resto de esa misma corrida** —lo que quedó del bloque, la
recuperación, las tablillas—. Hoy había que elegir el lote y volver a tildar
trozas… que no existen: esa materia prima ya entró a la sierra. La única salida
era abrir una corrida nueva sin materia prima propia, que es un asiento falso.

El servidor ya sabía hacerlo: **`ampliarProduccion` (ADR-361)** suma paquetes a
una corrida ya declarada y mide el tope sobre el total acumulado. Lo que no
existía era **la puerta**: ninguna pantalla llamaba a esa acción. Y el dato
tampoco llegaba — `ForestLoteAserrioDB.list` resolvía la corrida por
`produccionEntryId`, que **sólo se escribe cuando el lote se consume entero**, así
que el lote aserrado a medias no podía nombrar ni una de sus corridas.

## Decisión

1. **El lote expone TODAS sus corridas vivas** (`corridas[]`), no sólo la que lo
   cerró: se derivan de `troza.consumidaEn` (∪ `produccionEntryId`), con
   `volumeInputM3` —el denominador del rendimiento— en el select. Misma
   serialización (`verCorrida`) para `produccion` y para `corridas`.
2. **`corridasAMedioDeclarar()`** (puro, testeado) decide qué corrida admite más:
   `registrado` + `m3` + ya declaró (`quantity > 0`) + margen ≥ **1 litro**
   (`MARGEN_MINIMO_M3`, tolerancia del negocio, no del float). La que **nunca**
   declaró queda afuera: ésa es «corrida sin declarar» (ADR-340) y tiene su
   propia puerta.
3. **Una sola pantalla para declarar y para ampliar.**
   `CtpRegistrarProduccionModal` toma `yaDeclaradoM3` y `codigosUsados`: el tope,
   el margen, la barra y el rendimiento se miden sobre el **acumulado**, el
   código de paquete sigue la serie (`PQ-001` → `PQ-002`) y la fecha y la línea se
   muestran como **dato**, porque el servidor no las toca al ampliar — un campo
   editable que no viaja es una mentira de la pantalla.
4. **Dos puertas, ninguna lista global**: el bloque `CtpProduccionPendiente` en el
   panel del lote (el camino que pidió Brandon) y un atajo por fila en la tabla
   del libro (la corrida cuyo lote ya se consumió entero, o que nunca tuvo lote).
5. **El margen se nombra «admite hasta», nunca «falta»**, y el bloque dice que el
   56 % es un techo y no una meta. Casi toda corrida sana rinde menos del tope:
   presentarlo como deuda empujaría a declarar madera que no salió, que es
   justamente lo que ADR-358 previene.

## Consecuencias

- Un turno que sale en tandas cierra en **una** corrida: un rendimiento sobre la
  materia prima que de verdad entró, en vez de dos asientos partidos.
- `ampliarProduccion` deja de ser código muerto: el tope acumulado, el rechazo de
  código duplicado y el guard de período cerrado ahora se ejercitan de verdad.
- `list()` de lotes resuelve más ids de corrida que antes (una por troza
  consumida, deduplicadas). Sigue siendo una query por lote-página; si el listado
  creciera, el corte natural es pedir `corridas[]` sólo para los lotes abiertos.
- `ForestCtpDB.getById` devuelve además los paquetes: lo usan el modal de
  ampliación y `to-product`, que ignora el campo nuevo.
- **A una corrida ya declarada no se le suma materia prima** (ADR-364 sigue
  vigente): las trozas que le quedan al lote van a una corrida nueva, y la
  pantalla ahora lo dice en vez de dejar que se descubra probando.

## Alternativas consideradas

- **Anular y rehacer la corrida** con el total: pierde el rastro del turno y
  reescribe un asiento del libro. Ampliar agrega filas, no las corrige.
- **Sumarle las trozas sobrantes a la corrida ya declarada**: le cambia el
  denominador del rendimiento a un asiento cerrado. Rechazado por ADR-364.
- **Una lista global de «corridas a las que les falta»**: sería casi toda la
  tabla y enseñaría a leer el techo como meta.

## Verificación

Camino del usuario, con datos reales del tenant `main`
(`scripts/visual-verify-produccion-pendiente.mjs`): lote `LA-2026-041` de 4
trozas → 3 consumidas (1.5 m³, tope 0.8400) → declaró 0.5040 → se agregó `PQ-002`
por 0.3000 desde el panel del lote **sin tocar una troza** → la corrida quedó en
`quantity = 0.804`, `rendimientoPct = 53.6`, dos paquetes, y los KPIs del libro
pasaron de 5.96 a 6.26 m³ producidos. Dark verificado midiendo el color, no a ojo.
