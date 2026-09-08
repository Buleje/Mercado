# ADR-400 — Los KPIs se filtran, y el permiso es una columna

- **Fecha:** 2026-09-08
- **Estado:** aceptado
- **Pedido por:** Brandon — «KPIs interactivos con filtro de especie (todos por defecto) y de
  permiso, combinables, y lo mismo en las demás pestañas»; «en la columna proveedor sólo el
  proveedor, y en permiso el filtro con proveedor y resolución»; «un botón para ocultar y
  mostrar columnas».

## Contexto

Las cifras del período y los filtros vivían en dos lugares distintos. Para saber cuánto entró
de tornillo por un título habilitante había que filtrar la tabla de abajo y sumar a mano, o
creerle a un KPI que hablaba de otra cosa. Y había una contradicción medible:

| Pestaña | Qué describían los KPIs |
|---|---|
| Ingresos | el conjunto FILTRADO — `stats()` comparte el `where` con `list()` |
| Producción / Despacho / Consumos | **todas** las líneas, aunque la tabla mostrara una especie |

Además, el permiso (`originCode`) y la resolución vivían apilados dentro de la celda del
proveedor, donde se leían como parte de la razón social, y no se podía filtrar por ellos.

## Decisión

### 1. Una fila de filtros pegada a las cifras

`CtpKpiFiltros` es una pieza tonta —dibuja los desplegables que le pasan— y vive DENTRO del
panel de indicadores, arriba de las tarjetas. Cada campo arranca en «todas», que es el período
completo, y se combinan. Las opciones salen de lo que HAY en el período y dicen cuánto pesan
(«Tornillo — 9 · 55.78 m³»): elegir a ciegas entre doce permisos y descubrir después que uno
tiene 0.4 m³ es el camino largo.

Con el panel cerrado, un contador de filtros en el botón delata que el resumen habla de una
parte. Un número chico sin explicación se lee como una caída del mes.

### 2. Filtro por permiso, de punta a punta

`WoodEntryListFilters.originCode` → `buildListWhere` **por igualdad** (no `contains`: el valor
sale de un desplegable, y un permiso que es prefijo de otro arrastraría filas ajenas a un
número que después se declara), su espejo en `buildLateConditions`, el parámetro `?permiso=`
en la ruta, y una faceta `permisos` en `stats()` agrupada por `(originCode, providerName,
originSourceNumber)` para poder decir de quién es cada permiso.

### 3. Los KPIs de las otras pestañas respetan sus facetas

`use-ctp-secciones` calcula ahora sobre `filtrarSeccion(entries, facetas)`. El filtro de
ESTADO queda afuera, igual que en Ingresos: los KPIs describen lo registrado del período y el
desglose por estado es otra pregunta.

Eso cubre **Producción** y **Despacho**, que comparten `CtpEntriesView`. **Consumos** tiene
vista propia y dos apartados, y cada uno lleva su barra con los filtros que ya existían:

| Pestaña / apartado | Campos | Estado previo de sus cifras |
|---|---|---|
| Consumos · Sección 2 | especie, **permiso (nuevo)**, guía de ingreso | ya se calculaban sobre lo filtrado |
| Consumos · Trozas en el patio | especie, permiso, proveedor | ídem (`resumenPatio(filtradas)`) |
| Productos disponibles | especie, permiso, producto | ídem (`visibles`) |
| GTF ingresadas | los mismos cuatro de Ingresos | 🚨 describían el período ENTERO |
| Trazabilidad · Trozas | especie, permiso, guía | 🚨 el panorama contaba TODA la pila |
| Trazabilidad · Guías emitidas | especie, producto, destino | 🚨 el resumen contaba TODO el período |

El cuadro de consumos tenía el permiso en una columna (`codigoOrigen`) y ninguna forma de
filtrarlo, que es justo la pregunta del fiscalizador: «¿cuánto se aserró de este título?».

