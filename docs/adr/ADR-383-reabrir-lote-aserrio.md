# ADR-383 — Un lote de aserrío se puede reabrir para seguir cargándolo

- **Fecha:** 2026-09-02
- **Estado:** aceptado
- **Pedido por:** Brandon — «no importa si ya se puso en trozas anteriores y se
  consumieron o se produjeron, se podrá igual habilitar y poner más trozas a ese
  mismo lote».

## Contexto

Un **lote de aserrío** (ADR-334) es la madera de UNA especie que entra junta a
la sierra. El estado del lote es `abierto → consumido → cerrado`, y hasta ahora
tres puertas de `ForestLoteAserrioDB` exigían `status === "abierto"`:
`agregarTrozas`, `consumirEnCorrida` y `cerrar`.

Eso modelaba el lote como un acto único: se arma, entra a la sierra, se termina.
El aserradero no trabaja así. Un lote se carga en varias tandas a lo largo de la
semana: entran veinte trozas el lunes, se aserran, y el miércoles llegan quince
más de la misma especie que van al mismo lote y a la misma orden de producción.

Con la regla vieja, la única salida era armar un lote nuevo por cada tanda. El
resultado: la orden de producción real quedaba partida en tres o cuatro lotes
distintos, y el rendimiento por lote —que es lo que se mira— dejaba de
corresponder a una jornada de trabajo.

`consumir` ya contemplaba la parcialidad (ADR-356: aserrar una parte hoy y dejar
el resto apartado deja el lote ABIERTO). Lo que faltaba era el caso en que el
lote YA pasó a `consumido` y aparece más madera para él.

## Decisión

Se agrega una acción explícita **`reabrir`** (`ForestLoteAserrioDB.reabrir`,
`PATCH /api/admin/forestal/lotes-aserrio` con `accion: "reabrir"`), que devuelve
un lote `consumido` al estado `abierto`.

Lo que **no** toca, y por qué:

| Dato | Qué pasa | Por qué |
|---|---|---|
| `WoodEntryTroza.consumidaEnId` de las piezas ya aserradas | **intacto** | Son un hecho del libro. Soltarlas negaría que se aserraron y movería el rendimiento ya declarado de esa corrida. |
| `produccionEntryId` | **se conserva** | `deshacer()` lo limpia porque ahí la corrida dejó de existir; acá existe y sigue siendo de este lote (ver `lote-aserrio-cerrar-deja-produccionentryid-null`). |
| `fechaConsumo` | **se conserva** | La primera tanda entró a la sierra ese día. Borrarla reescribiría el pasado. |

La consecuencia práctica: al volver a consumir, `consumirEnCorrida` sólo puede
tomar las piezas con `motivoNoElegible === null` — es decir, **las nuevas**. La
corrida anterior queda exactamente como estaba.

### Lo que sigue prohibido

Un lote **`cerrado` no se reabre**. «Cerrado» significa producido y despachado,
y su madera libre ya volvió al patio (`cerrar()` la suelta). Revivirlo sería
reabrir un tramo del libro que ya se declaró terminado; el camino correcto ahí
es armar un lote nuevo. El servidor lo rechaza con `LOTE_NO_EDITABLE`.

### Auditoría

`ctp_lote_aserrio_reabrir` sobre `ForestLoteAserrio`, con cuántas piezas ya
aserradas quedaron atadas a su corrida. Un lote que vuelve a admitir madera
después de haber producido es exactamente el tipo de movimiento que un
fiscalizador querría poder reconstruir.

## Consecuencias

- **L-A1 (una especie por lote) sigue en pie**: `agregarTrozas` compara la
  especie normalizada contra la del lote, y eso no cambió.
- **Las invariantes del consumo (I1–I6) no se tocan**: viven en
  `ForestCtpConsumo` (m³ por guía), no en el estado del lote.
- **El tope del 56 % (ADR-358) sigue calculándose igual**: `margenLote()` mira
  la corrida viva del lote, no su `status`.
- **UI**: en Consumos, el selector de lote muestra los aserrados con el ícono
  de reabrir y la línea «Ya aserrado — se reabre para seguir cargándolo». Un
  solo click reabre y lo deja elegido: partirlo en dos obligaría a volver a
  buscarlo en el menú.

## Alternativas descartadas

1. **Permitir `agregarTrozas` sobre un lote `consumido` sin cambiar el estado.**
   Dejaría el lote en un híbrido —piezas consumidas y piezas libres, con
   `status: "consumido"`— y todas las lecturas que preguntan «¿este lote está
   abierto?» (la tira de Producción, el picker de Consumos, `cerrar()`) darían
   respuestas contradictorias sobre el mismo lote.

2. **Reabrir automáticamente al elegirlo en Consumos.** Cambiar el estado de un
   asiento del libro como efecto colateral de abrir un menú es justo lo que un
   registro fiscalizable no puede hacer. La acción es explícita y auditada.

## Referencias

- ADR-334 — lote de aserrío
- ADR-356 — consumo parcial deja el lote abierto
- ADR-358 / ADR-365 — tope del 56 % y declarar lo que faltó
- `lib/db/forest-lote-aserrio.db.ts` · `reabrir()`
