# ADR-532 — Puntaje de cumplimiento del CTP: los casos restan en proporción y un libro vacío no saca 100

- **Estado:** aceptado (2026-11-04, noche autónoma). Sin cambio de schema ni migración.
- **Pedido por:** radar de mejoras (`.claude/improvement-radar.md`, los dos pendientes del score 0-100), decidido en la noche autónoma del 04-11 con el default recomendado.
- **Modifica:** la fórmula de `ctpComplianceScore` / `ctpComplianceBreakdown` en `lib/forestal/ctp-compliance.ts` (5 puntos por caso, tope 25 por categoría).
- **No cambia:** qué categorías restan (las 5 corregibles), que CITES NO resta (regla dura de `forestal-serfor.md`), los tonos (≥90 / ≥70), el plazo de 2 días hábiles.

## Contexto

El puntaje tenía dos fallas medidas en los tests:

1. **Premiaba no hacer nada.** Con 0 ingresos, 0 despachos y 0 producción daba 100. Un libro vacío le ganaba a un CTP que despacha bien y tiene un caso abierto.
2. **El tope aplanaba la escala.** Cada categoría restaba 5 por caso hasta 25: 5 guías sin recepcionar y 50 restaban lo mismo. Recepcionar 16 de 21 no movía el puntaje, y un test lo dejaba anotado como «deuda conocida».

## Decisión

1. **Las categorías con una base natural restan en proporción.** Fuera de plazo y sin recepcionar se miden contra los ingresos del período. Despachos sin trazabilidad se miden contra los despachos del período. Puntos = `round(25 × casos ÷ base)`, con **piso de 5** si hay al menos un caso (un caso siempre se ve) y **techo de 25**.
2. **Especies y productos en negativo siguen a 5 por caso, con tope 25.** No tienen una base estable: el universo «con saldo» cambia con la apertura heredada y con el filtro por especie.
3. **Sin movimiento = `null`, no 100.** El puntaje es `null` («Sin movimiento en el período») solo si los tres totales llegaron, los tres son 0 y ninguna categoría tiene casos. Si una especie arrastra saldo negativo de antes, hay algo que calificar y el puntaje sale.
4. **Si falta un total, se usa el cálculo de antes.** Por ejemplo, si producción no cargó o hay un filtro por especie (su lectura no filtra por especie). En ese caso no se inventa la base ni se afirma «sin movimiento».
5. **Una sola fórmula.** `ctpComplianceScore` = 100 − Σ `ctpComplianceBreakdown().puntos`. El texto de los casos («5 de 21 ingresos», «5+ casos») sale de `ctpDeduccionCasosTexto`, que es el mismo en el panel y en el PDF.

Los totales viajan dentro de `CtpComplianceCounts.bases` (opcional). El hook los arma con las lecturas que ya hacía: `stats().totalCount`, `traza.total` y el `total` de la lista de producción. No hay endpoint nuevo.

## Lectores sincronizados

| Lector | Con `null` |
|---|---|
| `hooks/use-ctp-compliance.ts` | `score: number \| null`; no registra el snapshot del día |
| `CtpComplianceScore.tsx` | tarjeta «Sin movimiento en el período», sin medidor ni desglose |
| `CtpHealthChip.tsx` | chip neutro con «—» |
| `CtpCumplimientoChequeo.tsx` | resumen del riel con «Sin movimiento en el período»; el PDF sale con «—» |
| `ctp-cumplimiento-print.ts` | `score: number \| null`; el desglose recibe `casosTexto` |

El Excel del libro no exporta el puntaje (verificado por grep), así que no había nada que sincronizar ahí.

## Historial (ADR-384)

- `ForestCtpComplianceSnapshot.score` sigue siendo numérico. Con `null` **no se guarda punto** ese día (el hook ya salteaba «custom» y el filtro por especie). La curva queda con un hueco, no con un 100 falso.
- **Los puntos anteriores al 2026-11-04 se calcularon con la fórmula vieja** y no se recalculan. Un período con casos en categorías con base puede verse distinto antes y después de esa fecha sin que haya cambiado el libro: el salto es de la fórmula.

## Medición (2026-11-04, solo lectura, mismas lecturas que el hook)

| Negocio · período | Viejo | Nuevo | Totales | Casos |
|---|---|---|---|---|
| Blas real · mes actual | 90 | 90 | 0 ingresos · 0 despachos · 0 producción | 2 especies en negativo (−10) |
| Blas real · todo | 90 | 90 | 0 · 0 · 7 | 2 especies en negativo (−10) |
| QA · mes actual | 90 | 90 | 0 · 0 · 0 | 2 especies en negativo (−10) |
| QA · todo | 90 | 90 | 1 · 0 · 39 | 2 especies en negativo (−10) |

Hoy ninguno de los dos negocios cambia. Sus únicos casos son de una categoría sin base, y por eso tampoco caen en «sin movimiento». El cambio se nota apenas haya guías sin recepcionar, fuera de plazo o despachos sin trazabilidad: por ejemplo, 5 de 21 sin recepcionar daba −25 (75) y ahora da −6 (94).

## Consecuencias

- Un CTP con muchos ingresos y pocos casos ya no cae al piso por la misma cantidad que uno con todos mal.
- Un caso nunca resta menos de 5: el puntaje no esconde una falta real detrás de una base grande.
- Si mañana se agrega una base para los negativos (por ejemplo, especies con movimiento), basta con sumarla a `BASE_DE`. El resto de los lectores no cambia.
