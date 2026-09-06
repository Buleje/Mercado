# ADR-358 — El tope del 56 % y el reparto entre títulos habilitantes

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · modal de producción del lote
- **Relacionado:** ADR-349 (producción en paquetes) · ADR-334 (lote de aserrío) · ADR-314 (`RENDIMIENTO_META`)

## 1. El 56 % pasa de meta a techo

`RENDIMIENTO_META = 0.56` existía como **meta**: pintaba el número de rojo cuando
la corrida no llegaba. Ahora es un **techo que no se cruza**.

De 1 m³ de troza no salen más de 0.56 m³ de tabla; el resto se va en aserrín,
canto y descarte. Declarar más es lo que un fiscalizador lee como **madera metida
de otro lado**, así que se frena el asiento antes de escribirlo.

`RENDIMIENTO_TOPE_PCT` **reusa el mismo 0.56**, no crea una constante paralela:
dos números para lo mismo ya divergieron una vez (56 en producción, 75 en
Consumos) y el operador veía dos veredictos para una sola corrida.

Detalle que costó un test: `0.56 * 100` da `56.00000000000001` en JS, y el tope
se guarda redondo — con el decimal fantasma, el truncado de `topeDeclarableM3`
dejaba pasar una milésima. Y **se trunca, no se redondea**: redondear hacia
arriba es dejar pasar el tope.

### Dónde se aplica

| Capa | Qué hace |
|---|---|
| El botón «Añadir» | se apaga y **dice por qué**: «pasa el tope del 56 %: entran 13.3963 m³ más» |
| `motivosParaGuardar` | bloquea «Guardar» si la SUMA de los paquetes pasa el techo |
| **El servidor** | `declararProduccion` rechaza con **422 `RENDIMIENTO_SOBRE_TOPE`** |

El servidor no es opcional: una regla que vive sólo en la pantalla la saltea
cualquier POST, y ésta existe justamente para que el libro no declare lo
imposible. Sólo aplica cuando la corrida declara **en m³**: dividir pies tablares
por metros cúbicos no es un rendimiento (ADR-355).

El chequeo del «Añadir» va **antes** de agregar el paquete, no después: dejarlo
entrar para marcarlo en rojo obliga a borrarlo, y entre agregar y borrar el
operador ya tipeó el siguiente.

## 2. El reparto entre títulos habilitantes

Un lote junta trozas de dos permisos y el paquete que sale de la sierra es madera
de los dos. **No hay forma física de saber qué tabla vino de qué árbol.** Lo que
sí se puede afirmar —y es lo que la trazabilidad pide— es **en qué proporción
entró cada uno**.

`repartirEntreOrigenes()` reparte lo declarado proporcional al volumen de materia
prima de cada título. El **último absorbe el redondeo**: sin eso, tres orígenes
de un tercio declaraban 99.9999 de 100 y el acta no cerraba contra sí misma.

Las trozas **sin** título habilitante se agrupan bajo `null` y se nombran «sin
título declarado»: una troza sin permiso es justo la que hay que poder señalar,
no la que hay que esconder.

El bloque sólo aparece con **dos o más** títulos; con uno, la línea de siempre.

## Verificación

**Lib** — 18 tests: el tope reusa el 0.56, trunca, el margen nunca es negativo,
el reparto cierra exacto y las trozas sin permiso se nombran.

**Pantalla**, tenant real, lote `LA-2026-003` (23.9220 m³):

1. «Tope de rendimiento **56 %** · máximo declarable **13.3963 m³** · quedan
   13.3963 m³» + barra de progreso.
2. Paquete de **20 m³** → «pasa el tope del 56 %: entran 13.3963 m³ más» y
   **«Añadir» deshabilitado**.
3. Paquete de **10 m³** → entra; el margen pasa a «quedan 3.3963 m³» y la barra
   marca **74.65 %**.
4. Cerrado sin guardar: no se escribió nada en el libro de Brandon.

**Servidor**, tenant de pruebas: con 10 m³ de materia prima, declarar **7 m³**
(70 %) → **422** «Con 10.0000 m³ … el tope (56 %) permite 5.6000 m³; estás
declarando 7». Declarar **5.5 m³** (55 %) → **200**. Datos de QA borrados.

Queda dicho: el bloque de reparto se verificó con **tests**, no en el navegador —
el lote de Brandon tiene un solo título habilitante
(`19-SEC/PER-FMC-2024-008`) y fabricar un segundo permiso en su libro para
sacar una captura sería peor que declararlo.

## 3. El barrido de lo que ya estaba cargado

Un guard nuevo sólo frena lo que se registre **de ahora en más**: lo que ya
estaba queda invisible justo cuando la regla pasa a existir. Y es lo primero que
cruza un fiscalizador — una corrida al 73 % dice que salió más madera de la que
entró.

`corridasSobreTope()` es el **espejo del barrido de guías descuadradas**: el
mismo cruce, del otro lado del libro. Va en Cumplimiento, al lado del otro, y no
bloquea nada —lo hecho está hecho— pero lo pone a la vista con el número, el
exceso y el camino (anular la corrida y volver a declararla).

Mismas dos reglas que el guard: sólo mira corridas **en m³** y la tolerancia es
la del negocio (un litro), no la del float.

### Verificación

| Tenant | Resultado |
|---|---|
| Pruebas | **2 corridas**: `#1` · 8.4500 → 6.2000 = **73.4 %** (1.4680 m³ de más) y `#95001` · 5.1342 → 2.9778 = **58 %** (0.1027 m³) |
| Brandon | «Ninguna corrida declara más de lo que sale de su materia prima» |

24 tests en el lib · 0 errores de consola · design-tokens limpio.

De paso quedó medido de dónde salen los 20 puntos que le faltan al score de
Brandon (80/100): **4 ingresos pendientes de validar**, y nada más — las otras
ocho verificaciones están en orden. Es una acción suya, no un defecto del libro.

## 4. El modal, reordenado

Tres cambios, todos por la misma razón: **lo que se llena una vez no puede estar
mezclado con lo que se repite**.

| Antes | Ahora |
|---|---|
| Bloque «Información de lote» con N° de lote y dos fechas | fuera: el N° ya está en el título del modal y las fechas van como meta del bloque Material |
| «Agregar producción» juntaba **línea + fecha + observación de la corrida** con **código + producto + volumen del paquete** | dos bloques: **«La corrida»** (se llena una vez) y **«Agregar paquete»** (se repite por atado) |
| El tope, sólo como número | número **+ barra de progreso** que se llena mientras se cargan paquetes |

La mezcla era el problema real: con las dos cosas en la misma grilla, se tipeaba
la línea y la fecha creyendo que eran del paquete que se estaba por agregar.
