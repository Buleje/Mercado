# ADR-421 — El contrato (permiso) como eje de todo el movimiento

- **Estado:** aceptado
- **Fecha:** 2026-09-18
- **Pedido de Brandon:** «al registrar gastos, ingresos, madera, adelantos, etc.,
  todo se trabaja según el contrato (creado puede ser Nombre de Dueño, Permiso,
  Resolución y otros) y ahí llevar el control hipervinculado […] y hacer una
  página donde se sacará el balance, resumen etc. de todo los movimientos de ese
  contrato: gastos, ingreso, madera, adelantos, deudas, créditos».

## Contexto — lo que ya existe (medido en el tenant real, 2026-09-18)

El contrato **ya es el eje de facto del negocio**, pero escrito como texto suelto
en cinco tablas distintas, sin entidad que lo represente:

| Dónde vive hoy | Campo | Códigos distintos | Filas |
|---|---|---|---|
| Ingresos de madera | `WoodEntry.originCode` | 3 | 24 |
| Producción | `ForestCtpEntry.originCode` | 4 | 8 |
| Lotes de aserrío | `ForestLoteAserrio.permiso` | 4 | 4 |
| Guías emitidas | `ForestGtf.tituloHabilitante` | 1 | 1 |
| Directorio de partes | `ForestParty.tituloHabilitante` | 1 | 1 |
| **Universo real** | | **8 contratos** | **38 filas** |

El más usado, `10-HUA-PUE/PER-FMP-2026-007`, ampara 21 ingresos y 135.587 m³.

**Lo que hoy SÍ se puede saber por contrato:** la madera. 197.6 m³ en 3 contratos.
**Lo que NO se puede atribuir a ninguno** (no existe dónde guardarlo):

| | Registros | Monto |
|---|---|---|
| Adelantos | 4 | **S/ 20 942.00** |
| Gastos (`Expense`) | 1 | S/ 20.00 |
| Fletes (`ForestFlete`) | 3 | — |
| Cuenta corriente (`ForestCuentaMov`) | 0 | — |

Es decir: **S/ 20 962 de plata real que nadie puede imputar a un permiso**. Y de
los 24 ingresos de madera, **0 están valorizados** (`costoTotal` vacío), así que
ni el lado del costo de la materia prima entra hoy en un balance.

Piezas que NO hay que volver a construir:

- **`ForestCuentaMov`** — cuenta corriente con `cargo`/`abono` y conceptos
  (adelanto · flete · aserrio_prestado · aserrio_recibido · pago · madera). Ya
  modela deudas y créditos, pero **por parte (`parteId`), no por contrato**.
- **`ForestPlan`** — tiene `planNumber`, `tituloHabilitante`, `resolucionNumber`,
  `titularName`, vigencia, estado y hasta costos por m³ (extracción,
  transformación, flete). Es el plan de manejo del Libro de Títulos Habilitantes.
- **`ForestParty`** — el directorio de dueños/proveedores/transportistas.
- **`ForestFlete`**, **`Adelanto*`**, **`Expense`**, **`WoodEntry.costoTotal`**.

## Decisión

### 1. Un modelo propio, `ForestContrato`, y no reusar `ForestPlan`

`ForestPlan` **parece** el lugar, pero los datos dicen que no:

- Tiene **1 solo registro** en el tenant (`PO-2026-001`), y su código
  (`17-CPO/C-J-045-26`) **no coincide con ninguno** de los 8 que la operación usa
  de verdad. Es un plan de prueba.
- `ForestPlan` modela **el plan de manejo propio** del Libro de Títulos
  Habilitantes: cuelga de una carátula, de un censo y de árboles. Los permisos
  con los que Brandon compra (`19-SEC/REG-PLT-…`) son **de terceros**: no hay
  censo propio ni carátula que les corresponda.
- Forzarlos dentro de `ForestPlan` mezclaría «lo que yo manejo» con «el papel que
  ampara la madera que compré» en la misma tabla, y el LOTH empezaría a listar
  permisos ajenos.

