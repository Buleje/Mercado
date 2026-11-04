# SIRE compras (RCE), tramo 2a: qué le falta a una compra y cómo guardarlo

> 04-11-2026 · architect, noche autónoma. Solo diseño: no se migró, no se aplicó SQL y no se tocó código de la app.
> SQL propuesto: `migraciones-propuestas/2026-11-04-sire-compras-datos-comprobante.sql` (14 columnas, todas opcionales).

**En simple (para el dueño):**
1. Hoy, al guardar una compra, el sistema se queda con el número de la factura, pero bota la fecha del papel, el IGV y la moneda. SUNAT pide las tres cosas para tu Registro de Compras.
2. Es como archivar la factura sin la esquina donde dice la fecha y el IGV: el contador no la puede declarar ni usar ese IGV a tu favor.
3. Ejemplo: una factura de S/ 1.180 del 28/10 trae S/ 180 de IGV. Con esto se guarda «28/10 · base 1.000 · IGV 180» y el SIRE la saca sola. Si una compra vieja no tiene fecha, sale en la lista «le falta la fecha» y no se inventa nada.

---

## Estado real medido (sql-lectura, 04-11)

| Qué | Hoy |
|---|---|
| Compras recibidas (todos los negocios) | demo 4, sin comprobante · main 0 recibidas (1 creada desde XML, sin recibir) · musa 0 |
| Gastos no recurrentes | main 6 · demo 3 · mi-pollo 1 · Blas 1. Ninguno con factura ni número |
| Blas (`cmpxiv6p4000bohvzwl6bnfpv`) | 0 órdenes de compra · 0 ingresos de madera con factura |
| Lo que ya existe y se **reusa** | `PurchaseOrder.invoiceNumber`, `invoiceType` e `igvIncluded` · `Expense.documentType`, `documentNumber`, `supplierRuc`, `igvAmount` (base = amount − igvAmount) y `afectoIgv` · `Supplier.ruc`/`documento`/`tipoDocumento` · `paidAt` · parser `lib/compras/factura-xml.ts` (fecha, fechaVencimiento, moneda, emisor.ruc, totales.igv/valorVenta/otrosImpuestos/total) · `CambioUsado` y `tipoCambioValido` de `compra-desde-factura.ts` · `armarRegistroCompras` (8.1) · ruta `GET /api/admin/contabilidad/libros` con `formato=sire` (hoy solo ventas) |
| Lo que **se pierde** al guardar desde XML | `factura.fecha`, `factura.moneda` y el tipo de cambio (solo quedan como texto en las notas), `factura.totales.*`, `factura.emisor.ruc` y `fechaVencimiento`. Además, el `total` de la orden puede ser menor que el del papel porque las líneas quitadas o sin producto no entran |

Conclusión: casi no hay filas viejas en riesgo. Es el mejor momento para agregar las columnas.

---

## (a) Columnas nuevas y qué campo del RCE cubre cada una

Montos **en soles**, también cuando el papel viene en dólares, porque el RCE declara los importes en moneda nacional. Este dato viene de una fuente secundaria y hay que confirmarlo en el Anexo 11 antes del tramo 2b.

