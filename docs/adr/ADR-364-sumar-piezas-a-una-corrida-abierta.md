# ADR-364 — Sumar piezas a una corrida abierta

- **Fecha:** 2026-08-07
- **Estado:** Aceptado
- **Ámbito:** Libro CTP · Producción (`ForestLoteAserrioDB`, `/api/admin/forestal/lotes-aserrio`)
- **Relacionados:** ADR-326 (consumo por pieza), ADR-337 (m³ por guía), ADR-340
  (consumir hoy y declarar después), ADR-349 (producir desde el lote), ADR-353
  (I2 y la guía que se contradice), ADR-356 (consumo parcial del lote)

## Contexto

El turno del aserradero no entra entero de una vez. Se carga el carro, se corta,
y a media mañana entran diez trozas más del mismo lote. En el libro eso es **una
sola corrida**: la misma jornada, la misma sierra, el mismo producto que sale al
final.

Hasta hoy no había forma de decirlo. `consumirEnPatio` (ADR-340) **siempre abre
una corrida nueva**, así que sumar madera al turno en curso partía la jornada en
dos asientos: dos rendimientos calculados sobre denominadores que nadie eligió,
dos líneas para el mismo hecho físico y un operador que después no sabe cuál de
las dos declarar.

El estado ya existía y era exactamente el que hacía falta: la corrida **abierta**
—`quantity == null`, consumió y todavía no declaró—. Lo que faltaba era poder
agregarle materia prima antes de cerrarla.

## Decisión

Se agrega la acción **`sumar-corrida`** al PATCH de `lotes-aserrio`:
`{ loteId, corridaId, trozaIds[], fecha? }`.

Suma piezas del lote a una corrida **que todavía no declaró**, y escribe el
consumo **en los dos lugares donde vive** (ADR-337): las piezas
(`consumidaEnId`) y los m³ por guía (`ForestCtpConsumo`).

### Qué se exige (y por qué)

| Guard | Razón |
|---|---|
| La corrida es de **producción**, `registrado`, viva y **`quantity == null`** | Sumar materia prima a una corrida ya declarada cambiaría el **denominador del rendimiento de un asiento cerrado**: el mismo producto pasaría a rendir menos sin que nadie tocara la producción. Eso se corrige anulando y rehaciendo, no por la puerta de atrás. |
| Período **no cerrado** y consumo **no congelado** | Las mismas puertas que ya cierran `setConsumos` y `annul` (ADR-139). |
| El lote está **abierto** y es de la **misma especie** que la corrida | Una corrida es de una especie; mezclar dentro del asiento haría imposible el Cuadro Resumen por especie. |
| Cada pieza pasa **T1** (ADR-326) | No entra la ya consumida, la despachada sin aserrar, la que no llegó, el descarte, la madre retrozada ni la sin volumen. |
| **I1 e I2** los valida `setConsumos`, no una copia | Dos implementaciones de la misma regla divergen a la primera corrección. |

### El orden de escritura (y qué pasa si se corta)

1. `volumeInputM3 += Δ` — **primero**, porque I1 es `Σ atribuido ≤ declarado` y se
   evalúa contra la fila bloqueada: con el orden inverso, la propia atribución
   que estamos agregando se rechazaría a sí misma.
2. `setConsumos(existentes ⊕ nuevos)` — merge por guía, con su lock y sus
   invariantes. **Si falla, se restaura `volumeInputM3`**: no queda una corrida
   inflada por un intento que no entró.
3. Marcar las piezas y cerrar el lote si se quedó sin madera.

Si el proceso muere entre 2 y 3, la corrida queda con su volumen y su atribución
y las piezas sin marcar. Es un estado **honesto y auto-defendido**: el cupo de la
guía ya está tomado, así que I2 impide que esa misma madera entre a otra corrida.
El libro admite huecos; lo que no admite es contar dos veces.

## Consecuencias

- La jornada que entra en tandas es **una corrida**, con un rendimiento sobre lo
  que realmente entró.
- El panel de «Corridas sin declarar» ofrece las dos salidas y las nombra:
  **sumar a esta corrida** (misma jornada) o **abrir una nueva** (otra jornada).
- `consumirEnPatio` no cambia: sigue siendo la puerta para abrir una corrida.
- No hay migración: ninguna columna nueva. El estado «abierta» ya era
  representable (ADR-340).

## Alternativas descartadas

- **Fusionar dos corridas después.** Obliga a decidir qué asiento sobrevive y qué
  hacer con el `lineNo` del otro: un número del libro no se recicla.
- **Dejar que el operador edite `volumeInputM3` a mano.** Rompe el vínculo entre
  el volumen y las piezas que lo justifican — justo lo que ADR-326 vino a atar.
- **Permitirlo también sobre corridas ya declaradas.** Ver la tabla de guards: el
  rendimiento de un asiento cerrado no se toca por un camino lateral.
