# ADR-318 — Fletes: el viaje también cuesta

- **Fecha:** 2026-07-31
- **Estado:** aceptado
- **Contexto:** costo de materia prima (ADR-134) · directorio forestal (ADR-317) · port de `~/proyectos/appforestal` (`ingresos-camiones`)
- **Relacionado:** ADR-317 (de ahí salen la placa, el transportista y el proveedor)

## El problema

En un aserradero de selva el transporte es el segundo costo después de la madera.
El libro registraba el costo de la materia prima (`WoodEntry.costoTotal`) pero no
el del viaje: quedaba en un cuaderno o en la cabeza del dueño. Dos preguntas
semanales no tenían respuesta:

- *¿cuánto me está saliendo el m³ traído?*
- *¿a qué transportista le debo y cuánto?*

AppForestal lo tenía en `localStorage` (`af_precio_flete_camiones`,
`af_terceros_registros`): se pierde al cambiar de máquina y no lo ve nadie más.

## La decisión

### 1. `ForestFlete`: una fila por viaje

Fecha, tipo (trajo materia prima / se llevó producto), guía que lo amparó,
vehículo, transportista, conductor, proveedor, m³ movidos, monto, quién paga y
si está pagado.

### 2. Sin monto → `null`, nunca `0`

La misma regla del costeo (ADR-134), y acá importa igual:

> un flete sin precio **no es un flete gratis**, es un flete que todavía no se
> cerró.

Un `0` bajaría el S//m³ del período — la dirección más peligrosa en la que puede
mentir un número que se usa para negociar el próximo viaje. Los promedios se
calculan sólo sobre lo que tiene monto y la UI muestra **cuántos quedaron
afuera** (KPI "Sin monto").

### 3. El S//m³ es ponderado, no promedio de promedios

Un viaje de 1 m³ a S/ 500 no puede pesar lo mismo que uno de 30 m³ a S/ 3000.
`resumirFletes` acumula monto y volumen y divide al final: `3500/31 = 112.90`, no
`(500 + 100)/2 = 300`. Hay un test que fija exactamente ese caso.

### 4. Snapshots además de los ids

La placa y el nombre del transportista se copian en la fila. No es
denormalización perezosa: **un viaje ocurrió**. Si el camión se da de baja o la
empresa cambia de razón social, el viaje de marzo siguió siendo el de la placa
que decía la guía. El id agrupa; el snapshot evita que lo agrupado mienta. Por
eso `porTransportista()` agrupa por id **o** por nombre: el transportista tipeado
a mano antes de existir en la libreta también tiene su fila.

### 5. Quién paga define qué significa el número

| `pagaQuien` | Qué es |
|---|---|
| `ctp` | Gasto: sale de la caja |
| `proveedor` | Se le **descuenta** al liquidarle su madera |
| `destinatario` | Lo asume quien recibe |

De ahí salen las dos vistas de cuentas: *Por transportista* ("a quién le debo") y
*A cargo del proveedor* ("qué le descuento").

## Lo que este ADR NO hace

**No toca el costeo del libro.** `WoodEntry.costoTotal` sigue siendo el costo de
materia prima y el margen (ADR-141) se calcula igual que antes. Sumar el flete al
costo *puesto en planta* cambia el COGS de cada despacho y el margen histórico:
es un paso posterior, explícito y con su propio ADR — no un efecto colateral de
haber empezado a anotar viajes.

Tampoco cierra la **liquidación completa** al proveedor (valor de su madera −
fletes − adelantos): para eso falta ligar el ingreso al proveedor por id, que hoy
es `providerName` en texto. Lo que sí queda es el lado de los descuentos.

## Consecuencias

- Vista nueva **Gestión → Fletes** (tecla `j`) con 4 KPIs y 3 pestañas.
- Baja lógica: un viaje borrado sigue habiendo ocurrido.
- Fechas date-only en UTC, como el resto del libro (si no, el viaje del día 1 se
  muestra el 31 en Lima).
- La placa se normaliza igual que en el directorio: sin eso, `b9x-777` y `B9X777`
  parten la agrupación en dos camiones.

## Addendum (2026-08-20): la guía ya trae el viaje

Brandon: "cada guía que ingresa ya tiene volumen y transportista, conductor —
quiero que se clasifique [por fletero], sin volver a tipearlo, y que diga si es
propio o flete."

### 6. `tipoTransporte`: mismo vocabulario que la GTF de salida

Campo nuevo `tipoTransporte: "privado" | "publico"` (default `"privado"`,
migración `318b-forest-flete-tipo-transporte.sql`, idempotente). No se inventó
un vocabulario nuevo: es el mismo par `privado`/`publico` que ya vive en
`gtfDatos.vehiculo.tipoTransporte` (ADR-336) para la GTF de salida — un solo par
de palabras para "¿es tu camión o le pagás a alguien?" en toda la app.
`privado` = vehículo propio, no genera deuda con un tercero. `publico` = flete
de tercero, es el que se le paga. También se agregó `conductorNombre` (snapshot,
mismo criterio que `transportistaNombre`: el directorio puede cambiar, el viaje
ya ocurrió con ese conductor).

### 7. La guía de ingreso YA es un borrador de flete

La GTF de ingreso guarda transportista/placa/conductor en `gtfDatos` desde
ADR-336. `candidatoDesdeIngreso()` (`lib/forestal/fletes.ts`, pura) traduce ese
bloque a un `CandidatoFlete` — un viaje propuesto, no un `Flete`: le falta el
monto y no se guardó todavía. `null` si la guía no trae ni transportista ni
placa (proponer un viaje vacío no ahorra nada). `ForestFleteDB.candidatosSinAnotar()`
filtra las guías vigentes del período que **no** tengan ya un `ForestFlete` con
ese `gtfNumber` — anotar dos veces el mismo viaje inflaría la deuda.

