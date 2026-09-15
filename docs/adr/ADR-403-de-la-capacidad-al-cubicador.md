# ADR-403 — De la capacidad filtrada a la distribución del cubicador

- **Fecha:** 2026-09-08
- **Estado:** aceptado
- **Pedido por:** Brandon — «en capacidad de planta poder escoger según los filtros y que haya un
  botón donde según lo filtrado ese volumen se pueda usar… que vaya a rolliza, a la sección
  distribución de rolliza sobre aserrada, y ahí se ponga automático el bloque de ese resumen».
- **Depende de:** ADR-349 (productos disponibles), ADR-358 (tope 56 %), la distribución de rolliza
  sobre lo aserrado y su bloque de aserrada directa.

## Contexto

Saldos → Control → **Capacidad de la planta** contesta «cuánto producto puede salir de todo lo que
hay hoy», y desde hoy se puede recortar por especie, permisos y guías —varios valores por filtro—.
El número que queda es exactamente el que después hay que repartir en Herramientas → Resúmenes →
Rolliza.

Pero entre las dos pantallas no había ningún camino: se miraba el número, se memorizaba, se abría
la otra herramienta y se **tipeaba a mano**. Retipear un volumen es la vía más corta a que el papel
que se firma y el Libro digan cifras distintas — el mismo problema que ya resolvió el picker de
«Paquete ya declarado…» para los paquetes sueltos, sin resolverlo para la capacidad completa.

## Decisión

### 1. Un botón en la tarjeta, y un paso intermedio antes de mandar

«Llevar al cubicador» abre un modal que muestra **lo que se va a mandar, línea por línea**, cada
una tildable. No es ceremonia: la capacidad son cuatro fuentes y casi nunca se quieren las cuatro
—«lo que todavía no llegó» rara vez entra en la hoja de hoy—, y dos de ellas vienen en unidades
distintas. Verlo antes evita la pregunta de después: *¿por qué el bloque dice 4.787 y la tarjeta
decía 2.681?*

### 2. Cada fuente viaja con el tipo de bloque que le corresponde

| Fuente de la capacidad | Bloque | Por qué |
|---|---|---|
| Trozas en el patio · Por recepcionar | `rolliza`, un renglón **por especie** | Es troza: el % la convierte. Por especie, porque el reparto cruza cada bloque con la aserrada de su misma madera |
| Apartado en lotes, sin aserrar | `rolliza`, uno por lote | Sigue siendo troza aunque ya tenga lote |
| Lo que los lotes admiten | `aserrada`, uno por lote | Ya es el margen del 56 % de lo consumido: está en unidades de aserrada |
| Productos terminados | `aserrada`, uno por corrida | Salió de la sierra; su m³ **es** lo amparado |

**Mandar producto terminado como rolliza le aplicaría el rendimiento por segunda vez** y ensuciaría
el de la sierra con madera que la sierra ya cortó (misma regla que el bloque de aserrada directa).

### 3. El % del bloque es el de la tarjeta, no el default del cubicador

Los bloques de rolliza nacen con `aprovechablePct = 56` (`RENDIMIENTO_META`), no con el 55 % que el
cubicador usa por defecto. Si no, el «ampara» de allá no coincidiría con el «→ al 56 %» que el
operario acaba de leer acá, y no habría forma de saber cuál de los dos números vale.

### 4. Sólo lo filtrado, leído por las mismas funciones que dibujan la tarjeta

`bloquesDesdeCapacidad()` arma los candidatos con `trozasDeFuente`, `lotesDeFuente` y
`corridasDeFuente` — las mismas que alimentan el balance. No hay una segunda lectura del patio que
pueda divergir: lo que viaja es lo que se está mirando.

Y se conserva la regla de la mezcla: una corrida (o un lote) con **dos títulos adentro** no entra
bajo un permiso filtrado. Repartirla sería inventar de qué permiso salió cada tablón.

### 5. El traspaso va por `localStorage`, no por la URL ni por el servidor

La hoja de rolliza del cubicador **ya vive en `localStorage`** (`buleje-cubicacion-{slug}-rolliza`):
es un borrador de trabajo, se edita todo el día y recién al final se guarda como distribución con
nombre. Sembrar ahí es escribir en el mismo lugar donde el operario iba a tipear.

`sembrarBloques()` centraliza ese guardado —lo usaba ya «Resumen por permiso» con su propia copia—
con dos reglas: **suma, nunca reemplaza** (sembrar desde otra pantalla no puede borrar lo que
alguien acaba de cargar a mano) y **no siembra dos veces lo mismo** (huella por `paqueteId`, o por
`etiqueta::especie` cuando no hay ref).

⛔ **No descuenta, no reserva y no marca nada en el Libro.** La distribución es un papel de
respaldo, no un movimiento: elegir madera acá no la despacha ni la marca usada.

### 6. Resúmenes entra aunque todavía no haya lote cubicado

Con bloques cargados y sin madera aserrada, la pantalla mostraba «Todavía no hay lote cubicado» y
la madera recién mandada quedaba guardada pero **invisible**. Ahora entra igual, con la
distribución sola y diciendo cuál es el paso que falta (cubicar lo aserrado). Es el flujo normal
del pedido: primero se manda el saldo, después se mide.

## Consecuencias

- Un volumen declarado en el Libro llega al papel de respaldo **sin pasar por el teclado**.
- Aparece un acoplamiento entre dos módulos a través de una clave de `localStorage`. Es el que ya
  existía; ahora está en un solo archivo (`lib/forestal/sembrar-reparto.ts`) y no en dos copias.
- El traspaso es **por dispositivo**: quien manda la madera y quien la reparte tienen que ser el
  mismo navegador. Si algún día hace falta cruzar equipos, el lugar es la distribución guardada en
  el servidor, no esta clave.
- Un bug viejo que se llevó puesto: el salto de pestaña (`TOOL_ONCE_KEY`) se consumía dentro del
  initializer de `useState`, que React invoca dos veces en desarrollo — la primera lectura borraba
  la clave y el estado que quedaba era el de la segunda. El salto de «Resumen por permiso» tampoco
  funcionaba en dev. Ahora se consume en un efecto.

## Alternativas

- **Mandar sólo el total de la tarjeta.** Un número redondo sin especie ni permiso: el reparto no
  puede cruzarlo con la aserrada de su madera, y el papel pierde de dónde salió cada bloque.
- **Pasarlo por la URL.** Cabe un número, no doce líneas con especie, permiso y tipo; y el
  cubicador tendría que aprender un formato nuevo que sólo usa esta pantalla.
- **Guardarlo en el servidor como distribución.** Es lo correcto para el papel FIRMADO, no para un
  borrador que todavía se va a editar entero. Sigue disponible: el botón «Guardar» de la
  distribución ya hace exactamente eso.
