# ADR-354 — El certificado de lote llega hasta la pieza

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Lotes de producción · certificado de cadena de custodia
- **Relacionado:** ADR-136 (lote comercial) · ADR-326 (consumo por pieza) · ADR-334 (lote de aserrío) · ADR-315 (cadena del lote)

## El hueco

El certificado probaba la cadena **hasta la GTF**: «esta corrida consumió madera
de la guía 001-0000202». Correcto, pero salteado — entre la guía y la corrida hay
**una pila de palos**, y es la pila lo que un fiscalizador cuenta y lo que la
EUDR pide identificar. El papel decía metros cúbicos donde el inspector cuenta
trozas.

El dato ya existía desde ADR-326/334 (`WoodEntryTroza.consumidaEnId` +
`loteAserrioId`); simplemente **no llegaba al documento**.

## La decisión

`trazabilidadLote()` devuelve dos cosas nuevas:

| Campo | Qué es |
|---|---|
| `corridas[].lotesAserrio` | de qué pila comió cada corrida |
| `lotesDeAserrio[]` | las piezas consumidas, agrupadas por pila: código, cantidad, m³ y **los códigos de cada troza** |

El lote de aserrío viaja **por la troza, no por la corrida**: una corrida puede
tragarse dos pilas y una pila puede repartirse en dos corridas. Agrupar por
corrida habría inventado una relación 1:1 que no existe.

Y aparece en los dos lados: una columna «Lote de aserrío» en la tabla de corridas
(pantalla y papel) y un bloque nuevo **«Piezas que entraron a la sierra»** con el
detalle. La declaración de apertura lo dice: *«…y que esa materia prima
corresponde a N trozas identificadas una por una»*.

### Las piezas sin pila NO se esconden

Una troza consumida antes de que existieran los lotes de aserrío —o cargada
suelta a la sierra— se agrupa bajo `code: null` y el papel la nombra **«sin
lote»**, al final de la tabla.

Descartarlas era la opción cómoda y habría sido el bug: el conteo de piezas del
certificado tiene que cerrar contra la corrida, y un certificado que declara 2
trozas cuando entraron 5 es peor que uno que no las declara.

### El agrupado es puro y se testea

`agruparPiezasPorLoteAserrio()` vive en `lib/forestal/lotes-aserrio.ts`, no
dentro de la consulta. Motivo concreto: **hoy no hay, en ningún tenant, una
pieza consumida con lote de aserrío** —todos los consumos son anteriores a
ADR-334—, así que esa rama no se puede ejercitar contra datos reales y sin test
quedaría sin verificar hasta que alguien asierre el primer lote. Para entonces el
certificado ya se habría emitido. 9 tests cubren las dos ramas, el orden, el
código de planta ganándole a la codificación y el volumen nulo.

## Verificación

En el tenant de pruebas, lote `L-2026-012`:

1. **Pantalla:** la tabla de corridas trae la columna «Lote de aserrío» y abajo
   «Piezas que entraron a la sierra · 2 trozas · sin lote · 4.7732 m³ · 204 · 205».
2. **Papel** (ventana de impresión real): mismo bloque impreso, con la columna
   nueva en la tabla de corridas y la declaración *«…corresponde a 2 trozas
   identificadas una por una, detalladas más abajo»*.
3. Consola: 0 errores. `tsc`/`tsgo` limpios, eslint 0 errores, 9 tests nuevos.

Queda dicho: lo verificado en pantalla y papel es la rama **«sin lote»**, que es
la que existe hoy en los datos. La rama con pila está cubierta por test, no por
navegador.