La vista (`CtpFletesView.tsx`) muestra esos candidatos en una bandeja
("Guías sin flete anotado") con botón **Anotar viaje** que abre
`CtpFleteModal` prellenado (`prellenado: CandidatoFlete`) — fecha, placa,
transportista, conductor, proveedor y volumen ya puestos; sólo falta confirmar
y cerrar el monto. Guardar saca a la guía de la bandeja (por `gtfNumber`, sin
tener que re-listar del servidor).

**Deliberadamente NO se tocó** `resumirFletes()`/`porTransportista()`/`porProveedor()`
— los 17 casos existentes siguen intactos; los campos nuevos son aditivos al
tipo `Flete` y `candidatoDesdeIngreso()` es una función nueva y separada.

### 8. La bandeja agrupa, filtra y anota en bloque; el prellenado matchea el Directorio

Mismo día, ronda 2: `CtpFletesCandidatosBanner.tsx` agrupa los candidatos por
`transportistaNombre` (con filtro por texto cuando hay más de un fletero) y
ofrece **"Anotar las N"** — no es un formulario de bulk-entry (el monto de
cada viaje suele ser distinto), es una **cola que encadena el mismo modal**:
`CtpFleteModal` acepta un `onGuardado` opcional que, si viene, reemplaza a
`onClose` tras guardar con éxito, y el padre decide si hay un siguiente
candidato o si cierra. El `key` del modal (`flete?.id ?? prellenado?.gtfNumber`)
fuerza un remount limpio entre ítems de la cola.

También se agregó `useAutoMatchDirectorio` (hook local en `CtpFleteModal.tsx`):
si el nombre prellenado desde la guía ya existe en el Directorio, completa el
id automáticamente (sólo campos vacíos, nunca pisa lo tipeado a mano). Gotcha
real de esta pieza: no gatear con `dir.cargando === false` — arranca en
`false` antes de que el propio hook dispare su fetch, así que hay que esperar
a que `dir.partes`/`dir.vehiculos` tengan algo real, no a que el flag baje.

### 9. La migración 318b: una sola fase, y la trampa del default

`318b` es **expand puro** — dos columnas aditivas y un índice, nada que
renombrar ni borrar — así que no necesita las tres fases de
`expand→migrate→contract`: el código viejo (que no conoce los campos) y el
nuevo conviven contra el mismo schema.

| Objeto | Forma | Por qué es seguro |
|---|---|---|
| `conductorNombre` | `TEXT NULL` | Aditiva; nadie la lee todavía si no existe. |
| `tipoTransporte` | `TEXT NOT NULL DEFAULT 'privado'` | `NOT NULL` **con** default: en PG11+ es metadata, no reescribe la tabla, y los `INSERT` del código viejo (que no manda la columna) siguen entrando. |
| `ForestFlete_tenantId_tipoTransporte_idx` | `CREATE INDEX IF NOT EXISTS` | No va `CONCURRENTLY` a propósito: la tabla es chica y `CONCURRENTLY` no corre dentro del bloque transaccional del script. Si algún día la tabla crece, esta línea se saca aparte. |

Se aplica con `scripts/apply-318b-migration.mjs` (DIRECT_URL con fallback al
pooler, como el resto del repo). Verificado en la DB: las 2 columnas y el
índice existen.

**El índice también va en `schema.prisma`** (`@@index([tenantId, tipoTransporte])`).
Crearlo sólo en SQL lo deja invisible para Prisma, y el próximo
`prisma migrate diff` lo propone para DROP — el `db:drift` del repo compara
columnas, no índices, así que ese drift no lo avisa nadie.

**Rollback:** `ALTER TABLE "ForestFlete" DROP COLUMN IF EXISTS "tipoTransporte", DROP COLUMN IF EXISTS "conductorNombre";`
+ sacar el `@@index` del schema. Sin pérdida de datos de negocio: ninguna de las
dos columnas es fuente de verdad de nada — el dato original sigue en `gtfDatos`
de la guía.

**La trampa a vigilar:** `privado` significa "no genera deuda con un tercero"
(así lo dice el hint del modal). Hoy eso es **sólo una etiqueta**:
`resumirFletes()`/`porTransportista()` ignoran `tipoTransporte` y suman todos
los viajes. El día que alguien filtre la deuda por `tipoTransporte === "publico"`,
cualquier fila que haya tomado el default en silencio desaparece de los totales
de plata. Por eso el apply script **cuenta y avisa** los viajes que quedaron en
`privado` teniendo transportista de tercero cargado, en vez de hacer un `UPDATE`
ciego: es una decisión de negocio, y el script se corre más de una vez (un
backfill automático le pisaría un `privado` puesto a mano). En esta DB el conteo
dio **0** — la tabla no tenía filas anteriores a la migración.

## Referencias

- `lib/forestal/fletes.ts` (puro) · `lib/db/forest-flete.db.ts` · `__tests__/forestal-fletes.test.ts` (17 casos).
- Addendum: `prisma/manual-migrations/318b-forest-flete-tipo-transporte.sql` ·
  `scripts/apply-318b-migration.mjs` (idempotente, avisa los `privado` sospechosos) ·
  `app/api/admin/forestal/fletes/route.ts` (`?candidatos=1`) ·
  `components/admin/forestal/CtpFleteModal.tsx` · `components/admin/forestal/CtpFletesView.tsx` ·
  `components/admin/forestal/CtpFletesCandidatosBanner.tsx` (bandeja agrupada + cola de "Anotar las N").