**`stats()` no aplicaba el filtro de RECEPCIÓN** (`list()` sí). En «GTF ingresadas» —el
archivo— las tarjetas y los desplegables hablaban del período completo, bandeja incluida,
mientras la tabla mostraba sólo lo recepcionado; y en la bandeja pasaba al revés. Es
literalmente lo que promete el comentario de `buildListWhere`: *«`list` y `stats` deben
filtrar exactamente igual, si no los KPIs describen un conjunto distinto al de la tabla que
están encabezando»*. Lo destapó el peso de las opciones: decía «55.78 m³» y la tarjeta 49.
Medido después del arreglo: la bandeja «Por recepcionar» pasó de 13 ingresos / 82.89 m³ con
2 filas en pantalla, a 2 / 15.17 m³.

El peso de cada opción dice **«asientos»** con todas las letras: en el archivo la tarjeta
cuenta GUÍAS (documentos) y la faceta cuenta líneas del libro. Sin la palabra, «8 · 49.00 m³»
al lado de «8 guías» se lee como si fueran la misma cosa por casualidad.

### 4. El permiso es columna, el proveedor es el proveedor

La celda de proveedor queda con el proveedor. `N° Permiso` es columna propia, con el código y
su resolución debajo, y un filtro cuyas opciones se etiquetan «código · Res. N · proveedor».
En móvil, donde no hay columnas, el permiso va como dato con nombre bajo el proveedor.

### 5. Botón «Columnas» en la tabla de ingresos

`ColumnasMenu` + `useColumnasVisibles` (los mismos de Producción). Se pueden apagar Documento,
Proveedor, N° Permiso y Estado; las que identifican la fila —N° de libro, fecha, especies,
cantidad y acciones— quedan fijas. El `colSpan` del pie cuenta las columnas vivas: con una
apagada, un número fijo corría el total una celda.

### 6. Dos grafías de una especie son una especie

Lo destapó el filtro nuevo: el desplegable ofrecía «Tornillo» y «TORNILLO» con la mitad del
volumen cada una, y elegir cualquiera escondía la otra mitad. Las facetas de sección agrupan
por `claveEspecie()` y `filtrarSeccion` compara por esa clave. Se muestra el nombre **tal como
está escrito en el libro**: inventar una forma canónica pondría en pantalla un texto que no
está en ningún asiento.

### 7. Dónde NO se puso, y por qué

No toda pantalla con números admite esta fila. Ponerla igual habría fabricado cifras que
mezclan alcances, que es peor que no tenerla:

| Pantalla | Por qué no |
|---|---|
| Saldos · «Cómo está hoy» | `MateriaPrimaTotales` trae `despachadoDirectoM3` e `ingresosCount` que NO se pueden partir por especie: una tarjeta diría «esta especie» y la de al lado «toda la planta». El desglose por especie ya vive abajo (`DisponiblePorTipo`) |
| Saldos · «Qué puede salir» | ya lo tiene: `BalanceDeCapacidad` recibe `filtros`/`opciones`/`onFiltros` |
| Resúmenes SERFOR | son los cuadros OFICIALES; un cuadro filtrado no es el cuadro que se presenta |
| Tablero, Cumplimiento, Cierre | agregados del período que arma el servidor (`/ctp/movimiento`, score, checklist): filtrarlos es un parámetro nuevo del endpoint, no un recorte en el cliente |
| Historia del lote | es UN lote |
| Radar, Planta, EUDR | el radar ya filtra con sus focos, la planta es un mapa de zonas y el EUDR una lista de orígenes con su propio selector |

## Consecuencias

- Las opciones de un desplegable se recalculan con los otros filtros puestos (elegir Tornillo
  deja sólo sus permisos). Es coherente: describen lo que queda.
- Un campo sin opciones no se dibuja; un desplegable vacío es una promesa que no se cumple.
- `claveEspecie` no toca Ingresos, cuyas facetas las calcula la DB agrupando por el texto
  exacto. Si ahí aparecen dos grafías, es el mismo arreglo un nivel más abajo.
