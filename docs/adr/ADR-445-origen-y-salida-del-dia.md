# ADR-445 — Origen y salida de cada día de producción; la cubicación que completa un día por tipo

- **Fecha:** 2026-09-27
- **Estado:** aceptado (backend implementado; la pantalla va en paralelo)
- **Pedido por:** Brandon (27-09): «En producir sin lote, en los días de registro: identificar cuál viene de cubicación (pieza por pieza) y cuál de producción con los m³ por tipo (sin piezas); a los de sin piezas poder agregarles la cubicación para complementar/vincular a los m³ aserrados; definir cuáles días se despacharon, cuáles no y a qué guía pertenecen.»
- **Depende de:** ADR-134/135 (I3-I5, atribución despacho → corrida) · ADR-316 (saldo de una corrida, una sola fuente) · ADR-349 (paquetes) · ADR-363 (salida de trozas) · ADR-368/369 (cubicación ligada a corridas) · ADR-401 (completar ≠ corregir) · ADR-418 (reservas) · ADR-444 (un paquete, una guía).

## Contexto (medido el 27-09 en Blas con `BEGIN READ ONLY`, y en `main`)

El libro no guarda de dónde salió el volumen de una corrida. Lo que sí guarda cada paquete es su escuadría (`espesorCm`, `anchoCm`, `largoM`) y su m³. Un paquete que viene del cubicador tiene una escuadría que **explica** su m³; uno declarado por tipo no la tiene, o tiene una de muestra que no la explica.

| Blas, 17 días con producción | Días | m³ |
|---|---|---|
| Cubicados pieza por pieza | 8 | 56,56 |
| Por tipo (sin piezas) | 9 | 98,57 (63,5 %) |
| Mixtos | 0 | — |

| Salida de esos 17 días | Días | m³ |
|---|---|---|
| Sin salida | 12 | 65,21 |
| Parcial (27/09: 12,5 de 13,254 en la GTF 19-00000-000001, paquete SL-680) | 1 | 13,25 |
| Sin guía (marcados «usado»: 01/08 inventario 76,564 + 28/08 + 29/08 + 30/08) | 4 | 76,66 |
| Despachados enteros | 0 | — |

- Los 669 paquetes de Blas con escuadría la explican (desvío máximo 0,97 %). En `main`, 3 de 12 no: PQ-001, PQ-0291 y **PQ-DIM-9427** (12 piezas de 2,5 × 20 × 2,8 = 0,168 m³ declaradas como 0,0336). «Tiene escuadría» no basta.
- El 01/08 son 5 corridas de inventario con 20 paquetes sin escuadría, 19 de ellos en **0 piezas**: el cuadre de una cubicación contra ese día daba un aviso de piezas por cada uno.
- El 29/08 es una corrida de **0,001 m³** (un litro): con una regla «lo cubicado llega al declarado − 10 L» salía «cubicada» sin tener un solo paquete medido.
- Reprocesos vivos en Blas: 0. Reservas vivas: 0. Cubicaciones guardadas: 3, ninguna ligada.
- Los paquetes «55»…«72» de Blas comparten código con 18 trozas (ADR-444): el código suelto no dice qué paquete salió.
- Cubicaciones (KV `ctp-cubicaciones:<tenant>`): el guardado era `get` (con caché de 5 min) + `set` sin lock; el tope de 300 descartaba la más vieja aunque estuviera ligada; re-guardar desde el cubicador (que no manda corridas) **borraba** el vínculo; `?despachoId=` sólo miraba `ctpEntryId` (la primera corrida); y los `ctpEntryIds` no se validaban (cualquier id, de cualquier negocio).

## Decisión

Origen y salida se **derivan al leer**, sin columnas nuevas. Contrato y lógica pura: `lib/forestal/origen-y-salida-del-dia.ts`.

