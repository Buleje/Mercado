# ADR-327 — El lote tiene una ventana de trabajo y un dueño

- **Fecha:** 2026-08-01
- **Estado:** aceptado
- **Contexto:** Lotes de producción / comercialización forestal (ADR-136)
- **Relacionado:** ADR-317 (directorio forestal) · ADR-315 (cadena de custodia del lote) · port de `~/proyectos/appforestal` (`lotes`)

## El problema

El lote de Buleje tenía un solo eje de estado: `abierto` → `cerrado` →
`despachado`, tildado a mano. Es un estado **comercial**: si admite corridas, si
está congelado para vender, si ya salió.

Faltaba el otro eje, el que el ERP forestal de referencia sí tenía: **cuándo la
planta trabaja ese lote**. Y faltaba una pregunta más incómoda: **de quién es la
madera**.

Un aserradero de la selva central no asierra sólo lo suyo. Buena parte del
trabajo es **maquila**: el cliente trae sus trozas, el centro las asierra y
devuelve la madera. En ese caso el lote no es del centro, y el certificado que lo
acompaña estaba diciendo lo contrario por omisión.

## La decisión

### 1. Dos ejes, no uno

| Eje | Campo | Valores |
|---|---|---|
| Comercial | `status` (manual) | abierto · cerrado · despachado · anulado |
| Operativo | `fechaInicio`/`fechaFin` (derivado) | programado · en proceso · finalizado · sin fechas |

Son **independientes**, y confundirlos sería el error. Un lote puede estar
comercialmente abierto —se le siguen sumando corridas de otra línea— y
operativamente terminado. O cerrado y programado para la semana que viene.

El operativo **se deriva, no se tilda**: una fecha que ya pasó no necesita que
alguien se acuerde de cambiar un estado.

### 2. Los extremos de la ventana son inclusivos

Un lote que empieza y termina el mismo día está *en proceso*, no *finalizado*.
Con `<` en vez de `<=` un lote de un solo día —que es lo más común en una planta
chica— nacería terminado.

### 3. Se compara por día, en UTC

Las fechas del libro son date-only. A las 19:00 de Lima un `getTime()` crudo ya
está en el día siguiente y el lote saltaría a "finalizado" media tarde antes. Es
el mismo bug off-by-one que el resto del módulo evita formateando con
`timeZone:"UTC"`.

### 4. El titular se guarda POR NOMBRE además de por id

`titularId → ForestParty` (el directorio, ADR-317) **y** `titularNombre` copiado.

No es redundancia: el nombre es **acta**. Si mañana alguien corrige la ficha del
directorio —un typo, un cambio de razón social— lo que ya se certificó con ese
lote no puede cambiar retroactivamente. `titularDeLote()` prioriza el nombre
guardado justamente por eso.

Vacío = la madera es del propio centro. No se rellena con el nombre del CTP:
declarar al centro como titular de madera ajena es exactamente el error que este
campo viene a evitar.

### 5. La ventana avisa, no bloquea

Una ventana al revés casi siempre es un typo en el año, y descubrirlo al mes
siguiente —cuando el lote aparece "programado" para 2025— cuesta más que un
cartel mientras se tipea. Igual que el resto del libro: se avisa, se deja pasar.

## Consecuencias

- Migración `327-lote-ventana-titular.sql`, idempotente, aplicada por el pooler.
- Índice `(tenantId, titularId)`: "qué lotes son de este cliente" es *la*
  consulta de un aserradero de maquila.
- La card del lote muestra los dos chips (operativo + comercial), el titular
  cuando lo hay, y la ventana en vez de la fecha de creación.
- Sin fechas, el chip operativo **no se dibuja**: un "sin fechas" en cada card
  sería ruido en las plantas que no usan la ventana.

## Lo que NO se hace

- No se reemplaza el `status` comercial por el derivado.
- No se cierra un lote solo porque pasó su fecha de fin.
- No se rellena el titular con el nombre del propio CTP.

## Referencias

- `lib/forestal/lote-ventana.ts` · `__tests__/forestal-lote-ventana.test.ts`
- `prisma/manual-migrations/327-lote-ventana-titular.sql` · `scripts/apply-327-migration.mjs`
- `components/admin/forestal/ForestLotesModule.tsx` (chip) · `LoteForm.tsx` (alta)
