# ADR-313 — Retrozado: cortar una troza en pedazos

- **Fecha:** 2026-07-30
- **Estado:** aceptado
- **Contexto:** Libro de Operaciones del CTP · **Apartado 2** del formato (RDE D000025-2023)
- **Relacionado:** ADR-311 (lo dejó como pendiente), ADR-312 (la troza como pieza trazable)

## El problema

En el patio llega una troza de 9.70 m que no entra en la sierra, o tiene un tramo
podrido. Se corta en dos o tres. Cada pedazo **sigue siendo la misma madera de la
misma guía**, y un fiscalizador va a preguntar de qué troza salió.

Hasta ahora el libro no tenía dónde anotarlo: la troza figuraba con sus 3.268 m³
originales y los pedazos no existían. El ADR-311 lo dejó anotado como pendiente.

## La decisión

### 1. Un retrozo ES una troza, con madre

Auto-relación sobre `WoodEntryTroza` (`trozaOrigenId`), no tabla aparte. Así el
buscador por codificación, la lista del ingreso y los saldos lo encuentran sin
duplicar nada. La codificación hereda: `52/A` → `52/A-1`, `52/A-2`.

**Un solo nivel.** Un pedazo no se vuelve a cortar: el árbol de dos niveles alcanza
para el libro, y uno más profundo haría que el saldo de la madre dependa de una
recursión que nadie audita.

### 2. Las reglas son física, no preferencia

De una troza no sale un pedazo más grueso ni más largo que ella, ni más volumen
del que tiene:

| | Regla |
|---|---|
| **R1** | Σ volumen(pedazos) ≤ volumen(troza) |
| **R2** | máx(d1, d2) de cada pedazo ≤ **máx(d1, d2)** de la troza |
| **R3** | largo de cada pedazo ≤ largo(troza) · y Σ largos ≤ largo(troza) |

**R2 se compara contra el diámetro MAYOR, no "d1 contra d1".** Un tronco es cónico:
va de 73 cm en la base a 58 en la punta. Al cortarlo por el medio, la cara del corte
mide algo intermedio (66), así que el pedazo de arriba queda 66→58 y el de abajo
73→66. Ese 66 supera el diámetro menor de la madre y es un corte perfectamente
normal. El ERP del que salieron estas reglas comparaba d2 contra d2 y rechazaba
cortes válidos.

Como en I1–I5: **`≤`, nunca `==`**. Al aserrar se pierde madera y se descartan
puntas; exigir que la suma dé exacto obligaría al operador a inflar un número.

### 3. El volumen se calcula con Huber, no con Smalian

El ERP de origen usaba Smalian (`π·L·(d1²+d2²)/80000`). Contra las cuatro trozas de
una guía real de SERFOR:

| dimensiones | SERFOR | Huber | Smalian |
|---|---:|---:|---:|
| 100 × 96 × 6.5 | 4.903 | 4.9029 | 4.9050 |
| 93 × 90 × 6.33 | 4.162 | 4.1623 | 4.1634 |
| 55 × 51 × 7.28 | 1.606 | 1.6061 | 1.6084 |
| 73 × 58 × 9.7 | 3.268 | **3.2685** | **3.3113** |
| error acumulado | | **0.0010** | 0.0491 |

Se usa **Huber sobre el diámetro medio**, que es la que reproduce lo que declara el
documento. El volumen del libro tiene que cuadrar con la guía.

El operador puede escribir el volumen a mano y entonces manda el suyo: midió la
madera. Sólo se calcula cuando no lo pone.

### 4. El descarte se registra, no desaparece

Un pedazo puede marcarse `descarte`. Ocupa volumen de la madre —por eso se anota—
pero no cuenta como producto disponible. `saldoDeTroza()` lo informa aparte: un
volumen que se esfuma sin explicación es lo que un fiscalizador marca.

### 5. LOCK sobre la troza madre

Dos operadores cortando la misma troza a la vez leerían el mismo "ya cortado" y
entre los dos pasarían el volumen. `SELECT … FOR UPDATE` sobre la fila de la madre
dentro de la tx, mismo patrón que I1–I5.

## Consecuencias

- La misma función pura (`calcularRetrozado`) valida en el modal y en el servidor:
  lo que el operador ve rechazado en pantalla es lo que la base rechaza, y no hay
  forma de saltearla mandando el POST a mano.
- Un ingreso anulado no admite retrozar.
- Código de error nuevo: `R1_SOBRE_RETROZADO` (409).

## Lo que NO se hace

- No se cortan pedazos de pedazos.
- No se ajusta el volumen de la madre al cortar: sigue siendo el que declara la
  guía. Lo cortado se deriva de los hijos.
- No se recalcula el volumen que el operador escribió a mano.
