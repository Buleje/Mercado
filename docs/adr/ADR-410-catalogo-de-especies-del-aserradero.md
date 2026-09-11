# ADR-410 — El catálogo de especies lo arma el aserradero

- **Fecha:** 2026-09-10
- **Estado:** aceptado
- **Pedido por:** Brandon — «en el modal de producir sin lote, cubicar madera, que se ponga para poder
  crear especie, quitarlas, modificarlas y guardarse esa información».
- **Depende de:** ADR-314 (catálogos del negocio) · ADR-409 (producción sin lote con permiso)

## Contexto

La lista de especies del cubicador era `ESPECIES_MADERA`: catorce nombres de la Selva Central en una
constante del código, iguales para todos los tenants. El que trabaja **cumala blanca** o **sapotillo**
no las encontraba y las tipeaba a mano cada vez — y cada quien las escribía distinto. De ahí salen
las dos filas «Tornillo» y «TORNILLO» que después hay que reconciliar con `claveEspecie` en cinco
lugares del libro.

Una lista de catálogo que sólo se cambia con un deploy no es un catálogo: es una decisión nuestra
sobre qué madera puede aserrar un cliente.

## Decisión

### 1. Catálogo por tenant en KV, no tabla nueva

`PlatformSetting` con clave `ctp-especies-catalogo:{tenantId}` — el mismo criterio que la biblioteca
de fotos de especies y que trámites (ADR-308 §4): son decenas de nombres por planta, no miles.
Promoverlo a modelo Prisma el día que haga falta (sinónimos, CITES por especie, aprobación) es leer
el KV e insertar filas; hoy sería una migración que necesita `DIRECT_URL` para guardar catorce
strings.

### 2. Las de fábrica se OCULTAN, no se borran

```
lista = (fábrica − ocultas) + agregadas
```

El código es el mismo para todos los tenants: lo que cambia es qué ofrece ESTA planta. Ocultar es
reversible y la pantalla ofrece devolverlas.

**Editar una de fábrica la vuelve propia** (se oculta la original y se agrega la nueva), y la
pantalla lo dice. Hacerlo en silencio daría a entender que se cambió algo global.

Si una propia comparte clave con una de fábrica, **manda la propia**: es la forma de corregir la
ortografía o el nombre local sin perder lo que trae el sistema. Y al quitarla, la de fábrica vuelve
sola — quitar lo propio no puede dejar un hueco donde había algo.

### 3. Lo que el catálogo NO toca

**No reescribe lo ya cubicado ni lo ya declarado.** Cada pieza guarda el nombre con el que se cargó;
renombrar la especie cambia lo que se ofrece de acá en adelante, nada más. Reescribir hacia atrás
sería editar en silencio lo que dice un acta que se declara ante SERFOR.

### 4. Una sola lista para el selector, la tabla y el dictado

`useEspeciesCatalogo` alimenta los tres. El reconocedor de voz la lee por `ref` (el closure
capturaría una lista vieja): si el dictado usara la constante, reconocería especies que el selector
ya no ofrece, y al revés — una especie recién creada no se podría dictar.

Mientras carga, y si el pedido falla, se ofrecen las de fábrica: quedarse sin especies porque el
catálogo no respondió sería peor que no poder editarlo.

### 5. Se edita donde se usa

El gestor se abre desde el propio cubicador, al lado del selector de especie. Mandar a otra pantalla
a dar de alta una especie en medio de una carga es perder la carga.

## Consecuencias

- Las escrituras se auditan (`ctp_especie_catalogo` / `ForestEspecieCatalogo`): la especie es lo que
  el libro declara ante SERFOR, y quién cambió la lista tiene que poder saberse.
- El catálogo es **por tenant y compartido entre sus usuarios**: lo que agrega el cajero lo ve el
  almacenero. Es lo que se quiere de un catálogo, y hay que decirlo en la pantalla.
- Los rechazos por regla del catálogo (nombre vacío, especie repetida) viajan como **422 con el
  motivo tal cual**: están escritos para quien está cargando, no para un log.
- ~~Quedan usando la constante los lugares que todavía no pasaron por acá (`CubicadorTrozas`,
  `ResumenReparto`, el import de Excel).~~ **Cerrado el 2026-09-11** — ver «Alcance: todas las
  pantallas donde se escribe una especie», abajo.