`ForestContrato` lleva un `planId` **opcional**: cuando el permiso sí es propio y
tiene su plan en el LOTH, quedan atados sin duplicar el dato.

### 2. La llave natural es el código del permiso, normalizado

El código ya está escrito 38 veces en los datos. `codigoNorm` (mayúsculas, sin
espacios repetidos) es único por tenant y es lo que permite **sembrar los
contratos desde el libro** en vez de pedirle a Brandon que los cargue a mano —
mismo criterio que el catálogo de especies, que se siembra de lo ya registrado.

### 3. `contratoId` como FK opcional en las seis tablas del movimiento

`WoodEntry` · `ForestCtpEntry` · `ForestLoteAserrio` · `Expense` ·
`Adelanto` · `ForestFlete` · `ForestCuentaMov`.

**Nullable a propósito** (fase expand): nada de lo ya cargado se rompe, y un
gasto que de verdad no pertenece a ningún contrato (la luz de la oficina) sigue
siendo válido sin contrato. El texto que ya existe (`originCode`, `permiso`,
`tituloHabilitante`) **no se borra**: sigue siendo lo que se declara ante SERFOR;
el `contratoId` es el vínculo interno.

### 4. El balance se calcula, no se guarda

Ningún saldo se materializa en una columna. El balance del contrato es una
consulta que suma, por `contratoId`:

| Bloque | De dónde sale | Signo |
|---|---|---|
| Madera recibida | `WoodEntry.costoTotal` (m³ de `volumeM3`) | egreso |
| Producción | `ForestCtpEntry` (m³ producidos, rendimiento) | informativo |
| Gastos | `Expense.amount` | egreso |
| Fletes | `ForestFlete` (costo del viaje) | egreso |
| Adelantos entregados | `Adelanto.montoAdelantado` | egreso |
| Saldo de adelantos | `Adelanto.saldoPendiente` | por cobrar |
| Cuenta corriente | `ForestCuentaMov` cargo/abono | deuda / crédito |

Guardar un saldo obliga a mantenerlo sincronizado desde siete lugares distintos;
la lección de `Adelanto.saldoPendiente` (mantenido por backend) es que cada
columna derivada es un bug esperando. El costo de recalcular es una query.

## Consecuencias

- Migración **expand**: 7 columnas nullable + índices `(tenantId, contratoId)`.
  Sin backfill destructivo: el sembrado desde los códigos existentes es un paso
  aparte, revisable, que Brandon confirma antes de aplicar.
- Toda DB class que escriba esas tablas acepta `contratoId` opcional; las que
  usan `select` explícito lo agregan (si no, la columna existe y nadie la lee).
- La página de balance es **solo lectura**: no mueve plata, la explica.
- Riesgo asumido: un contrato mal elegido al registrar ensucia el balance. Se
  mitiga con que el selector **sugiere** el contrato a partir del código que ya
  trae la guía, en vez de pedirlo en blanco.

## Alternativas descartadas

1. **Reusar `ForestPlan`** — descartada arriba con los datos: 1 registro, código
   que no matchea, y semántica de plan de manejo propio.
2. **Agrupar solo por el texto `originCode`** (sin entidad) — es lo que pasa hoy:
   no hay dónde poner dueño, resolución ni vigencia, un typo crea un contrato
   fantasma (`99-XXX/NO-EXISTE-2026-999` ya está en los datos) y gastos,
   adelantos y fletes siguen sin poder imputarse.
3. **Colgar la plata de la parte (`ForestParty`) en vez del contrato** — la
   cuenta corriente ya hace eso y no alcanza: el mismo dueño puede tener dos
   permisos, y el balance que Brandon pide es por papel, no por persona.

## Referencias

- `ADR-412` aserrío por encargo (cuenta corriente por parte)
- `ADR-135` costo de la madera (`WoodEntry.costoTotal`)
- `ADR-317`/`ADR-318` fletes y directorio
- `ADR-374` gastos con metadata en columnas
- Medición completa: este documento, sección Contexto
