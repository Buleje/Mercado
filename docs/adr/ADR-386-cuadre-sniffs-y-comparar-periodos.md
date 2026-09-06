# ADR-386 — Cuadre contra el SNIFFS y comparación entre períodos

**Estado:** aceptado · **Fecha:** 2026-09-04 · **Ámbito:** Libro de Operaciones CTP

## Contexto

Dos preguntas que el Libro no sabía contestar, y que se leen juntas.

**1 · «¿Puedo probar que SERFOR conoce estas guías?»** Es la primera pregunta de
una fiscalización. Medido en el tenant: **2 de 22 asientos vivos** tienen su
constancia del SNIFFS guardada. Hasta ahora eso sólo se sabía abriendo los
asientos de a uno.

**2 · «¿Esto viene subiendo o bajando?»** El libro contaba muy bien el período
elegido y nunca el de al lado. «Entraron 135 m³» no dice nada solo; «135 m³,
40 % menos que el mes pasado» es una decisión de compra.

## Decisión 1 · El cuadre dice lo que el libro PUEDE probar

El SNIFFS **no expone API** (ADR-311). El libro por lo tanto **no puede afirmar
«SERFOR no tiene esta guía»** — eso sería un hallazgo que no le consta.

Lo que sí puede afirmar, y es igual de accionable, es lo propio: *este libro no
puede probar que SERFOR conoce esa guía*. El cuadre se redacta exactamente así.
La diferencia importa: en un documento que se presenta ante una autoridad, una
afirmación sobre el sistema del regulador que no se puede sostener es peor que
no decir nada.

`sinConstanciaCount` se agrega en `WoodEntriesDB.stats()` junto a `lateCount` y
`sinOrigenCount` — sobre TODO el período, no sobre una página. Cuenta `null`
**y** `""`: un string vacío es un campo que alguien abrió y dejó igual, y darlo
por verificado sería el falso verde más caro del libro.

## Decisión 2 · Se compara contra un lapso del MISMO largo

`periodoAnterior()` en `ctp-period.ts`, single source:

| Período | Anterior | Por qué |
|---|---|---|
| mes | el mes **calendario** anterior | restarle 28 días a marzo daría un pedazo de febrero más uno de enero |
| trimestre | el trimestre **calendario** anterior | restar 92 días daba «31 mar — 30 jun», que no es ningún trimestre |
| año | el año anterior completo | — |
| custom | el mismo largo, pegado por detrás | es lo único honesto sobre un lapso arbitrario |
| todo el histórico | **`null`** | no tiene un antes; un período inventado sería peor que no comparar |

Comparar lapsos de distinto largo es la forma más fácil de fabricar una caída
del 66 % que no existió.

## Detalles que se decidieron a propósito

- **Sin porcentaje cuando el anterior fue 0.** «+∞ %» o «+100 %» sobre una base
  de cero es un chiste en un libro fiscalizable: se dice «sin base anterior».
- **El color no juzga.** Más ingresos no es «bueno» ni «malo», es más. El tono
  indica la dirección, no si conviene — la interpretación es del dueño.
- **Un solo pedido nuevo.** El stats del período actual ya lo pide el panel de
  Cumplimiento en el mismo montaje (dedup ADR-347); el del período anterior es
  el único fetch que agrega toda la comparación, y si falla la tarjeta se
  muestra igual sin ella.