## Alternativas

- **`localStorage` por navegador.** Se pierde al cambiar de equipo y no lo comparte el equipo de
  trabajo: el mismo aserradero tendría dos catálogos según quién cargue.
- **Tabla Prisma `ForestEspecie`.** Correcta el día que la especie tenga atributos propios
  (CITES, densidad, equivalencias). Hoy es un nombre y una migración de más.
- **Dejar el campo libre sin catálogo.** Es lo que ya pasaba, y es de donde salen «Tornillo» y
  «TORNILLO» como dos especies distintas en el mismo libro.

---

## Alcance: todas las pantallas donde se escribe una especie (2026-09-11)

Pedido de Brandon: *«en modal de producir lote quiero que se pueda crear nuevas especies,
eliminarlas, editarlas — también en herramientas, en cubicador de madera»*. El catálogo existía a
medias: se editaba en el cubicador de aserrada y **en ningún otro lado**. Quien daba de alta
«Cachimbo» la veía al cubicar y no al programar el lote de cachimbo — que es justo donde arranca la
corrida que lo declara.

La lista es una sola; lo que faltaba era una pieza compartida. Vive en
`components/admin/forestal/ctp-especie-campo.tsx`:

| Pieza | Qué es |
|---|---|
| `useEspeciesConCatalogo()` | Un solo pedido por pantalla: lista, `cientificoDe()`, `abrir()` y el modal listo para dibujar. **Nunca uno por fila** — en una grilla de veinte filas serían veinte pedidos de la misma lista. |
| `CtpEspecieSelect` | El selector, con el engranaje del catálogo pegado. Agrupa «En el patio» (lo que la pantalla ya ofrecía, con su stock) y «Del catálogo». |
| `CtpEspecieInput` | La versión escribible (input + datalist), donde la especie puede ser una que ninguna lista tiene todavía. |
| `CtpEspeciesBoton` | El botón con nombre, para las barras de herramientas. |

Pantallas migradas: `CtpLoteArmarModal` (programar el lote, en sus dos modos) · `CtpLoteDetalleModal`
(editar el lote) · `CtpCubicarProductoModal` (cubicar lo que salió) · `CubicadorTrozas` (rolliza, con
el mismo patrón de *ref* para el dictado) · `ResumenReparto` (la especie de cada bloque) ·
`CtpProduccionImportModal` (la especie del turno pegado).

Tres reglas que la pieza fija, porque cada una fue un bug posible:

1. **Lo ya guardado nunca desaparece del selector.** Si un lote dice «Moena amarilla» y hoy el
   catálogo no la ofrece, la opción se agrega igual: si no, el `<select>` abriría vacío y el primer
   guardado borraría la especie sin que nadie lo pidiera.
2. **El catálogo no pisa lo que hay en el patio.** Donde las opciones salen de la madera existente,
   esas van primero con su stock. Elegir una del catálogo sin stock se puede —la guía llega mañana—
   y el pie del modal lo dice en vez de callarlo.
3. **El nombre científico viaja con la especie.** Al elegir una que el catálogo conoce, el campo
   científico del lote se completa solo **si está vacío**: es la columna que el LO-CTP exige y nunca
   pisa lo que el operador escribió.

Y el botón dejó de esconderse: el engranaje pegado al selector se ve recién cuando ya se está
buscando la especie, así que el cubicador (madera y trozas), los Resúmenes y el modal de cubicar
tienen además un **«Especies»** con todas las letras en su barra de herramientas.

---

## El catálogo se llena solo, y dice cuándo el libro se contradice (2026-09-11)

Con el catálogo ya en todas las pantallas quedaba el problema de arranque: **empieza vacío y la
planta lleva media temporada cargando**. Medido en el tenant real el mismo día: el libro usaba
**10 especies que el catálogo no ofrecía** —Ana Caspi, Azucar huayo, Cachimbo (16 filas), Copal,
Huayruro, Mashonaste, Panguana (9), Pashaco, Shimbillo, Yacuchapana— ninguna de las catorce de
fábrica. Pedirle a Brandon que las tipee de nuevo es pedirle el trabajo dos veces.