| Tabla | Columna (Prisma) | Tipo | RCE | Por qué |
|---|---|---|---|---|
| PurchaseOrder | `invoiceDate` | `DateTime? @db.Date` | 5 | Fecha impresa. Hoy solo existe la fecha de llegada (`receivedDate`) |
| PurchaseOrder | `invoiceSupplierDoc` | `String?` | 12-13 + CAR | RUC/DNI del emisor tal como sale en el papel. No cambia si después se edita el proveedor |
| PurchaseOrder | `invoiceCurrency` | `String?` | 26 | PEN/USD (ISO 4217) |
| PurchaseOrder | `invoiceExchangeRate` | `Decimal? @db.Decimal(8,4)` | 27 | Tipo de cambio de venta SUNAT. Al exportar se escribe con 3 decimales |
| PurchaseOrder | `invoiceTaxableBase` | `Decimal? @db.Decimal(12,2)` | 15 | Base gravada |
| PurchaseOrder | `invoiceIgv` | `Decimal? @db.Decimal(12,2)` | 16 | IGV del papel (es una declaración: no se recalcula) |
| PurchaseOrder | `invoiceNonTaxable` | `Decimal? @db.Decimal(12,2)` | 21 | Exonerado + inafecto. Pesa mucho en la Amazonía (Ley 27037) |
| PurchaseOrder | `invoiceOtherTaxes` | `Decimal? @db.Decimal(12,2)` | 24 (22-23 juntos) | ISC + ICBPER + otros. El XML ya los trae sumados en `otrosImpuestos` |
| PurchaseOrder | `invoiceTotal` | `Decimal? @db.Decimal(12,2)` | 25 | Total del **papel**, que no es el `total` de la orden |
| Expense | `documentDate` | `DateTime? @db.Date` | 5 | `date` es el día del gasto y puede no coincidir con el papel |
| Expense | `documentCurrency` | `String?` | 26 | — |
| Expense | `documentExchangeRate` | `Decimal? @db.Decimal(8,4)` | 27 | — |
| Expense | `documentNonTaxable` | `Decimal? @db.Decimal(12,2)` | 21 | Base gravada = `amount − igvAmount − documentNonTaxable` |
| Expense | `documentTypeCode` | `String?` | 7 | Código Tabla 11 cuando el texto no alcanza: ticket = 12, recibo de servicio = 14, otro = 00 |

Lo que **no** se agrega:
- Tipo, serie y número: ya están (`invoiceType` + `invoiceNumber` → `partirSerieNumero`).
- Fecha de vencimiento (RCE 6, solo tipo 14): se usa `paidAt` del gasto.
- Clasificación (RCE 33): solo es obligatoria si el año anterior pasó las 1.500 UIT.

Sin enums nuevos (memoria `valor-de-enum-nuevo-rompe-cliente-viejo`), sin `@default`, sin índices.

---

## Contrato

```ts
// lib/compras/comprobante-proveedor.ts (NUEVO, puro: lo usan cliente y servidor)
export const ComprobanteProveedorSchema = z.object({
  fechaEmision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),          // RCE 5
  docEmisor: z.string().regex(/^(\d{8}|\d{11})$/).optional(),      // RCE 13
  moneda: z.string().regex(/^[A-Z]{3}$/).optional(),               // ausente = PEN al exportar
  tipoCambio: z.number().positive().max(50).optional(),            // obligatorio si moneda ≠ PEN
  baseGravada: z.number().nonnegative().max(1e9).optional(),       // S/
  igv: z.number().nonnegative().max(1e9).optional(),
  noGravado: z.number().nonnegative().max(1e9).optional(),
  otrosTributos: z.number().nonnegative().max(1e9).optional(),
  totalComprobante: z.number().nonnegative().max(1e9).optional(),
}).superRefine((c, ctx) => { /* moneda ≠ PEN sin tipoCambioValido(tc, moneda) → issue */ });
export type ComprobanteProveedor = z.infer<typeof ComprobanteProveedorSchema>;

/** Avisos, NUNCA rechazo (no se pierde la compra; el que bloquea es el RCE). */
export function cuadreDelComprobante(c: ComprobanteProveedor): string[];
//  · |base + igv + noGravado + otros − total| > S/ 1  → «la suma del papel no da el total»
//  · |base × 0,18 − igv| > S/ 1                      → «el IGV no es el 18 % de la base» (tolerancia de SUNAT)
export function comprobanteAColumnasCompra(c: ComprobanteProveedor | null): Prisma.PurchaseOrderUpdateInput; // null = borrar las 9
export function comprobanteAColumnasGasto(c: …): Prisma.ExpenseUpdateInput;
```

