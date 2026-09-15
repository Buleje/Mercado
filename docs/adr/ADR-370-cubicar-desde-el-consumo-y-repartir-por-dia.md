# ADR-370 — Cubicar desde el consumo y repartir por troza y por día

- **Fecha:** 2026-08-08
- **Estado:** Aceptado
- **Ámbito:** Libro CTP · Consumos (`CtpCubicacionParaConsumo`, `CtpConsumosView`,
  `CtpCubicarProductoModal` en modo libre)
- **Relacionados:** ADR-368/369 (cubicar contra el libro), el reparto de rolliza
  sobre aserrada (`cubicacion-reparto.ts`, 33 tests), ADR-340 (consumir hoy,
  declarar después)

## Contexto

En el patio el orden real es al revés del que pedía el libro: **primero se
asierra y se cubica lo que salió**, y recién después se anota qué trozas se
comieron. Medir en Herramientas y volver a Consumos obligaba a cambiar de
pestaña, y ahí se pierde el número.

Además, lo que sale de una jornada no siempre es un asiento: el Libro de
Operaciones se lleva **día por día**, así que un lote cortado en tres días son
tres corridas. Esa cuenta ya existía —la pestaña Resúmenes reparte la aserrada
entre bloques de rolliza por capacidad (`m³ × % aprovechable`) y por días— pero
vivía lejos del momento en que se usa.

## Decisión

1. **Un bloque «Cubicación de lo aserrado» en Consumos**, con el botón **Cubicar
   madera** que abre la misma herramienta (celdas tipo Excel, `cubicarPieza`,
   `tipoDePieza`) en **modo libre**: sin filas del libro no hay contra qué
   cuadrar, así que no se muestran avisos de diferencia — se mide y se guarda.
2. **Las cubicaciones guardadas se eligen ahí mismo** («Cubicación a usar»),
   incluida la que se acaba de guardar, que queda seleccionada sin recargar.
3. **El resumen reparte con la MISMA función que Resúmenes**
   (`distribuirPorCapacidad`): las trozas tildadas del patio son los bloques de
   rolliza, con su `% aprovechable` y sus `días`. Se ve qué ampara cada troza,
   qué usó, qué le queda libre y **cuánto le toca a cada jornada**. Una segunda
   fórmula para el mismo reparto sería una segunda verdad.
4. **Lo que ninguna troza puede amparar se dice**, con cuánta rolliza haría falta
   al aprovechamiento vigente: es la madera que espera la próxima troza, no un
   error que se esconde.

## Consecuencias

- El rendimiento real (aserrada ÷ rolliza) aparece **antes** de consumir, que es
  cuando todavía se puede corregir qué trozas entran.
- El bloque no escribe en el libro: prepara la declaración. Ejecutar el consumo
  distribuido —crear una corrida por día con su materia prima y su producción—
  es el paso siguiente y toca invariantes (I1/I2 por corrida), así que va con su
  propio ADR.

## Verificación

Tenant real, vista Consumos: se eligió el lote, se tildaron 15 trozas
(**11.5000 m³** de rolliza), se eligió la cubicación guardada (**0.9439 m³**,
30 piezas, 400 pt) y con **3 días** el resumen dio rendimiento **8.2 %** y el
reparto por troza —`QA-C-010: ampara 0.2750 m³ · usado 0.2517 · libre 0.0233`—
con su desglose por jornada (`día 1: 0.0944 m³ …`). Light y dark, sin errores de
consola.
