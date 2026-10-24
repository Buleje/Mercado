# ADR-368 — Cubicar el producto contra lo que el libro declara

- **Fecha:** 2026-08-08
- **Estado:** Aceptado
- **Ámbito:** Libro CTP · Productos disponibles (`CtpCubicarProductoModal`,
  `lib/forestal/cubicacion-cuadre.ts`, `CtpProductosDisponibles`)
- **Relacionados:** ADR-316 (saldo único), ADR-349 (producción en paquetes),
  ADR-366 (la ficha del paquete), ADR-367 (acciones del stock), y el cubicador de
  Herramientas (`CubicadorMadera`)

## Contexto

El cubicador mide madera **en el aire**: se dicta una pila y sale su pie tablar.
Pero la madera que está en Productos disponibles ya tiene un asiento: la corrida
declaró un producto, una especie, una cantidad de piezas y un volumen.

Medir esa pila con la herramienta suelta y guardar el resultado por separado deja
dos papeles que hablan de la misma madera sin haberse mirado nunca — y el que los
cruza no es el operador, es un fiscalizador. La cubicación además es la que
alimenta el **ANEXO N° 04**, que detalla pieza por pieza lo que la guía resume.

## Decisión

1. **`cuadrarConLibro(piezas, declarado)`** (puro, 11 tests) compara la medición
   contra el asiento en cuatro campos —**tipo, especie, piezas y volumen**— y
   devuelve un aviso por campo, con la diferencia exacta y por qué importa.
   Tolerancias del negocio, no del float: **10 litros** en volumen (una pila
   medida dos veces por gente honesta da eso) y **cero** en piezas (se cuentan con
   la mano). Una diferencia de volumen ≥ 5 % pasa de aviso a error.
2. **Avisa, no bloquea.** La medición real puede diferir del asiento por motivos
   legítimos —se midió mejor, el paquete se rearmó—, así que el primer clic en
   guardar muestra las diferencias y el segundo guarda igual, dejándolo escrito
   en las notas del registro. Prohibir guardar empujaría a maquillar la medición.
3. **El cuadre se calcula mientras se mide**, no al guardar: enterarse al final es
   enterarse con cuarenta filas ya tipeadas.
4. **La herramienta comparte lo que importa con el cubicador, no su código.**
   Mismas fórmulas (`cubicarPieza`, `tipoDePieza`), mismas celdas tipo Excel
   (`CeldaNum` + `useTecladoGrilla`), mismo `TipoSelect` y **el mismo lugar donde
   se guarda** (`POST /api/admin/forestal/cubicaciones` con `ctpEntryId`
   apuntando a la corrida). Lo que no se duplica es el dictado por voz ni la
   importación de Excel: una segunda copia de 2000 líneas diverge a la semana, y
   esas dos cosas viven en Herramientas → Cubicador.
5. **De la cubicación sale el ANEXO N° 04**, con las piezas que se acaban de
   medir. Antes el anexo se abría desde la fila con las medidas del paquete
   convertidas: servía para un paquete dimensionado y quedaba vacío para el resto.

## Consecuencias

- La cubicación queda **ligada a la corrida** por `ctpEntryId`: desde un despacho
  se puede llegar a las medidas pieza por pieza que el Libro no guarda.
- Guardar con diferencias deja constancia en `notas` — el registro dice que no
  cuadraba, en vez de aparentar que sí.
- Las cubicaciones siguen viviendo en el KV por tenant (`ForestCubicacionesDB`,
  tope 300): son la MEDICIÓN de un lote, no un movimiento del libro.

## Alternativas consideradas

- **Embeber `CubicadorMadera` entero en el modal**: 2088 líneas con voz, Excel,
  resúmenes y liquidación. Habría que refactorizarlo antes, y el 90 % de eso no
  se usa midiendo un paquete contra su asiento.
- **Bloquear el guardado si no cuadra**: convierte el aviso en un obstáculo y
  empuja a tipear números que cuadren en vez de los que dice la cinta.

## Verificación

Tenant real, sobre el paquete `PQ-DIM-9427` (12 piezas · 0.0336 m³ ·
`MADERA ASERRADA (COMERCIAL)`): se midieron 14 piezas de 2.5×20 cm × 2.8 m y la
pantalla avisó las cuatro cosas —tipo «Tabla» contra «COMERCIAL», especie OK,
`+2` piezas y `+0.1624 m³` (483 %)—. El primer clic pidió confirmación y el
segundo guardó: en la base quedó `PQ-DIM-9427 · Tornillo`, `ctpEntryId` de la
corrida 95052, 14 piezas · 83.06 pt · 0.1960 m³ y la nota «Se guardó con
diferencias respecto del asiento». Light y dark, sin errores de consola.
