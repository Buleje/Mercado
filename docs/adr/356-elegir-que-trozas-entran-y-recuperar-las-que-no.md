# ADR-356 — Elegir qué trozas entran a la sierra, y recuperar las que no

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · Producción y Consumos · lote de aserrío
- **Relacionado:** ADR-334 (lote de aserrío) · ADR-340 (consumir en el patio) · ADR-349 (producción en paquetes) · ADR-355 («libre» es relativo al lote)

## El pedido y lo que la medición encontró detrás

*«Quiero poder elegir qué troza voy a poner en producción del lote, y las
opciones de recuperación y reutilización de trozas.»*

Las piezas apartadas se mostraban **tildadas y fijas**: el lote iba entero a la
sierra o no iba. Y al buscar por dónde permitir el subconjunto apareció el
problema de fondo:

> `ForestLoteAserrioDB.consumir()` consumía **todas** las piezas libres del lote.
> El parámetro `trozaIds` sólo servía para AGREGAR piezas.

Es decir: destildar en la pantalla no habría cambiado nada. La UI habría mentido
—el clásico de verificar por el camino propio y no por el del usuario—.

## La decisión

### 1. Un lote se puede aserrar por partes

`consumir(..., soloEstas?)` restringe el consumo a las piezas elegidas. Tres
consecuencias que había que atar juntas o el libro quedaba inconsistente:

| | Antes | Ahora |
|---|---|---|
| Piezas marcadas | todas las libres del lote | **sólo las elegidas** |
| `volumeInputM3` de la corrida | el lote entero | **lo que realmente entra** |
| Estado del lote | siempre `consumido` | `consumido` **sólo si no quedó madera** |

El `volumeInputM3` es el que más importa: declarar el lote entero como materia
prima cuando entró la mitad infla el denominador del rendimiento y descuadra I1/I2
contra las piezas efectivamente marcadas.

Y el lote con consumo parcial **sigue abierto**: darlo por consumido escondería
las piezas que quedaron apartadas esperando la corrida siguiente.

### 2. Recuperación: apartar no es consumir

Cada pieza del lote trae un **«sacar»** que la devuelve al patio
(`quitarTroza`, que ya existía en el backend y no estaba expuesto). Mientras el
lote no entre a la sierra, esa madera sigue siendo del patio y tiene que poder
salir para armar otro lote. Sin esto, equivocarse al armar el lote obligaba a
consumirlo.

Las apartadas llegan **tildadas** —es lo que el operador armó en el patio— pero
la preselección se aplica **una sola vez por lote**: si se re-aplicara en cada
render, destildar una sería imposible porque volvería sola.

## Los gráficos que faltaban en el Tablero

**Entrada contra sierra, acumulado.** Dos curvas: si se separan, el patio crece;
si se juntan, se está vaciando. Es la lectura que la barra por cubo no puede dar.

**Días de materia prima** al ritmo del período, y acá hubo que corregirse: la
primera versión proyectaba sobre `variacionPatioM3` y daba **408 días** en un
patio que sólo había acumulado 57 m³ ese trimestre. **El stock no es la
variación.** `movimientoDelLibro` ahora trae la apertura del período
(`aperturaDePeriodo`, la misma que usa la curva de saldo) y expone
`saldoPatioM3 = apertura + ingreso − consumo`. Con el stock real da 445 días, y
el rótulo dice «al ritmo del período» porque sigue siendo una proyección.

## Verificación

**Tenant real, lote `LA-2026-003`:**

1. Abre con las 6 apartadas **tildadas** y 6 botones «sacar». «Registrar
   producción (6 pza)».
2. Destildar una → **«Registrar producción (5 pza)»**, resumen «5 elegidas ·
   20.6210 m³ · 8,739 pt (5 ya apartadas en el lote)».
3. **«sacar»** en `100/A` → sale del lote: quedan 5 «en este lote» y la cabecera
   pasa a «5 pza · 20.6210 m³». **La pieza se restauró al lote** después de
   medir: vuelve a decir «6 pza · 23.9220 m³».

**Tablero** (tenant de pruebas): el bloque acumulado dibuja a 1096 px, «quedan
~445.3 días de materia prima», 5 bloques de gráficos. 0 errores de consola en
todas las corridas.

Queda dicho: el consumo parcial está verificado en la **capa de datos y en la
pantalla**, pero no se ejecutó un consumo real de punta a punta en el tenant de
Brandon — su lote sigue trabado por el descuadre de la guía (ADR-353) y aserrar
madera de verdad en su libro no es una prueba que me corresponda hacer.
