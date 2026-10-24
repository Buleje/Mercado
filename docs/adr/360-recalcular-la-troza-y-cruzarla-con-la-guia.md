# ADR-360 — Recalcular la troza y cruzarla con la guía

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · lista de trozas · verificación de la importación
- **Relacionado:** ADR-353 (cuadrar la guía) · ADR-312 (importar desde SERFOR)

## Qué fórmula usa la guía — medido, no supuesto

Brandon pidió cubicar con **Smalian** (promedio de las áreas de los dos extremos)
y comparar contra el volumen de la guía. Antes de implementarlo se midieron las
dos fórmulas contra **seis piezas reales**:

| pieza | guía | Huber | Δ | Smalian | Δ |
|---|---|---|---|---|---|
| 20/A | 2.0430 | 2.0428 | −0.01 % | 2.0433 | +0.01 % |
| 111/B | 3.5160 | 3.5162 | +0.01 % | 3.5193 | +0.09 % |
| **117/B** | 2.1180 | 2.1182 | +0.01 % | 2.1425 | **+1.16 %** |
| 112/A | 4.9660 | 4.9659 | −0.00 % | 4.9758 | +0.20 % |
| 99/B | 2.7200 | 2.7201 | +0.00 % | 2.7202 | +0.01 % |
| 25/A | 1.7000 | 1.7001 | +0.00 % | 1.7063 | +0.37 % |

**SERFOR publica con Huber** (área del diámetro medio). Smalian se separa cuanto
más cónica es la troza: `117/B` va de 62 a 50 cm y se desvía 1.16 %.

Por eso **el que juzga si una pieza está mal cargada es Huber**. Usar Smalian
marcaría en rojo la `117/B`, que está perfecta — y siete rojos falsos enseñan a
ignorar la lista entera (lección de ADR-353).

**Smalian se calcula igual y se muestra al lado**, porque es la fórmula que pide
el operador y la diferencia entre las dos **es información**: mide la conicidad.

## Qué detecta

`verificarLista()` recalcula cada fila y la clasifica:

| Estado | Qué significa |
|---|---|
| `ok` | medidas y volumen se corresponden (±2 %) |
| `sin-medidas` | no hay con qué recalcular — un hueco, no un error |
| **`multiplo`** | el declarado es N veces el unitario: la fila junta N piezas y `cantidad` no lo dice |
| `desvio` | no cuadra y no es múltiplo limpio: hay que mirarlo |

Más **duplicados dentro de la guía**: dos filas con la misma codificación son la
misma troza contada dos veces, y eso infla el patio sin que ningún total lo
delate.

La tolerancia es **2 %**, y sale de la medición: Huber reproduce la guía con
≤0.01 %, así que 2 % absorbe cualquier redondeo del emisor y sigue atrapando un
`×3` (+200 %). Bajarla a décimas llenaría la lista de rojos por el último decimal.

`propuestaDeCorreccion()` devuelve **las dos lecturas** de un múltiplo —es una
troza y el volumen está mal, o son N y la cantidad está mal— y no elige.

## Dónde se ve

En el **modal de cuadre**, que es donde el operador ya va a resolver: una tabla
por pieza con `D1 × D2 × largo`, Huber, Smalian, lo que dice la guía y el desvío,
más el aviso de duplicados.

## Lo aplicado al libro de Brandon

Con su confirmación explícita («es una sola y el volumen real es 2.043»):

| Guía | Pieza | Antes | Ahora |
|---|---|---|---|
| 019-0000016 | `20/A` | 3 trozas · 6.1290 | **1 · 2.0430** |
| 019-0000013 | `111/B` | 3 trozas · 10.5480 | **1 · 3.5162** |

Los dos volúmenes salen del recalculo por Huber sobre las medidas de la propia
guía, no de una estimación. Ambos quedan en auditoría con su motivo.

**El barrido del libro pasó de 2 descuadres a 0**: *«Todos los ingresos con
detalle cuadran con sus piezas»*.

## Verificación

16 tests sobre las dos fórmulas, los cuatro estados, los duplicados y las
propuestas. En pantalla: la tabla renderiza con sus columnas y la rama «sin
medidas» se comporta (verificado en el tenant de pruebas, que es el único que
conserva guías descuadradas). 0 errores de consola.
