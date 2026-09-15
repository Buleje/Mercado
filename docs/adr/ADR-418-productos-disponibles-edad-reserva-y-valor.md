# ADR-418 — Productos disponibles: la edad del patio, la reserva, el valor y la salida a Excel

- **Fecha:** 2026-09-15
- **Estado:** aceptado — migración escrita, **pendiente de aplicar** (`prisma/migrations/adr-418-ctp-apartar-productos.sql`)
- **Pedido por:** Brandon — «dame varias funciones de mejora para esa pestaña, nuevas y mejores ideas para potenciar
  la pestaña de disponibles productos». De las cuatro propuestas eligió **las cuatro**.
- **Depende de:** ADR-316 (el saldo sale de una sola fuente, `?disponibles=1`), ADR-349 (la pestaña),
  ADR-367 (acciones en la fila), ADR-400 (KPIs filtrables), ADR-134 (`WoodEntry.costoTotal`), ADR-417 (escuadría
  del paquete).

## Contexto (medido el 2026-09-15 sobre `inversiones-agroforestales-blas-sociedad-anonima`)

| Qué | Cifra | Fuente |
|---|---|---|
| Lo más viejo | **1 paquete parado 331 días** (3,814 m³); 2 a 95 d; 24 a 45 d (77,875 m³); 6 a 5 d | `SELECT` por `entryDate` |
| Edad en pantalla | la tabla no mostraba **ninguna fecha ni antigüedad**; «parado hace X» ya existía en Lotes y en LO-TH | `CtpSaldosView.tsx:285`, `loth-trace.ts:227` |
| Orden | **0 columnas ordenables**: «cuál es el más viejo» no se podía contestar desde la tabla | `th[aria-sort]` = 0 en el navegador |
| Medidas | **27 paquetes sin escuadría**, **19 con 0 piezas declaradas** | `ForestCtpPaquete` |
| Salidas sin guía | **9 de 14 corridas** salieron por «marcar como usado» — sin guía y sin cliente | `usadoAt` |
| Reserva | no existía ningún estado entre tildar los paquetes y registrar la GTF | grep `Apartar|Reservar` = 0 |
| Exportar | la pestaña **no exportaba nada**; Despacho y Saldos sí | grep `Exportar` = 0 en el navegador |
| Plata | **0 de 24 guías** tienen `costoTotal` y hay **0 filas** en `ForestCtpConsumo` | `SELECT` |

El patio se describía sólo por su tamaño —m³, paquetes, piezas, especies— y nunca por su edad, su compromiso ni su
valor. 85 m³ de Tornillo aserrados ayer y 85 m³ parados desde hace once meses se leían igual en esta pantalla, y no
valen lo mismo: la madera aserrada parada se mancha de hongo azul y pierde precio.

## Decisión

### 1. La edad del patio, a la vista y ordenable
`lib/forestal/edad-del-patio.ts` (puro) define tres tramos —hasta 30 días, 30 a 90, más de 90— y la pastilla de color
que los muestra. La edad sale de la fecha del asiento de la corrida: es cuando esa madera salió de la sierra.

- Columna **«Parado hace»**, prendida por omisión.
- `ThOrdenable` en `ctp-tabla.tsx` (el primitivo estaba copiado a mano en tres tablas del panel; ahora vive una vez) y
  la comparación en `lib/forestal/disponibles-orden.ts`, con tests.
- **Los nulos van al final en los dos sentidos.** Un paquete sin piezas declaradas no es «el que menos tiene»: es uno
  del que no se sabe, y son justo las 19 filas que el libro tiene hoy sin cantidad.
- KPI **«Lo más viejo lleva»** con el desglose por tramo.
- La hora se lee en el navegador dentro de un efecto: calcular días en el server daría un número distinto al del
  cliente y React lo marcaría como mismatch. `edadEnDias` cuenta en calendario **Lima**, no UTC (con UTC la columna
  entera sumaba un día pasadas las 19:00).

### 2. Apartar: el estado que faltaba entre elegir y despachar
Modelo nuevo `ForestCtpApartado` (no columnas en el paquete): una reserva tiene plazo, se libera, y hace falta poder
apartar tanto un paquete como una corrida sin paquetes. Un índice único **parcial** —`WHERE "liberadoAt" IS NULL`—
impide dos reservas vivas sobre la misma fila; Prisma no sabe declarar índices parciales, así que vive en el `.sql`.

