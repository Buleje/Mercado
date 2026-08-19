# ADR-345 — Las cifras del patio, y el acta de consumo como lugar donde se decide

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · pestaña Consumos · vista Lotes de aserrío
- **Relacionado:** ADR-339 (bandeja) · ADR-340 (consumir en el patio) · ADR-341 (el montón) · ADR-343 (apartados) · ADR-344 (formato de tablas)

## 1. La tabla dejó de atrapar el scroll

`TablaCtp` aceptaba un alto máximo y las tablas largas scrolleaban **adentro**:
llegar al pie de la página obligaba a sacar el mouse de la tabla, y en el
trackpad el gesto se comía la lista en vez de la página. Con el tope de 25 filas
de ADR-344 el encierro ya no compra nada.

El patio y las piezas del lote crecen con su contenido y **scrollea la página**.
`altoMax` sigue existiendo para quien lo necesite; nadie lo usa hoy. Consecuencia
asumida: la cabecera `sticky` sólo se pega dentro de su contenedor, así que en
una tabla que no scrollea deja de fijarse. Es el precio de que el scroll sea uno
solo — CSS no permite scroll horizontal propio y cabecera pegada a la página en
el mismo elemento.

## 2. Los KPI hablan del apartado que se está mirando

La franja de cuatro cifras era **siempre la del cuadro** —consumos del período,
volumen consumido, especies, rendimiento— incluso con el apartado del patio
abierto. Se leía «3 consumos» con treinta trozas delante.

Ahora cada apartado trae los suyos (`lib/forestal/patio-resumen.ts`, puro, 12
tests):

| Cifra | Qué dice |
|---|---|
| **Trozas en el patio** | piezas · libres / apartadas en lotes / no consumibles |
| **Volumen en patio (m³)** | total · pie tablar · **cuánto se puede aserrar hoy** |
| **Especies en la pila** | cuántas · cuál manda y con qué % del volumen |
| **Espera en el patio** | días de la pieza **más vieja** · cuántas pasan los 15 |

Más una barra de especies por volumen (la paleta categórica del proyecto, no una
propia) y una línea con pieza promedio, la mayor, y de cuántas guías, permisos y
proveedores viene esa madera.

Tres decisiones que no son de estilo:

- **El % se reparte por volumen, no por piezas.** Cuatro trozas gruesas de
  shihuahuaco pesan en la sierra más que veinte de bolaina.
- **La espera es el máximo, no el promedio.** El promedio esconde justo la pieza
  que se está manchando. `DIAS_PATIO_ANEJO = 15` sale de cómo se mide en el patio
  —quincenas— y no del epsilon de un float: un umbral que se dispara todos los
  días deja de mirarse.
- **«Sólo las libres» no entra en el cálculo.** Es un ayudante para elegir, no
  una opinión sobre qué hay en la pila; si contara, el KPI diría siempre «0
  apartadas» y el total del patio cambiaría al tocar una casilla.

Los filtros también se repartieron: en el patio se elige lote y día (lo que ahí
se hace es cargar la sierra), en el cuadro se busca, se agrupa y se baja el CSV.

## 3. Un criterio único para «libre en el patio»

La vista de Lotes anunciaba **47 piezas libres** y el picker de Consumos ofrecía
**30**. Las 17 de diferencia eran piezas de guías que seguían en la bandeja: dos
pantallas contando la misma madera con criterios distintos.

`estaLibreEnPatio()` es ahora el único predicado —recepcionada, sin consumir, sin
lote, sin bloqueo— y lo usan las dos, con un test que las compara. Es el mismo
bug que ya había mordido a `trozasDelLote` (ADR-342): cuando aparece dos veces,
el arreglo es borrar una de las dos copias.

## 4. El acta de consumo: se decide ahí, no sólo se confirma

El modal mostraba la lista y dos botones. Cualquier corrección —la fecha, una
pieza de más— obligaba a cerrar, volver a la tabla y empezar de nuevo.

Ahora el acta trae:

- **Cuatro cifras arriba** (piezas · volumen y pie tablar · especies · guías de
  origen): qué se está por firmar, antes de cualquier tabla.
- **Fecha editable**, con tope en hoy y aviso: *el libro registra lo que ya pasó*.
- **Observación** → va al casillero **(11)** del libro.
- **Sacar una pieza del acta** sin cerrar. Las que el lote ya tenía apartadas se
  marcan «en el lote» y **no** se pueden sacar de acá: el servidor las consume
  igual, y un botón que no las sacara de verdad sería una mentira.
- Avisos de la selección (mezcla de especies, varias guías) y **Ctrl+Enter** para
  firmar.
- Buscador —sólo a partir de 8 piezas— y el formato de tabla de ADR-344.

### La observación tenía que verse

El primer intento la guardaba concatenada con la frase automática y **no la
mostraba nadie**: `observations` no se renderiza en ninguna vista del CTP. Un
campo que sólo escribe es peor que no tenerlo.

Dos cambios lo arreglaron:

1. La corrida guarda **la nota del operador O la frase automática**, no las dos.
   El lote ya está en `materiaPrimaRef` y en el casillero (10), y que falte
   declarar la producción se sabe por `quantity == null`.
2. El grafo de trazabilidad expone `observations` y el casillero (11) la muestra
   **en lugar del `label`** —«rolliza · Tornillo»— que ya estaba en los
   casilleros (3) y (4). Repetirlo gastaba la única columna libre del cuadro.

## 5. Una sola barra de filtros, y los KPI en el mismo renglón

El selector de lote y la fecha vivían arriba con los filtros de la pestaña, y
los del patio —buscar, especie, guía, permiso, resolución, proveedor— dentro de
la tabla, media pantalla más abajo. Para elegir qué madera entra a la sierra
había que usar las dos.

El estado del filtro subió a la vista (`hooks/use-filtro-patio.ts`, sobre
`filtrarPatio()` y `opcionesDePatio()` puros, 15 tests en total): la vista dibuja
**una** barra con todo —el lote primero, que es el filtro que más manda— y la
tabla se quedó con lo suyo, dibujar filas.

Es una **grilla**, no un `flex-wrap`, y la del cuadro también: envueltos, los
campos quedaban de anchos distintos y en filas dentadas. Ahora los dos apartados
alinean sus campos igual y sus KPI ocupan el **mismo renglón de la pantalla** —
el apartado cambia lo que dicen, no dónde están.

Los subtítulos de las tarjetas se acortaron («30 libres · 0 en lotes · 4
bloqueadas», «49.838 pt · 78.3358 libres hoy»): a tres renglones, las cuatro
quedaban de altos distintos. La barra de especies y la letra chica pasaron a una
sola caja debajo, con las especies en columnas y los números alineados a la
derecha.

Y en el cuadro, la observación va en **una línea** (`whitespace-nowrap`):
apretada en la última columna partía cada fila en cuatro renglones — medido,
**138 px → 58 px** de alto por fila. El cuadro ya scrollea a lo ancho; son once
casilleros.

## Verificación

Camino completo en el tenant real, no un script: se programó `LA-2026-012`
(Tornillo), se eligieron 3 trozas de 2 guías, se sacó una en el modal, se escribió
la observación y se firmó → **2 pza · 3.0000 m³**, corrida **N° 95027** abierta, y
la Sección 2 mostró la fila con el lote en (10) y la nota en (11). Después se
anuló la corrida y se deshizo el lote: el patio volvió a **34 trozas · 30 libres ·
117.6038 m³** y Lotes pasó de decir 47 a decir 30. Light y dark.
