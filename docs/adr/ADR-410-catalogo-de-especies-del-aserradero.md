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
- Quedan usando la constante los lugares que todavía no pasaron por acá (`CubicadorTrozas`,
  `ResumenReparto`, el import de Excel). Ven las de fábrica; migrarlos es pasarles la misma lista.

## Alternativas

- **`localStorage` por navegador.** Se pierde al cambiar de equipo y no lo comparte el equipo de
  trabajo: el mismo aserradero tendría dos catálogos según quién cargue.
- **Tabla Prisma `ForestEspecie`.** Correcta el día que la especie tenga atributos propios
  (CITES, densidad, equivalencias). Hoy es un nombre y una migración de más.
- **Dejar el campo libre sin catálogo.** Es lo que ya pasaba, y es de donde salen «Tornillo» y
  «TORNILLO» como dos especies distintas en el mismo libro.