`GET …/especies?libro=1` agrupa por clave normalizada lo que nombran las cuatro tablas que escriben
una especie (`WoodEntry`, `WoodEntryTroza`, `ForestCtpEntry`, `ForestLoteAserrio`) y responde dos
listas. El cálculo es puro (`resumirEspeciesDelLibro`) y con tests; la consulta va **aparte del GET
normal** porque son cuatro `groupBy` y un `<select>` de especie no los necesita para dibujarse.

**1 · Sembrar.** «Tu libro ya usa N especies que no están en la lista» → un botón las da de alta
todas, con el nombre científico que el propio libro ya traía. Se aplican una por una sobre el
catálogo en memoria y se guarda al final: la segunda ve a la primera, y el tope y los repetidos se
respetan igual que agregando a mano. Lo rechazado no aborta el resto — sembrar 9 de 11 diciendo por
qué es mejor que no sembrar ninguna.

**2 · Unificar.** Para el libro, «Tornillo» y «TORNILLO» **son dos maderas**: se separan en los
totales por especie y en el saldo por permiso. En el tenant real eran 125 filas contra 10. El gestor
las muestra juntas con su reparto y deja elegir una. Como esto **reescribe filas de un acta que se
declara ante SERFOR**:

- no es automático — dos clics, el segundo dice exactamente qué va a pasar;
- el cuerpo del POST lleva `confirmar: true`, para que un pedido suelto no pueda hacerlo de costado;
- sólo reemplaza las grafías EXACTAS que el resumen encontró bajo la misma clave, nunca por
  aproximación, y la forma elegida tiene que ser la misma especie (si no, el libro pasaría a
  declarar una madera distinta de la que entró);
- no toca volúmenes, fechas ni atribuciones, y queda auditado (`ctp_especie_unificar`) con el conteo
  por tabla y las formas reemplazadas.

**3 · El científico deja de depender de la memoria.** `cientificoDeEspecie()` resuelve primero por
el catálogo de la planta y después por `data/forestry-species.ts` (las 18 de SERFOR con su CITES).
Con eso: el picker del alta de ingreso ofrece las especies propias como cualquier otra, editar un
ingreso o un lote completa el binomio al salir del campo —sólo si estaba vacío—, y **el asiento que
nace sin científico lo toma del catálogo en `ForestCtpDB.create`**, antes de la transacción. El
CITES nunca se deduce del catálogo local: es un dato legal, no una preferencia de la planta.

**4 · Las fotos y el catálogo son la misma lista.** «Fotos de especies» armaba su lista trayendo
5.000 ingresos y todas las corridas para mirarles una columna; ahora sale del mismo endpoint, la
lista incluye las del catálogo todavía sin cargar madera, y el botón para crear o corregir una
especie está en esa pantalla.

Verificado contra el tenant real (sembrado de las 10, con el selector siguiendo el cambio) y la
unificación end-to-end en un tenant QA con dos lotes de prueba: `TORNILLO` → `Tornillo`, una fila
reescrita, duplicados en cero, y los lotes de prueba borrados después.

---

## La grafía se canoniza al escribir, y ninguna lista la parte en dos (2026-09-11)

Unificar arregla lo viejo; lo que hacía falta era que no volviera a pasar. Tres cambios:

**Al ESCRIBIR, la especie se guarda como la escribe esta planta.**
`ForestEspeciesDB.resolverEspecie()` resuelve la grafía —y el binomio— contra el catálogo, y lo
usan `WoodEntriesDB.create` y `ForestCtpDB.create` antes de su transacción (es un KV cacheado, no
estira el lock). Una guía que dice «TORNILLO» y un lote que dice «Tornillo» entran al libro escritos
igual. Es **hacia adelante y sólo sobre la grafía**: la clave normalizada tiene que ser la misma, así
que nunca cambia de especie, y no toca nada de lo ya cargado. Si el catálogo no conoce la especie,
se guarda tal cual vino — el libro admite una especie que la lista todavía no tiene.

**Al LEER, las listas agrupan por clave.** `facetasDeSeccion` y los saldos ya lo hacían
(`speciesKey`); faltaban dos, y eran las que más duelen:

