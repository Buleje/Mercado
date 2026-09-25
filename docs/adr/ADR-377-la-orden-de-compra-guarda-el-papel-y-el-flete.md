# ADR-377 — La orden de compra guarda el papel, el flete y su recurrencia

- **Fecha:** 2026-08-11
- **Estado:** Aceptado
- **Área:** Compras · `PurchaseOrder`, `RecurringPurchaseOrder`

## Contexto

Auditando la pestaña de Órdenes de Compra aparecieron tres huecos, medidos
sobre el tenant `main`:

**1. No había dónde anotar el comprobante del proveedor.** La orden guardaba
qué se pidió y a quién, pero no el número de factura. Sin ese dato no existe el
vínculo con SUNAT, no hay crédito fiscal que sustentar, y cuando el contador
pide "la compra de las 20 bolsas de arroz" no hay por dónde buscarla.

**2. El costo del producto ignoraba el flete.** El arroz "cuesta" S/19.50, pero
si llegó con S/40 de mototaxi repartidos entre 20 bolsas, cada bolsa costó
S/21.50. Con precio de venta S/25, el sistema mostraba un margen de S/5.50
cuando el real era S/3.50: **36% de margen imaginario**. Toda decisión de
precio salía de un número que no existe.

**3. Los pedidos recurrentes vivían en `localStorage`.** Se perdían al abrir el
admin en otro equipo, y el campo "avisame 2 días antes" no lo leía nadie: se
guardaba y ahí moría.

Faltaba además saber quién pidió cada orden, quién la recibió, cuándo llegó de
verdad (contra la fecha prometida) y por qué se canceló.

## Decisión

**Campos nuevos en `PurchaseOrder`** — todos nullable o con default, así que la
migración es expand-safe y no necesita backfill:

| Campo | Para qué |
|---|---|
| `invoiceNumber`, `invoiceType` | El papel del proveedor: factura, boleta o guía |
| `igvIncluded` (default `true`) | Si el costo cargado ya trae IGV. En bodega el precio de lista casi siempre lo incluye |
| `flete`, `otrosCostos` | Lo que costó traer la mercadería |
| `receivedDate` | Cuándo llegó de verdad — `deliveryDate` es lo prometido |
| `createdBy`, `receivedBy` | Quién la pidió y quién la recibió |
| `cancelReason` | Por qué se canceló |

**El flete se prorratea por VALOR, no por cantidad.** Mover una caja de whisky
ocupa lo mismo que una de fideos, pero cargarle el mismo flete a un producto de
S/2 que a uno de S/200 distorsiona más de lo que corrige. La primitiva vive en
`lib/compras/totales-oc.ts::costoUnitarioReal()` y la usan **los dos** caminos
que mueven stock (`PATCH /api/purchases/[id]` y `POST /api/compras/recepciones`).

**Modelo nuevo `RecurringPurchaseOrder`** con `nextDate`, `intervalDays`,
`notifyDaysBefore`, `active` y `lastGeneratedAt`, indexado por
`(tenantId, nextDate)` — que es justo la pregunta que hace el aviso: qué toca
pronto.

## Consecuencias

- El costo promedio ponderado de los productos ahora **sube** cuando la compra
  tuvo flete. Es el número correcto, pero cambia márgenes históricos hacia
  adelante (no se recalculan compras viejas: no tenemos su flete).
- `total` de la orden sigue siendo **lo que se le paga al proveedor** por la
  mercadería; el flete NO va ahí. La pantalla los muestra separados: "le pagás
  al proveedor S/370.50 · te cuesta S/410.50".
- `igvIncluded` se guarda pero todavía no bifurca el cálculo: hoy el IGV
  siempre se presenta como contenido dentro del total (ADR anterior). El campo
  queda listo para cuando haya órdenes con costo sin IGV.
- La migración corre **por el pooler** (`USE_POOLER=1`): el DNS del `DIRECT_URL`
  de Supabase no resuelve desde esta red.

## Alternativas consideradas

- **Prorratear el flete por cantidad de unidades.** Más simple de explicar, pero
  le carga lo mismo al fideo que al whisky. Descartada.
- **Sumar el flete al `total` de la orden.** Rompería la conciliación con la
  factura del proveedor, que no incluye el mototaxi. Descartada.
- **Recalcular el costo de compras históricas.** Imposible: no existe el dato
  del flete de esas órdenes. Inventarlo sería peor que no tenerlo.

## Referencias

- `prisma/migrations/adr-377-oc-comprobante-flete-y-recurrentes.sql`
- `scripts/apply-377-migration.mjs`
- `lib/compras/totales-oc.ts` · `lib/compras/estados-oc.ts`
- Medición: OC de 20×S/19.50 + S/40 de flete → costo unitario S/21.50 ✓
