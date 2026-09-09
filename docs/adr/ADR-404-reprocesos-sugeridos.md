# ADR-404 — Reprocesos sugeridos en la distribución

- **Fecha:** 2026-09-08
- **Estado:** aceptado
- **Pedido por:** Brandon — «en saldo hay madera de tipo comercial, 25 piezas que dan 2.215 m³, pero
  el resumen dice que debo despachar 161 paquetes con 2.124: entonces se sugiere que ese comercial
  se pueda reprocesar… de comercial a paquetería la cantidad de piezas aumenta pero el volumen
  tiene que ser menor (si es mayor no cumple, no tendría sentido)».
- **Depende de:** ADR-403 (el puente Saldos → cubicador), la distribución de rolliza sobre lo
  aserrado y su bloque de aserrada directa.

## Contexto

La distribución cruza dos cosas: **bloques** que respaldan y **piezas cubicadas** que hay que
respaldar. Cuando no cierran, la pantalla ya dice *qué* pasa —«2.830 m³ sin bloque que los ampare»,
«2.215 m³ de capacidad libre»— pero no dice *qué hacer*.

Y muchas veces la respuesta no es comprar madera ni cargar otro bloque: es **volver a pasar por la
sierra** lo que ya está en el patio. Comercial y paquetería son la misma madera con otra escuadría;
reprocesar comercial da paquetería —más piezas, menos volumen—. Eso hoy se veía mirando dos tablas
y sacando la cuenta a mano, en la cabeza del que conoce el patio.

## Decisión

### 1. Un apartado propio: «Reprocesos que cuadrarían la distribución»

Va pegado al balance de «Distribuido / Falta por distribuir», porque es la respuesta a la pregunta
que ese balance deja abierta. Aparece **sólo si hay algo que sugerir**.

### 2. La regla dura: el volumen nunca crece

Se sugiere convertir `min(disponible, faltante)` — nunca más de lo que hay. Si el origen no
alcanza, la línea dice cuánto cubre y cuánto sigue faltando; si sobra, dice cuánto queda sin usar.
Un reproceso **pierde** madera (el corte, el recorte, el aserrín): prometer más m³ de los que
entraron es hacer declarar de más, que es exactamente lo que Brandon marcó como «no tendría
sentido».

### 3. Dos maneras de detectarlo, porque piden cosas distintas

| Motivo | Qué pasa | Qué hay que hacer |
|---|---|---|
| **Falta amparar** | Hay capacidad libre en bloques de un tipo y piezas sin respaldo de otro | Reprocesar cuadra la hoja |
| **Ya lo está amparando** | El bloque dice comercial y está respaldando paquetería | El reparto lo permite, pero el papel afirma algo que sólo es cierto si ese reproceso existe: hay que declararlo |

El segundo es el que aparece sin configurar nada: el motor de reparto no mira tipos salvo que se lo
pidan con «Lleva sólo», así que un bloque de comercial ampara paquetería sin chistar. Detectarlo es
lo que evita que el papel diga una cosa y el Libro otra.

### 4. De dónde sale el tipo de un bloque, sin adivinar

Dos fuentes, en orden: **«Lleva sólo»** (`gruposFiltro`) cuando declara un único tipo, y
`tipoProducto`, que llena quien siembra el bloque desde el Libro —el puente de Capacidad y el picker
de paquetes, donde el producto está declarado (`MADERA ASERRADA (COMERCIAL)` → `Comercial`)—.

Un bloque **sin tipo no sugiere nada**, y uno que declara dos tampoco: no hay de cuál sacar la
madera. Adivinar por la etiqueta sería inventar un dato de trazabilidad a partir de un texto libre.

### 5. Siempre se lee **por tipo**, mire la tabla lo que mire

«De comercial a paquetería» es una frase sobre tipos comerciales. Bajo la vista «por medida» los
grupos serían `2×8×10 → 6×6×10`, que no es un reproceso que alguien pueda mandar a la sierra. La
sugerencia recalcula la distribución con `dim = "tipo"` cuando hace falta.

### 6. El piso de lo sugerible: 0.05 m³, no el epsilon del float

El reparto asigna piezas enteras, así que a casi todo bloque le quedan unos litros libres —los de la
pieza que ya no entraba—. «Reprocesá 0.010 m³» es mandar diez litros a la sierra: nadie lo hace, y
una lista con esos renglones enseña a ignorar la lista entera. 0.05 m³ ≈ 21 pie tablar ≈ una tabla
de 2×8×10: menos que eso no es una orden de trabajo.

### 7. Es una sugerencia, no un movimiento

⛔ **No registra nada en el Libro.** El reproceso real se declara desde Productos disponibles, con
su origen y su destino, y ahí descuenta stock (ADR-316). Acá sólo se dice cuál conviene hacer.
Mezclarlo sería convertir una herramienta de cálculo en una puerta de escritura al libro
fiscalizable.

## Consecuencias

- La distribución deja de mostrar sólo el problema y muestra la salida, con los números del patio.
- Aparece un campo nuevo (`tipoProducto`) que el reparto **no** usa para repartir: sólo describe. Si
  algún día se usara para filtrar, un bloque traído del saldo dejaría de amparar otras cosas —eso
  sería otra decisión, y hoy la restricción se declara con «Lleva sólo».
- La sugerencia no sabe del rendimiento real del reproceso: dice cuánto se puede convertir como
  máximo, no cuánto va a salir. El rendimiento lo pone la sierra y se declara al registrarlo.
- Un operario podría reprocesar de más si mira sólo la primera línea: cada sugerencia dice cuánto
  hay disponible, no cuánto queda después de aplicar la otra. Con dos orígenes para el mismo
  destino, la decisión es suya — el cálculo no elige por él.

## Alternativas

- **Aplicar el reproceso desde acá.** Escribiría en el Libro desde una herramienta de cálculo, sin
  el flujo que ya valida origen, destino y stock. Se descartó.
- **Sugerir por medida.** Da conversiones que nadie puede mandar a la sierra (`2×8×10 → 6×6×10` no
  es un producto, es una pieza).
- **Adivinar el tipo del bloque por su etiqueta.** «MADERA ASERRADA (COMERCIAL) · 8-2026» contiene
  la palabra, pero un texto libre no es un dato declarado.