| Dónde | Qué pasaba |
|---|---|
| `opcionesDePatio` / `facetasDePatio` | El autofiltro del patio ofrecía «Tornillo» y «TORNILLO» como dos columnas, con la pila partida |
| `disponiblePorEspecie` (armar lote) | Ofrecía dos especies con la mitad del stock cada una — el lote nacía con la mitad de la madera que hay |

Ahora las dos agrupan por `claveEspecie` y muestran la grafía con más piezas detrás
(`grafiaPreferida`, con el desempate a favor del nombre propio). El filtro ya comparaba
normalizado, así que elegir la opción sigue trayendo las escritas distinto.

**Y el binomio dejó de faltar por pereza nuestra:** `especiesDeFabrica()` toma el científico de
`data/forestry-species.ts` (datos de SERFOR), así que las de fábrica ya no aparecen vacías. Para las
que quedan, el gestor tiene un bloque «N especies sin nombre científico», ordenado por cuánto las
usa el libro: primero la de 125 asientos, no la que se cargó por las dudas.

En el tenant real eso dejó **1 especie sin binomio** (Copaiba, que en Perú se declara como
*Copaifera paupera* o *C. officinalis* según el árbol — la elige el CTP, no el sistema).

La biblioteca de fotos ordena igual: las que más entran primero, con el número de filas al lado.

---

## El libro avisa, el papel se completa, y el LO-TH se queda con su plan (2026-09-11)

**Un chequeo más en Cumplimiento.** «N especies están escritas de más de una forma», con el reparto
(«TORNILLO» 125 vs «Tornillo» 10) y un botón que abre el catálogo ahí mismo — la advertencia y donde
se arregla, en la misma pantalla. Es **advertencia, no bloqueo, y no toca el score**: escribir una
especie de dos formas no incumple ninguna norma, pero parte los totales por especie y el saldo por
permiso, que es lo que un fiscalizador cruza. El score sigue saliendo de `CATEGORIAS_QUE_RESTAN`,
intacto.

> ⚠️ El hook del catálogo va **arriba de los `return` tempranos** del panel (carga y error). Puesto
> abajo, React cambia la cantidad de hooks entre renders: *«Rendered more hooks than during the
> previous render»* y pantalla en blanco. Lo atrapó el navegador — `tsc` y `lint` lo dan por bueno.

**El binomio llega al papel.** `lineasDeGuia` y `despachoDeGuia` aceptan un resolvedor opcional, y la
guía de salida y el Anexo 04 le pasan el catálogo: si el asiento viejo no trae el nombre científico,
el casillero (37) sale completo igual. No se inventa nada — sin catálogo queda vacío, que es la regla
del módulo.

**El LO-TH NO comparte el catálogo, y es a propósito.** En el CTP manda lo que el aserradero
trabaja; en el LO-TH manda lo que la resolución **autoriza**. Ofrecer ahí el catálogo del aserradero
sería ofrecer una infracción —para eso están el aviso de «fuera del plan» y el guard T7 al
despachar—. Lo que sí faltaba era lo contrario: el picker del LO-TH ahora ofrece **las especies del
propio plan**, primero y con su binomio (antes, si la resolución autorizaba «Panguana», había que
elegir «Otro» y tipearla con su nombre científico de memoria). Del catálogo del aserradero toma una
sola cosa: el binomio de una especie tipeada a mano, que es un dato de la especie y no un permiso.

### Dónde vive el aviso (y dónde NO)

El pedido fue «llevalo también al chip de salud y a la banda de pendientes». La banda sí: una
especie escrita de dos formas **pide trabajo** (hay que elegir cuál queda), así que es deuda y va
como pastilla accionable en `BarraDeuda` de Producción, sólo cuando es > 0, y al tocarla abre el
catálogo.

El chip de salud **no**, y es la regla de [[deuda-no-es-indicador]] aplicada: el chip dice el score
de cumplimiento SERFOR, que esto no mueve —escribir «TORNILLO» no incumple ninguna norma—. Sumarlo
ahí sería el mismo concepto en tres lugares (chip + verificación + pastilla), que es exactamente el
vicio del que salió `BarraDeuda`. Quedan dos superficies con papeles distintos: la **pastilla** en
Producción, donde se trabaja; la **verificación** en Cumplimiento, que se mira antes de cerrar el
período.