Apartar **no saca la madera del patio**: sigue contando en los m³ y en los KPIs. La marca dice para quién es y hasta
cuándo. Una reserva vencida que nadie soltó se pinta en rojo: es stock congelado por error, que es lo que hay que ver.

El destinatario es **texto libre** y la pantalla lo dice: el cliente todavía no es una FK (deuda conocida del radar).
Para que el segundo apartado del mismo cliente no se escriba con otra grafía, el campo trae un `datalist` con los
nombres ya usados — el mismo bug que el libro pagó con «Tornillo» y «TORNILLO».

### 3. Cuánto vale lo que está parado
`lib/forestal/valor-del-patio.ts` (puro). El costo entra por m³ de **materia prima**; un m³ de producto aserrado
costó `1 / rendimiento` m³ de troza, así que `costoProducto/m³ = costoMP/m³ ÷ rendimiento`.

Cuatro fuentes, **en orden y sin mezclarse**, y siempre se dice cuál se usó:
1. `costoUnitarioSnap` de los consumos (congelado al cierre);
2. consumos vivos, prorrateando el costo de su guía;
3. sin consumos, las guías de `gtfOrigen` ponderadas por volumen — hace falta porque en Blas hay **0 consumos**;
4. nada → `null`.

El rendimiento sale del asiento, o se deriva de `producido / volumeInputM3`. **Nunca se supone 56 %**: ese es un tope
legal (ADR-358), no un rendimiento real.

Con 0 de 24 guías costeadas, hoy la columna muestra **un guion y la tarjeta dice «sin costear · faltan costear 24
guías en Ingresos»**. Un `S/ 0` afirmaría que esa madera no costó nada, y el pie de la columna dice «parcial» en vez
de un subtotal disfrazado de total.

### 4. Exportar, y los cuatro avisos que acotan la tabla
- Botón **Exportar** con las mismas reglas del resto del libro (`;`, coma decimal, `celdaCsv`): se baja **lo ordenado
  y acotado, con las columnas prendidas**. Un CSV que no coincide con la pantalla obliga a averiguar cuál de los dos
  miente.
- `AvisosDelStock`: cuatro chips —parados +90 d, sin escuadría, sin piezas, apartados— que **filtran** la tabla, no
  sólo la anuncian (memoria `deuda-no-es-indicador`). Las cuentas se calculan sobre todo lo filtrado, no sobre lo ya
  acotado, o el chip se apagaría solo al tildarse.
- El total del pie pasó a ser **la suma de su propia columna**. Antes venía del KPI (saldo por corrida) y con un chip
  puesto habría quedado mostrando el total de filas que no están en pantalla.

## Consecuencias

- La pestaña puede contestar por primera vez «qué es lo más viejo», «qué le falta medir», «qué está comprometido» y
  «cuánto vale» sin salir a otra pantalla.
- **La migración no está aplicada**: hasta que corra, apartar devuelve error del servidor y la columna de apartados
  queda vacía. El resto (edad, orden, avisos, export) no depende de la base.
- El valor del patio queda a la espera de que se carguen los costos de las guías. La tarjeta dice cuántas faltan, que
  es el trabajo concreto.
- `CtpProductosDisponibles.tsx` sigue muy por encima de las ~300 líneas del estándar: se extrajeron los avisos y el
  orden, pero el componente sigue siendo el más grande del libro. Queda anotado.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Columnas `apartadoPara/Hasta/...` en `ForestCtpPaquete` y en `ForestCtpEntry` | Ocho columnas duplicadas en dos modelos, sin historial y sin poder liberar sin borrar el dato |
| Valorizar con un precio de lista por especie | Un catálogo que alguien tendría que mantener; el costo real ya está en la guía y no se estaba usando |
| Suponer 56 % de rendimiento cuando falta | Es el tope legal, no un rendimiento: inventaría un costo con apariencia de oficial |
| `exportToCSV` de `lib/export-utils.ts` | Usa coma como separador; Excel es-PE lee así los decimales como texto y no suma |
