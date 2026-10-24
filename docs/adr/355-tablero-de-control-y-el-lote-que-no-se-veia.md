# ADR-355 — El tablero de Control, y el lote que no se veía

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · pestaña Producción · fase Control
- **Relacionado:** ADR-334 (lote de aserrío) · ADR-342 (el lote acota el patio) · ADR-345 (filtro del patio) · ADR-349 (producción en paquetes) · ADR-352 (un filtro heredado donde no puede dar resultados)

## Parte 1 — «elijo el lote y la tabla sale vacía»

Reporte: *«cuando se escoja el lote, en la tabla tienen que aparecer las trozas
de ese lote para elegir cuáles van a producción»*. La función existía desde
ADR-349. Medido en el tenant real:

> **Cabecera:** «6 pza · 23.9220 m³ a consumir»
> **Tabla:** «Ninguna troza coincide con el filtro. · Sin trozas · 0.0000 m³»
> **Botón:** «Registrar producción (6 pza)»

`estaLibreEnPatio()` exige `!loteAserrioId`, y las 6 piezas **ya estaban
apartadas en ese mismo lote**. El filtro «Sólo libres» —encendido por
defecto— las borraba de la tabla. Tres números en pantalla decían seis y la
tabla decía cero.

Es el patrón de ADR-352 otra vez: **un filtro aplicado donde no puede dar
resultados**. Y estaba igual en Consumos.

### La decisión

«Libre» es **relativo al lote que se está cargando**: `estaLibreEnPatio(t, {
loteId })` cuenta como disponible la pieza apartada en ESE lote —de hecho ya
está adentro— pero no en otro.

Y `useFiltroPatio` parte las dos listas, que antes eran una:

| | Qué es | Incluye las del lote |
|---|---|---|
| `visibles` | lo que se DIBUJA | **sí** — son las que van a la sierra |
| `libres` | lo que se puede TILDAR | no — ya están adentro |

Separarlas es lo que evita el doble conteo: el total sigue siendo
`yaEnElLote + elegidas` sin deduplicar nada. En la tabla esas filas salen
**tildadas, fijas y marcadas «en este lote»** — con el casillero vacío el
operador cree que no las eligió.

## Parte 2 — El tablero de Control

El libro tiene cuatro secciones y cada una vivía en su pestaña. Ninguna pantalla
mostraba **las cuatro juntas en el tiempo**, que es la única forma de contestar
*¿estoy metiendo más madera de la que saco?*

Vista nueva **Tablero**, primera de Control: cinco KPI con su lectura contra el
período anterior, el flujo del libro, el aserrío con su rendimiento, el balance
del patio y la composición por especie. Todo de **un solo pedido**
(`/ctp/movimiento`) con los mismos predicados que Saldos — si el tablero y el
balance discutieran, uno de los dos sobra.

### Tres cosas que la evidencia obligó a corregir

**1. 67 barras diarias.** `pasoParaSpan` (120 días) venía de la curva de saldo,
que es una LÍNEA. En barras, el trimestre daba 67 columnas apretadas y casi todas
en cero —un aserradero no asierra todos los días—. `pasoParaBarras` corta en 45
días: el mismo trimestre son **10 semanas** legibles. Los cubos siguen empezando
donde dice `inicioDeCubo`, así que las dos series no se contradicen.

**2. «Rendimiento 146 %».** Un aserradero no saca más madera de la que mete. El
número salía de dividir **pies tablares producidos por metros cúbicos
consumidos**. Ahora al rendimiento sólo entran las corridas que declaran en m³;
las demás suman a «Producido» y se cuentan aparte («N corridas fuera: declaran en
otra unidad»). Con el arreglo, el mismo tenant da **55.1 %**.

**3. «Sin período previo» cuando sí lo había.** El trimestre anterior existía y
no había tenido movimiento; el KPI lo reportaba como si no se pudiera comparar.
Son tres estados, no dos: sin período / **antes no hubo movimiento** / la
variación.

## Verificación

**Producción**, tenant real, lote `LA-2026-003`: las 6 trozas aparecen tildadas y
marcadas «en este lote» (`100/A`, `117/B`, `20/A`, `84/A`, `84/B`, `84/C`), el
botón dice «Registrar producción (6 pza)». 0 errores de consola.

**Tablero**, tenant real: «Jun–Ago 2026 · por semana», 10 semanas, 87.45 m³
ingresados, 5 especies en la dona. Los tres charts miden 1096×260, 522×240 y
260×220 — no hay ninguno colapsado a 0 (el gotcha de `ResponsiveContainer`).

**Tablero**, tenant de pruebas —el que sí tiene movimiento—: barras de varias
semanas (5, 44, 19, 5, 5 m³), despachos, deltas reales (+396.2 %, +17.2 %,
+133.2 %, −5.3 %) y rendimiento **55.1 %**. 0 errores de consola.

Quedan 2 warnings de recharts (`width(-1)` en el primer frame, antes de que el
layout resuelva): los charts terminan con ancho real, medido.