- **Sin `.default()` en el schema**: en Zod 4, `.partial()` sigue aplicando los defaults (gotcha del hub de stack), así que un PATCH le pondría PEN a una compra en dólares. Siempre `safeParse`.
- `POST /api/purchases`: `{ ...actual, comprobante?: ComprobanteProveedor }` → `{ ...actual, avisosComprobante: string[] }`. Roles `["admin","almacenero"]`, como hoy. El `total` de la orden lo sigue calculando el servidor (regla 6). Las cifras del papel se guardan tal cual, como declaración.
- `PATCH /api/purchases/[id]`: `{ ...actual, comprobante?: ComprobanteProveedor | null }`. Mismos roles que el PATCH actual (`["admin","almacenero"]`, línea 136). Si la compra ya está en un periodo SIRE generado, igual se acepta, pero responde un aviso.
- `POST|PATCH /api/expenses[/id]`: 5 campos sueltos con el mismo vocabulario (`documentDate`, `documentCurrency`, `documentExchangeRate`, `documentNonTaxable`, `documentTypeCode: /^\d{2}$/`). Roles: los de hoy (`["admin"]` en POST; PATCH línea 99 = `["admin","owner","manager"]`).
- DB: `PurchasesDB.create(tenantId, …)` y `update(tenantId, id, …)` escriben las columnas. Ya llaman a `invalidateAdminCache.afterPurchase(tenantId)`: no hace falta otra invalidación.
- RCE (tramo 2b): `armarSireRce(entrada) → { lineas: string[]; bloqueos: BloqueoRce[]; nombreArchivo }`, con `BloqueoRce = { origen: "compra"|"gasto"; id; serieNumero; motivo: "sin-fecha-emision"|"sin-doc-proveedor"|"sin-igv"|"tipo-ambiguo"|"fecha-despues-del-periodo"|"moneda-sin-cambio"; sugerencia?: string }`.

---

## (b) Archivos a cambiar después de migrar (1 línea cada uno)

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | 14 campos opcionales en `PurchaseOrder` y `Expense` (tabla de §a) |
| `prisma/migrations/20261104a_sire_compras_comprobante_adr532/migration.sql` | Copia del SQL propuesto |
| `lib/compras/comprobante-proveedor.ts` (NUEVO) | Schema Zod + `cuadreDelComprobante` + `comprobanteAColumnas*` |
| `lib/compras/factura-xml.ts` | Exponer `totales.baseGravada` (TaxSubtotal 1000) y `totales.noGravado` (9997 + 9998). Ya recorre los subtotales en la línea 357 |
| `components/admin/compras/factura-xml/compra-desde-factura.ts` | `cuerpoDeLaCompra` manda `comprobante` con fecha, `emisor.ruc`, moneda, tc y base/igv/ng/otros/total × tc redondeados a céntimos una sola vez |
| `app/api/purchases/route.ts` | `PurchaseSchema.comprobante` opcional + `avisosComprobante` en la respuesta |
| `lib/db/purchases.db.ts` | Los dos `create` (líneas ~92 y ~255) y `update` (~293) escriben las columnas |
| `app/api/purchases/[id]/route.ts` | El PATCH acepta `comprobante` para completar el papel al recibir |
| `components/admin/ordenes-compra/OcAccionesOrden.tsx` + `recepciones/ResumenAlGuardar.tsx` | Bloque «Datos del papel» al recibir o editar. **No al crear la orden**: la factura llega después |
| `components/admin/comandos-ia/papel/guardar-papel.ts` | Pasar la `fecha` que ya lee del papel como `comprobante.fechaEmision` |
| `app/api/expenses/route.ts` + `app/api/expenses/[id]/route.ts` | 5 campos en el BodySchema |
| DB class de gastos (`GastosDB`, archivo sin verificar) | Escribir los 5 campos |
| `components/admin/gastos/ComprobanteCampos.tsx` | Fecha del papel · «¿La factura cobra IGV? Sí / No (exonerada)» · tipo SUNAT si es recibo o ticket |
| `lib/db/libros-contador.db.ts` | `compras()` agrega las columnas nuevas al `select` |
| `lib/contabilidad/libros/registro-compras.ts` | El 8.1 usa la fecha, la BI y el IGV reales (hoy van vacíos) |
| `lib/contabilidad/libros/sire-rce.ts` (NUEVO, 2b) | 37 campos + nombre `LE…080400 02 …` + bloqueos |
| `app/api/admin/contabilidad/libros/route.ts` | Rama `libro=compras&formato=sire` (ventas ya existe) |