1. **Paquete cubicado** = piezas, espesor, ancho y largo > 0, y `|piezas × e × a × l / 10⁴ − volumenM3| ≤ máx(0,01 m³; 2 %)`.
2. **Corrida:** `por_declarar` (sin cantidad y sin paquetes) · `por_tipo` (ningún paquete cubicado) · `cubicada` (lo cubicado ≥ declarado − 0,01 m³ **y** al menos un paquete cubicado) · `parcial` (lo demás).
3. **Día** (las `por_declarar` no votan): todas cubicadas → `cubicado`; todas por tipo → `por_tipo`; lo demás → `mixto`; sólo por declarar → `por_declarar`.
4. **Salida de una corrida:** despachado y reprocesado salen de `saldosDeCorridas` (la única fuente, ADR-316); lo que queda es `declarado − despachado − reprocesado` y va a **sin guía** si la corrida está marcada «usado», si no a **en patio**. Cuadre: `despachado + reprocesado + sin guía + en patio = declarado` (mientras el libro cumpla I3/I5). Estado: nada salió → `sin_salida`; queda más de 10 L → `parcial`; no queda y algo salió sin guía → `sin_guia`; si no → `despachado`. Un borrador (sin N° de GTF) cuenta como guía (ADR-444) y viaja con `gtfNumber: null`. Una corrida reprocesada entera sale del patio por el libro: `despachado`, con el monto en `m3Reprocesado`.
5. **Qué paquete va en qué guía** se lee de las salidas **de esa corrida**: el `codigoProducto` de la línea de despacho nombra un paquete sólo si esa línea cita a la corrida como origen, el código es de un paquete de la corrida y la línea no es una salida de trozas (`_count.trozasDespachadas > 0`). Nunca buscando el código suelto.
6. **Cubicaciones ligadas:** las de la corrida o del día (`ctpEntryIds` ∪ `ctpEntryId`, `corridasDeCubicacion`). `m3ConCubicacion` suma sólo las que son **únicamente de ese día**; una que ampara un camión de varios días se lista (`soloEsteDia: false`) pero su m³ no se reparte a ojo. Ligar una cubicación **no toca** `quantity` ni los paquetes (ADR-401: completar ≠ corregir); el origen de la corrida sigue saliendo de sus paquetes.
7. **Lectura:** `GET /api/admin/forestal/ctp?jornadas=1` agrega `origenYSalida` a cada día de producción; `?resumenJornadas=1&paquetes=1` lo agrega a cada corrida del detalle. Sin rutas nuevas, mismos roles. Por pedido: UNA consulta de corridas con salidas vigentes, reservas y paquetes anidados + `saldosDeCorridas` + UNA lectura del KV. El origen del detalle se arma sobre el día entero, antes de filtrar por dueño.
8. **Guardar una cubicación** (`ForestCubicacionesDB.save`): leer-modificar-escribir bajo `pg_advisory_xact_lock` por clave (`PlatformSettingsDB.actualizar`, lee de la base y no del caché). Las corridas pedidas se **suman** a las que ya tenía; sin corridas en el pedido se conservan. Las nuevas tienen que existir, ser del tenant (en el WHERE), de producción y vivas; si no → `422 vinculo_invalido`. El tope de 300 descarta las sueltas más viejas, nunca una ligada **ni la recién guardada** (si no hay suelta que sacar, la lista supera el tope: el 201 dice la verdad). Si el pedido trae el `updatedAt` que la pantalla leyó y la guardada ya es otra → `409 cubicacion_desactualizada` en vez de reescribir piezas viejas.
   - **Caché:** `PlatformSettingsDB.get` cachea 5 min en la memoria de CADA instancia; con `REDIS_URL` también (`RedisStore` sirve primero su capa en memoria e `invalidate` sólo limpia la instancia que escribió). Por eso las cubicaciones se leen SIEMPRE de la base (`getFresco`, una fila por PK): la lista del historial, la de «Vincular» (que reenvía la cubicación entera) y la del origen de los días. Lo que sigue en `get` cacheado —otras claves de configuración— puede verse hasta 5 min viejo en otra instancia; es una limitación conocida del KV, no de este ADR.
9. **Cuadre de una cubicación contra filas del libro** (`cuadrarConjunto`): además de por especie, por **especie y tipo** (`porTipo`) cuando todas las filas de la especie dicen su tipo en el producto; lo que no cierra por tipo es un aviso (nunca error). Una fila con 0 piezas es **sin dato**: el grupo no compara piezas (`piezasSinDato`).

## Consecuencias

- La tira de la semana hace dos lecturas más (saldo y KV) y trae salidas y reservas anidadas; el detalle del día, lo mismo. Medido en `main`: 0,90 s la semana, 0,91 s dos días con paquetes (servidor de desarrollo caliente).
- En `main` el 08/08 muestra el dato viejo de QA: PQ-0290 va en 3 guías (anterior a ADR-444). La pantalla lo muestra tal cual.
- El guardado de cubicaciones suma una transacción con lock. Cuatro guardados simultáneos en `main` quedaron los cuatro.
- Quitar una corrida de una cubicación no tiene camino todavía (las corridas sólo se suman).
- El 409 por versión sólo protege si el cliente manda `updatedAt` (hoy «Vincular» no lo manda; es opcional para no romper el cubicador).
- *Corrección tras la revisión (27-09):* «0 piezas = sin dato» se aplicaba también a una especie o tipo que NADIE declaró, y una pieza de ≤ 10 L de esa especie pasaba de error a «ok». Sin filas, las piezas se comparan contra 0 (`__tests__/forestal-refuta445-cuadre.test.ts`). Y el tope podía descartar la recién guardada con un 201 (`forestal-refuta445-tope.test.ts`).

## Alternativas descartadas

- **Tabla hija `ForestCtpPaqueteMedida`** con la pieza por pieza: migración con datos, y el paquete ya ES una línea del cubicado (una escuadría con sus piezas, medido en Blas); duplicarla es una segunda verdad que se desincroniza al editar.
- **Partir los paquetes** para completar un día por tipo con la cubicación: SL-680 ya va en la GTF 19-00000-000001; partir un paquete citado por una guía corrige el libro por debajo del acta (ADR-401).
- **Columna de origen en la corrida** (`origen = cubicada | por_tipo`): se escribe al declarar y no ve lo que se completa después (una cubicación ligada, un paquete dimensionado); derivarlo al leer no se desincroniza.
- **Versión optimista en el KV** en vez del lock: el KV es un JSON sin columna de versión; el advisory lock ya es el patrón del libro (numeraciones) y no pide migración.

## Referencias

Código: `lib/forestal/origen-y-salida-del-dia.ts`, `lib/forestal/detalle-de-jornada.ts` (`jornadasDesdeFilas`), `lib/forestal/piezas-del-dia.ts` (`conOrigenYSalida`), `lib/db/forest-ctp.db.ts` (`jornadasDeProduccion`, `jornadasConPaquetes`, `datosDeOrigenYSalida`), `lib/db/forest-cubicaciones.db.ts`, `lib/db/platform-settings.db.ts` (`actualizar`), `lib/forestal/cubicacion-registro.ts` (`corridasDeCubicacion`), `lib/forestal/cubicacion-cuadre.ts`, `app/api/admin/forestal/cubicaciones/route.ts`. Tests: `__tests__/forestal-origen-y-salida-del-dia.test.ts`, `__tests__/forestal-cubicaciones-vinculo.test.ts`, `__tests__/forestal-cubicacion-cuadre.test.ts`.