---

## (c) Tramos, en orden (cada uno ≤1 endpoint o ≤1 pantalla)

| # | Tramo | Quién | Depende de |
|---|---|---|---|
| T0 | Migración + `schema.prisma` + `prisma generate` + `/adr` ADR-532 | `database` opus + `security` (zona de peligro) · **OK de Brandon** | — |
| T1 | `comprobante-proveedor.ts` + test del cuadre (moneda, 18 %, ±S/ 1) | `backend` sonnet | T0 (tipos de Prisma) |
| T2 | `POST /api/purchases` + `PurchasesDB.create` | `backend` sonnet | T1 |
| T3 | Parser XML (base gravada / no gravada) + `cuerpoDeLaCompra` + test con un XML real en USD y uno exonerado | `backend` sonnet | T2 |
| T4 | `PATCH /api/purchases/[id]` + `PurchasesDB.update` | `backend` sonnet | T1 |
| T5 | Pantalla «Datos del papel» al recibir (1 captura) | `frontend` sonnet | T4 |
| T6 | Gastos: POST/PATCH + `ComprobanteCampos.tsx` (1 captura) | `backend` + `frontend` en paralelo (archivos disjuntos) | T1 |
| T7 (= 2b) | `sire-rce.ts` + `select` en `LibrosContadorDB.compras` + bloqueos + rama SIRE en la ruta de libros | `backend` opus (cifras que se declaran) | T2-T6 |

Se pueden correr en paralelo: T2‖T4‖T6 después de T1, y T3 después de T2. La prueba de verdad de T3 es por el camino del usuario: subir el XML en QA, guardar y leer la fila con `sql-lectura`. El script del parser solo no alcanza.

---

## (d) Filas viejas sin datos: qué hace el RCE con ellas

- **Compras viejas** (demo 4, todas sin comprobante) y gastos sin factura: ya hoy quedan fuera del 8.1 (guía/ninguno/sin_comprobante). En el RCE no aparecen, ni como bloqueo.
- **Compra con factura pero sin `invoiceDate`** (todas las que se registren antes de T2/T5): **bloqueo** «Le falta la fecha de la factura», con arreglo a 1 clic. La fecha de llegada aparece como sugerencia, pero **solo se escribe si el dueño la confirma**.
- **Sin IGV pero con total**: bloqueo «Copia el IGV del papel». Se puede mostrar «parece S/ X (total − total/1,18)» como **derivado declarado**, pero nunca se escribe solo.
- **Sin RUC del emisor**: se usa el `Supplier.ruc` del mismo negocio, que ya se filtra por `supplier.tenantId`, y se avisa «tomado del proveedor». Sin ninguno de los dos: bloqueo, porque falta el CAR.
- **En dólares sin tipo de cambio**: bloqueo. Nunca dólares como si fueran soles; mismo criterio que `cuerpoDeLaCompra`.
- **Fecha de emisión posterior al periodo**: bloqueo, porque el RCE la rechaza.
- **El archivo SIRE se genera igual sin las filas bloqueadas**, y la pantalla dice cuántas son y cuánto suman (PT no aplica aquí; se muestra S/). Lo que no se descarga es un archivo que diga «todo listo» mientras queden bloqueos: el botón muestra «N por completar».

---

## (e) Decide Brandon (máx. 5, la recomendada primero)

1. **¿En qué mes entra la compra al Registro?** ⭐ El mes de la **fecha de la factura**: coincide con la propuesta que arma SUNAT, así hay menos que ajustar. · Alternativa: el mes en que llegó la mercadería, como hace hoy el 8.1. La ley deja anotarla hasta 12 meses después de la emisión (Ley 29215, sin verificar contra el texto en esta sesión).
2. **Compras viejas con factura y sin fecha.** ⭐ Lista de bloqueo con «poner la fecha», con la fecha de llegada como sugerencia. · Alternativa: llenarlas en bloque con la fecha de llegada (más rápido, pero inventa un dato que se declara).
3. **La madera de Blas** (`WoodEntry`, con su factura de la ATFFS o del dueño del bosque). Hoy **no entra** al libro de compras. ⭐ Un tramo propio, 2c, para que entre al RCE. · Alternativas: registrar la madera también como compra (doble registro), o dejarla fuera (el contador la agrega a mano).
4. **El IGV de una compra a mano.** ⭐ El dueño copia el IGV del papel; el sistema sugiere total − total/1,18 y avisa si difiere más de S/ 1. · Alternativa: calcularlo siempre solo, aunque falla con las facturas exoneradas de la Amazonía.
5. **Gastos con «recibo» o «ticket».** ⭐ Al anotar, el dueño elige el tipo SUNAT (ticket de máquina = 12, recibo de luz/agua/teléfono = 14, otro = 00). · Alternativa: dejarlos fuera del RCE hasta que alguien los clasifique.

---

## (f) Borrador ADR-532 (para pegar con `/adr`)

**ADR-532 — Datos del comprobante del proveedor en la compra y el gasto (SIRE RCE)**
**Contexto:** el Registro de Compras del SIRE (Anexo 11, RS 040-2022) pide, por comprobante, la fecha de emisión, el tipo, la serie, el número, el RUC del emisor, la base, el IGV, lo no gravado, el total, la moneda y el tipo de cambio.
`PurchaseOrder` solo guarda el número y el tipo. `Expense` guarda el IGV y el número, pero no la fecha del papel ni la moneda. La factura XML trae todo y se pierde al guardar.
**Decisión:** 14 columnas opcionales y aditivas, sin enums ni defaults: 9 en `PurchaseOrder` (`invoice*`) y 5 en `Expense` (`document*`).
Montos en soles como **declaración del papel**: no reemplazan al `total` de la orden, que sigue calculando el servidor.
Un único contrato Zod (`ComprobanteProveedorSchema`) para el XML, la compra a mano y el gasto.
El cuadre (suma = total, IGV ≈ 18 % ± S/ 1) avisa y no rechaza. El RCE bloquea lo incompleto y nunca lo completa con datos supuestos.
**Alternativas descartadas:**
- (1) Tabla `ComprobanteProveedor` aparte: un JOIN y una relación más para una relación 1:1, y dos caminos de escritura.
- (2) JSON `comprobante` en la orden: no se filtra por fecha de emisión en SQL y no lo tipa Prisma.
- (3) Recalcular el IGV desde el total: falla con exonerados e ICBPER.
- (4) Enum de moneda: un valor nuevo rompe al Prisma viejo de producción.
**Consecuencias:** migración aditiva reversible (primero se saca del schema, después el DROP); las filas viejas quedan en una lista de «por completar»; la madera (`WoodEntry`) queda para el ADR del tramo 2c.

---

## Riesgos

- **Zona de peligro:** `prisma/schema.prisma` (base = producción). T0 necesita OK de Brandon, la cadena `migrar-esquema` y `security`.
- **Cambio de significado:** ninguno. `total`, `invoiceNumber` e `igvAmount` siguen significando lo mismo. El riesgo es mostrar `invoiceTotal` como si fuera `total` en otra pantalla.
- **Cifras declaradas:** Σ BI + IGV + NG + otros del RCE debe cerrar contra Σ `invoiceTotal` de las mismas filas (±S/ 1 por fila). Si no cierra, la lectura está mal.
- **Inflar el IGV:** un almacenero puede poner más IGV para ganar crédito fiscal. Lo frenan el aviso base × 0,18 y el audit log del update.
- **Periodo distinto:** el RCE usa el mes de emisión y el 8.1 de hoy, el mes de llegada. Si Brandon elige la opción 1 de (e), los dos libros pueden diferir de mes; hay que decirlo en la pantalla.
- **Sin verificar:**
  - que `aplicar-migracion-sesion.mjs` acepte el `SET LOCAL`;
  - el archivo exacto de la DB class de gastos;
  - que los importes del RCE vayan en soles con USD (fuente secundaria).
