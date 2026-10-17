# Brechas del panel frente al mercado: diseño (10-10)

> Solo lectura: no se implementó nada. Todo `archivo:línea` sale de `grep`/`Read` de hoy. Las cifras salen de `node scripts/sql-lectura.mjs` (READ ONLY) contra la base real. «Sin medir» = no lo verifiqué.
> Base: `benchmark-panel.md` (10-10). ADR-430 **no** cubre la bodega: es el trato de precio del aserradero (`ForestParteTarifa`, `schema.prisma:7711`).

## Para ti, Brandon

| # | Qué ganas | Ejemplo en tu negocio | Cuánto cuesta construirlo | Qué decides tú |
|---|---|---|---|---|
| 1 | El precio de cada cliente se pone solo al venderle | Eliges a Doña Rosa en la caja y le cobra mayorista. Si lleva 12 gaseosas, sale el precio por docena | Mediano: toca el cobro de la caja y el de la tienda | Si manda «lo más específico» o «lo más barato». Si la tienda web también le da su precio (solo con su cuenta abierta) |
| 2 | Compras por caja y vendes por unidad | Cargas 2 cajas de 24 gaseosas a S/ 36. El stock sube 48 y cada una cuesta S/ 1,50 | Chico | Qué productos tienen caja y cuántas unidades trae cada una |
| 3 | Un combo descuenta lo que lleva | Vendes el «Pack desayuno» y bajan el pan, la leche y el café | Grande: toca todos los caminos que bajan stock | Qué hacer con el «Paquete del Día» automático: hay 185 creados y ningún canal los vende |
| 4 | Vendes por tono o talla, cada uno con su stock | «Labial tono 05: quedan 3» (no solo «labiales: 40») | Grande: toca el carrito y el checkout | Si lo necesitas para que Musa abra el 9-nov |
| 5 | Stock por local o almacén, con traslados | «En la tienda hay 10 y en el depósito 50. Mando 20 y llegan 20» | Grande | Si de verdad tienes 2 locales. Hoy, entre los 15 negocios, hay 2 almacenes y 0 traslados |
| 6 | Vacaciones y permisos se piden y se aprueban, con saldo de días | Juan pide del 3 al 17 de noviembre, tú apruebas y la hoja de asistencia se llena sola | Chico-mediano | Régimen laboral (general 30 días, MYPE 15). Si el permiso es con o sin goce |
| 7 | Nadie compra sobre un monto sin tu visto bueno | Una orden de S/ 800 queda esperando tu OK en el celular | Chico | El monto. Quién aprueba (tú y el encargado, o solo tú) |
| 8 | Embudo de clientes por cerrar | «Hoy toca llamar a 3. Tengo S/ 4.200 por cerrar» | Chico-mediano | Si «Leads» (el embudo del SaaS) se va al superadmin |
| 9 | Cotización → pedido → guía → factura sin volver a tipear | El cliente acepta la proforma y con 2 toques salen la guía y la factura | Mediano | Nada clave: es arreglar y conectar |
| 10a | Planilla peruana con boleta de pago | A fin de mes: cuánto pagas a cada uno, cuánto va a EsSalud y a la AFP, con la boleta lista | Grande + contador | Régimen laboral y quién valida los cálculos (tu contador) |
| 10b | Guía de remisión electrónica aceptada por SUNAT | El camión sale con la guía aceptada sin entrar a SOL | Grande + proveedor | Si tu plan de Nubefact incluye guías. Si la madera también la necesita junto a la GTF |
| 11 | Libros completos para el contador | El kardex valorizado y el registro de compras salen con costo, fecha e IGV de cada factura | Mediano: toca 16 lugares que anotan el kardex | Método de valuación (promedio, que es lo que el sistema ya hace). Si todo es «mercadería» (tipo 01) |
| 12 | El conteo físico no borra lo vendido mientras cuentas | Cuentas a las 9, vendes 5 a las 10 y cierras a las 11: esas 5 no vuelven al stock | Chico | Cuántos días vive un conteo abierto antes de vencer. Hay uno abierto desde el 7 de mayo |

### Orden recomendado

| Orden | Brecha | Por qué va aquí |
|---|---|---|
| 1 | **12 Conteo físico** | Es un bug que hoy deja el stock mal, y es chico. Hay un conteo abierto desde el 07-05 con 56 productos y 0 contados |
| 2 | **11 Costo verdadero y libros** | Hoy la caja y la tienda **inventan** el costo (70 % del precio) cuando el producto no lo tiene: 37 de 89 productos en `main`. El libro del contador que se está armando esta noche lo toma como dato. Cada mes sin costo es un mes que el contador no puede valorizar |
| 3 | **1 Precio por cliente** | Ya pides el dato al dar de alta al cliente y no hace nada. Todavía nadie lo llenó (0 clientes en los 15 negocios), así que se puede cambiar sin migrar nada |
| 4 | **2 Comprar por caja** | Chico, y alimenta el costo unitario del kardex (11) |
| 5 | **7 Aprobación de compras** | Chico, y cierra un hueco: hoy el almacenero puede aprobar él solo la orden que propuso el sistema |
| 6 | **9 Cadena de documentos** | Hoy un pedido que nace de una cotización **no descuenta stock ni guarda el cliente**. Además prepara la guía electrónica (10b) |
| 7 | **6 Vacaciones** | Prepara la planilla. Necesita tu decisión de régimen laboral |
| 8 | **4 Variantes + 3 Combos** (juntos) | Tocan los mismos 5 caminos de stock y la zona de peligro: se construyen una vez. Si Musa vende por tono el 9-nov, **4 sube al puesto 3** |
| 9 | **8 Embudo (CRM)** | Vale más con la 9 hecha (la cotización mueve la etapa sola) |
| 10 | **5 Multialmacén** | Solo si hay un segundo local de verdad |
| 11 | **10a Planilla y 10b Guía electrónica** | Lo más diferenciador y lo más caro. Antes necesitan el contador (planilla) y Nubefact (guías) |

---

## Medición base (10-10)

| Dato | `main` | Blas | 15 negocios |
|---|---|---|---|
| Clientes con lista de precio | 0 de 15 | 0 de 1 | **0** |
| Variantes / combos hechos a mano | 0 / 0 (185 «Paquete del Día» del cron) | 0 / 0 | 0 / 0 |
| Almacenes / traslados / ubicaciones | 1 / 0 / 0 | 0 / 0 / 0 | 2 / 0 / 0 |
| Conteos abiertos | 1 (desde 07-05, 56 ítems, 0 contados) | 0 | 1 |
| Cotizaciones / guías | 0 / 0 | 0 / 0 | 0 / 0 |
| Órdenes de compra (con nº de factura) | 36 (1) | 0 | 76 |
| Productos sin costo / sin control de stock | 37 / 12 de 89 | sin medir | — |
| Unidades distintas en productos | 19 (caja, pack, kg, m3, und, unidad…) | sin medir | — |
| Movimientos de kardex de octubre (con almacén) | 32 (0): 21 venta online, 4+4 ajustes, 1 compra, 1 devolución, 1 venta | 0 | — |
| Asistencia por estado | 15 PRESENTE, 1 TARDANZA | 28 PRESENTE, 1 TARDANZA | 20 colaboradores |
| Líneas de venta de caja sin costo | — | — | 30 de 79 |

**Consecuencia:** ninguna brecha cambia el significado de datos que ya existan. Todo es **expand** sin backfill, salvo dos excepciones: el conteo abierto de mayo (12) y el costo histórico (11).

### Migraciones (aplica a todas)

SQL idempotente en `prisma/migrations/<fecha>_<nombre>/migration.sql` con estos pasos:
- Columnas nullable o con `DEFAULT` constante. `CHECK` y únicos parciales solo en el SQL.
- Se aplica con `pg` por `DIRECT_URL` (:5432). Nunca por el pooler 6543 y nunca con `SET SESSION`.
- Después: `npx prisma migrate resolve --applied <nombre>`, `prisma generate` y reiniciar el dev.
- Referencias entre tablas **sin FK** cuando cruzan entidades (ADR-426): se validan del mismo `tenantId` en la DB class.

Siguiente número de ADR libre a la hora de escribir: **ADR-491** (último: 490). Confírmalo al escribirlo, porque otros carriles abren ADRs esta noche.

---

## 1. Precio por cliente al vender

**Hoy**

| Qué | Evidencia |
|---|---|
| `Customer.listaPrecio` es texto libre («general / mayorista / especial») | `schema.prisma:386` |
| Solo lo leen el alta y la ficha del cliente y el export | `app/api/customers/route.ts:42,189` · `app/api/customers/[phone]/route.ts:36,118,197` · `app/api/compliance/data-export/route.ts:223` |
| La caja cobra `Product.price` y nada más (± descuento con tope) | `app/api/sales/route.ts:222-236`, `:251-268` |
| El cliente se resuelve **después** de poner precios | `app/api/sales/route.ts:336-420` |
| Precio mayorista solo en el marketplace | `StoreProduct.wholesalePrice` `schema.prisma:3411` |
| Ya hay una fórmula única de total y un descuento por sesión verificada | `lib/pricing/total-pedido.ts:64` · `lib/pricing/descuento-automatico.ts:69` (`sesionDelTelefono`) |
| `Customer.phone` es único **global** (TD-040) | `schema.prisma:343` |

**Qué se reusa de ADR-430** (la regla, no la tabla):
- El orden «lo más específico gana; sin precio no se cobra, nunca S/ 0».
- Una sola función para la vista previa y para el cobro.
- Las reglas de precio que se leen al cobrar van **sin caché**: la caché es por instancia y la vista previa mentía.

**Qué es nuevo:** todo lo de la bodega.

### Contrato

```prisma
model ListaPrecio {
  id         String    @id @default(cuid())
  tenantId   String
  nombre     String                       // «Mayorista», «Restaurantes»
  /// % sobre el precio de la tienda para lo que no tenga precio propio (−10 = 10 % menos). null = sin ajuste.
  ajustePct  Decimal?  @db.Decimal(5, 2)
  /// Escalas por cantidad para TODOS los clientes. Máx. 1 por negocio (único parcial en SQL).
  esGeneral  Boolean   @default(false)
  activa     Boolean   @default(true)
  createdBy  String
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  deletedAt  DateTime?
  items      ListaPrecioItem[]
  @@unique([tenantId, id])
  @@index([tenantId, activa])
}
model ListaPrecioItem {
  id            String  @id @default(cuid())
  tenantId      String
  listaId       String
  productId     Int
  desdeCantidad Int     @default(1)
  precio        Decimal @db.Decimal(12, 2)   // CHECK (precio > 0)
  lista ListaPrecio @relation(fields: [tenantId, listaId], references: [tenantId, id], onDelete: Cascade)
  @@unique([listaId, productId, desdeCantidad])
  @@index([tenantId, productId])
}
// Customer  + listaPrecioId String?   (sin FK; se valida del mismo tenant)
// Sale      + listaPrecioId String?
// SaleItem / OrderItem + precioBase Decimal? @db.Decimal(12,2)  + origenPrecio String?
```

```ts
// lib/pricing/precio-de-lista.ts — PURO, lo usan la caja, la tienda, la vista previa y la cotización
export type OrigenPrecio = "base" | "lista-producto" | "lista-ajuste" | "escala-general";
export interface ListaResuelta {
  id: string; nombre: string; ajustePct: number | null;
  items: ReadonlyArray<{ productId: number; desdeCantidad: number; precio: number }>;
}
export interface PrecioResuelto { precio: number; origen: OrigenPrecio; listaId: string | null; listaNombre: string | null }
export function precioDeLista(p: {
  productId: number; precioBase: number; cantidad: number;
  lista: ListaResuelta | null;     // la del cliente
  general: ListaResuelta | null;   // escalas por cantidad de todos
}): PrecioResuelto;
```

Orden de resolución:
1. Ítem de la lista del cliente con el mayor `desdeCantidad ≤ cantidad`.
2. `ajustePct` de su lista sobre el precio base.
3. Escala general por cantidad.
4. Precio base.

El descuento % del cajero se aplica **después**, con el tope de hoy calculado sobre ese precio.

```ts
const ListaSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  ajustePct: z.number().min(-90).max(100).nullable().default(null),
  esGeneral: z.boolean().default(false),
}).strict();
const ItemsListaSchema = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive(),
    desdeCantidad: z.number().int().min(1).max(100_000).default(1),
    precio: z.number().positive().max(1_000_000),
  })).max(5000),
}).strict();
```

| Ruta | Body / respuesta | Roles |
|---|---|---|
| `GET/POST /api/listas-precio` | lista · `ListaSchema` | GET: admin, owner, manager, cajero (solo lectura) · POST: admin, owner |
| `PATCH/DELETE /api/listas-precio/[id]` | `ListaSchema.partial()` · baja lógica | admin, owner |
| `PUT /api/listas-precio/[id]/items` | `ItemsListaSchema` (reemplaza todo) | admin, owner |
| `GET /api/listas-precio/para-venta?cliente=<phone>&ids=1,2` | `{ [productId]: PrecioResuelto }` para la vista previa del POS | admin, owner, manager, cajero |
| `PATCH /api/customers/[phone]` | + `listaPrecioId: z.string().cuid().nullable()` | admin, owner (el cajero elige al cliente, **no** cambia su lista) |

**DB class** `lib/db/listas-precio.db.ts`, `ListasPrecioDB`:
- Métodos: `listar(tenantId)`, `obtener(tenantId, id)`, `crear(tenantId, input, por)`, `actualizar(…)`, `archivar(…)`, `reemplazarItems(tenantId, listaId, items)`. Se cachean con `tenant:${id}:listas-precio` + `invalidateByPrefix`.
- `resolverParaVenta(tenantId, customerPhone | null, productIds)` va **sin caché** (2 consultas indexadas).

**Cambios en el cobro:**
- `app/api/sales/route.ts`: mover la resolución del cliente antes de `:222`. Llamar `resolverParaVenta` + `precioDeLista`. Guardar `precioBase` y `origenPrecio` en cada línea.
- `app/api/orders/route.ts` y `/api/orders/cotizar`: el mismo par, **solo con sesión verificada** (`sesionDelTelefono`). Nunca por un teléfono tipeado por un invitado.

**Migración:**
- Expand: 2 tablas + 4 columnas nullable. Sin backfill (0 clientes con lista).
- Contract: borrar `Customer.listaPrecio` cuando la pantalla use `listaPrecioId`. El select de hoy pasa a ser un select de listas.

**Riesgos:**
- Dinero: la vista previa y el cobro tienen que usar la misma función.
- Fraude: un invitado que tipea el teléfono de un mayorista.
- No mezclar con `wholesalePrice` del marketplace (`marketplace.db.ts`, zona de peligro).

**Tamaño:** FEATURE grande, al borde de INITIATIVE (ventas + clientes, 2 rutas de cobro) → `reviewer` + `security`. **ADR:** sí.
**Dependencias:** ninguna. Habilita 8 y 9 (la cotización prellena el precio).

> **ADR «Precio por cliente en la bodega: listas y escalas»**
> - **Contexto:** `Customer.listaPrecio` se pide y no lo lee nadie. ADR-430 resolvió lo mismo solo para el aserradero.
> - **Decisión:** tablas `ListaPrecio`/`ListaPrecioItem` y una función pura en `lib/pricing/` que usan la caja, la tienda, la vista previa y la cotización. «Lo más específico gana». El descuento del cajero va encima. En la tienda solo aplica con sesión verificada. Las líneas guardan `precioBase` y `origenPrecio`.
> - **Alternativas:** columnas `precioMayorista` en `Product` (una sola lista, no escala); reusar `ForestParteTarifa` (otra entidad, otra unidad: pie tablar); lista en JSON del KV (no se audita por cliente, igual que lo que descartó ADR-430).

## 2. Comprar por caja y vender por unidad

**Hoy**

| Qué | Evidencia |
|---|---|
| Una sola unidad, texto libre | `Product.unit` `schema.prisma:106` · 19 unidades distintas en `main` |
| La línea de compra tiene cantidad entera y unidad de texto | `PurchaseItem.quantity Int`, `unit String` `schema.prisma:944-957` |
| **Dos** caminos de recepción calculan stock y costo promedio, cada uno por su lado | `app/api/purchases/[id]/route.ts:262-310` · `app/api/compras/recepciones/route.ts:196-230` (los dos usan `costoUnitarioReal`) |

### Contrato

```prisma
// Product
unidadCompra String?   // «caja», «paquete»
factorCompra Int?      // unidades de venta por unidad de compra. CHECK (factorCompra IS NULL OR factorCompra >= 2)
                       // CHECK ((unidadCompra IS NULL) = (factorCompra IS NULL))
// PurchaseItem: snapshot al emitir la OC
factor       Int     @default(1)   // DEFAULT constante: las filas viejas quedan en 1 y su significado no cambia
unidadCompra String?
```

```ts
// lib/compras/unidad-de-compra.ts — PURO; lo llaman LOS DOS caminos de recepción, el PDF y las sugerencias de reorden
export function aUnidadDeStock(item: { quantity: number; factor: number }, costoUnitarioReal: number):
  { cantidadStock: number; costoUnitarioStock: number };          // quantity × factor ; costo ÷ factor
export function cajasParaReponer(faltanteUnidades: number, factor: number): number; // ceil
```

Regla: `PurchaseItem.quantity` y `unitCost` quedan en la unidad de la **factura** (2 cajas × S/ 36). El stock y el costo promedio siempre van en la unidad de venta.

- **Zod:** `PurchaseItemInput` + `factor: z.number().int().min(1).max(10_000).default(1)`, `unidadCompra: z.string().max(20).optional()`. Si no viene, el servidor toma el factor del producto.
- **Rutas que cambian:**
  - `POST /api/purchases` (admin, almacenero)
  - `PATCH /api/purchases/[id]` (recepción)
  - `POST /api/compras/recepciones`. `GoodsReceipt.itemsJson.receivedQty` se documenta en unidad de compra.
  - `PATCH /api/products/[id]`
- **DB class:** `PurchasesDB.add` guarda el snapshot. No hay clase nueva.

**Migración:** expand puro. Sin backfill. Sin contract.

**Riesgos:**
- Stock ×24 si un camino aplica el factor y el otro no. Hace falta un test de tabla que pase por los dos.
- Devolución al proveedor: sin medir si usa la unidad de compra.
- `kg` con `stock Int`: no se puede vender 0,5 kg (fuera de alcance; anotarlo).

**Tamaño:** FEATURE (compras/inventario, 4-5 archivos) → `reviewer` (stock y costo). **ADR:** corto, sí: cambia lo que significa una línea de compra.
**Dependencias:** ninguna. Alimenta el costo del kardex (11).

## 3. Combos o kits que descuentan sus componentes

**Hoy**

| Qué | Evidencia |
|---|---|
| `Bundle` + `BundleItem`. `BundleItem` no tiene `tenantId` ni FK a `Product` | `schema.prisma:1442-1466` |
| `BundlesDB` y su API | `lib/db/products.db.ts:606-654` · `app/api/bundles/*` |
| El único creador es un cron: «Paquete del Día», 15 % menos, uno por día. Usa `prisma.*` directo | `app/api/cron/daily-deal-bundle/route.ts:49,137` |
| **185 en `main`, todos del cron; 0 combos hechos a mano en los 15 negocios** | — |
| Ninguna venta, pedido ni carrito los lee. Solo los usa el Punto de compra | `components/admin/pos/PuntoCompraBundles.tsx` |
| Las recetas descuentan insumos al **producir**, no al vender | `Receta`, `ProduccionLote` |

### Contrato (recomendado: el kit es un producto)

```prisma
// Product.type gana el valor "kit" (String, sin migración de enum). Un kit tiene stock = null:
// su disponible = min(floor(stockComponente / cantidad)).
model ProductoComponente {
  id           String @id @default(cuid())
  tenantId     String
  kitId        Int      // Product.id con type = "kit"
  componenteId Int      // Product.id; CHECK (kitId <> componenteId); sin kits dentro de kits (lo valida la DB class)
  cantidad     Int      // CHECK (cantidad >= 1)
  @@unique([tenantId, kitId, componenteId])
  @@index([tenantId, componenteId])
}
```

```ts
// lib/inventario/lineas-de-stock.ts — PURO, compartido con 4 y 5
export interface LineaVendida { productId: number; variantId?: string | null; cantidad: number }
export interface LineaDeStock { productId: number; variantId: string | null; warehouseId: string | null; cantidad: number; kitId: number | null }
export function expandirLineas(lineas: readonly LineaVendida[], componentes: ReadonlyMap<number, ReadonlyArray<{ componenteId: number; cantidad: number }>>): LineaDeStock[]; // suma por producto
```

**Los 5 caminos que bajan o reponen stock** pasan a llamar `expandirLineas` + un helper transaccional `StockDB.descontarTx(tx, tenantId, lineas)` / `reponerTx(…)`, con el mismo guardia `stock >= qty`:
- `app/api/sales/route.ts:450-530`
- `app/api/orders/route.ts:798-830`
- `lib/db/orders.db.ts:681-720` (anular repone)
- `lib/db/devoluciones-pos.db.ts`
- `lib/db/marketplace/orders.db.ts`

El kardex anota una salida por componente con `notes: "Kit <nombre>"`. La línea del kit guarda el precio del kit y un `costPrice` = Σ costo real de sus componentes (nunca el 70 %).

**Rutas:** `PUT /api/products/[id]/componentes` { items: [{ componenteId, cantidad }] ≤ 30 } (admin, owner, almacenero). **DB class:** `KitsDB` en `lib/db/kits.db.ts`.

**Migración:** expand (1 tabla). Sin backfill. Contract opcional: el cron crea kits o se apaga, y `Bundle` queda solo para marketing o se borra. **Lo decides tú.**

**Riesgos:**
- Zona de peligro: `orders.db.ts`, checkout y marketplace.
- Reponer de más al anular.
- Las devoluciones parciales de un kit.

**Tamaño:** INITIATIVE → `reviewer` + `security`. **ADR:** sí, uno solo con 4 y 5: «Línea de stock: producto, variante, almacén».
**Dependencias:** se construye en el mismo motor que 4 y 5.

## 4. Variantes vendibles (tono, talla) con su stock

**Hoy**

| Qué | Evidencia |
|---|---|
| `ProductVariant` tiene `priceModifier`, `stock Int?` y `sku`. **0 filas en los 15 negocios** | `schema.prisma:231-249` |
| Hay `adjustStock`, pero `resolveTenantAliases` acepta **slug o CUID** como tenant (choca con la regla 3) | `lib/db/product-variants.db.ts:157` · `:91` |
| `SaleItem` y `OrderItem` no guardan variante | `schema.prisma:1030-1044` · `:549-565` |
| El carrito no conoce variantes (0 apariciones) | `contexts/cart-context.tsx` |
| La ficha del marketplace deja elegir variante, pero no llega al carrito | `app/(store)/marketplace/[slug]/producto/[productId]/ProductDetailPage.tsx:107` |

### Contrato

```prisma
// ProductVariant + barcode String?   (escanear el tono en la caja)
// SaleItem / OrderItem + variantId String? + variantName String?   (snapshot)
// InventoryMovement   + variantId String?
// ConteoFisicoItem    + variantId String?
```

Invariante: si un producto tiene variantes activas con stock, `Product.stock = Σ variant.stock`, y se mantiene en la **misma** transacción. Así las alertas, el ABC, el conteo y el kardex por producto siguen funcionando sin cambios.

**Precio:** el de la lista del cliente (1) + `priceModifier`, calculado en el servidor.

```ts
// item de venta (POS y tienda)
variantId: z.string().cuid().optional()
// el servidor valida: variante del MISMO producto y tenant, activa; sin variante en un producto que exige una → 400
```

- **Rutas:** `POST /api/sales`, `POST /api/orders`, `/api/orders/cotizar`.
- **Carrito:** la clave pasa a `productId + variantId` (`cart-context.tsx`, BroadcastChannel: probar con 2 pestañas).
- **DB class:** `ProductVariantsDB` deja de aceptar slug. `adjustStock` pasa a `StockDB` (3).

**Migración:** expand. Sin backfill (0 variantes).

**Riesgos:** zona de peligro (carrito, checkout, `orders.db`) y que Σ variantes ≠ stock del producto. Para lo segundo: un chequeo nocturno que lo avise.

**Tamaño:** INITIATIVE → `reviewer` + `security`. **ADR:** el mismo de 3.
**Dependencias:** motor de 3. Si Musa vende por tono el 9-nov, va primero.

## 5. Stock por almacén o local, con traslados

**Hoy**

| Qué | Evidencia |
|---|---|
| Hay almacenes con ubicación por pasillo y estante | `Warehouse` `schema.prisma:2464` · `Location.qty` `:2516` (0 filas) |
| Los traslados son de un producto por fila | `Transfer` `:2487` (0 filas) |
| El kardex tiene almacén, pero **0 de 32** movimientos de octubre lo usan | `InventoryMovement.warehouseId` `:1154` |
| `Product.stock` es uno solo y `Sale` no dice de qué almacén sale | `schema.prisma:990-1028` |
| **Dos** APIs y dos DB classes para el mismo traslado, con reglas distintas (una mira `Location.qty`, la otra no) | `lib/db/transfers.db.ts` · `lib/db/admin-warehouse-transfers.db.ts:146-158` |
| Ya existe el almacén por defecto | `WarehouseDB.ensureDefault` `lib/db/inventory.db.ts:452` |

### Contrato

```prisma
model ExistenciaAlmacen {
  id          String   @id @default(cuid())
  tenantId    String
  productId   Int
  warehouseId String
  variantId   String   @default("")   // "" = sin variante (evita NULL en el único)
  cantidad    Int                     // CHECK (cantidad >= 0)
  updatedAt   DateTime @updatedAt
  @@unique([tenantId, productId, warehouseId, variantId])
  @@index([tenantId, warehouseId])
}
// Settings      + multiAlmacen Boolean @default(false) + almacenWebId String?
// AdminUser     + warehouseId String?   (el local donde vende esa caja)
// Sale, Order   + warehouseId String?
// Transfer      + cantidadRecibida Int? ; status: pendiente → en_transito → recibido | cancelado
// ConteoFisico  + warehouseId String?
```

**Invariante:** con `multiAlmacen`, `Product.stock = Σ ExistenciaAlmacen.cantidad`. Se escribe con `StockDB` (3) dentro de la misma transacción.

**Traslado:**
- Al enviarse: sale del origen (1 movimiento).
- Al recibirse: entra al destino (1 movimiento). La diferencia queda como merma de tránsito.

**Rutas:**
- `POST /api/traslados` { desde, hacia, items[{ productId, variantId?, cantidad }] } (admin, owner, almacenero)
- `PATCH /api/traslados/[id]` { accion: "enviar" | "recibir" | "cancelar", recibidos? }

Contract: borrar la segunda API de traslados.

**Migración:**
- Expand: tabla + columnas.
- Backfill por negocio **al encender** la opción: un script idempotente pone `cantidad = Product.stock` en el almacén por defecto.
- Contract: unificar las DB classes y dejar `Location.qty` como dato informativo.

**Riesgos:** zona de peligro, deriva entre la suma y el total, y desde qué almacén despacha la tienda.

**Tamaño:** INITIATIVE grande. **ADR:** el de 3.
**Dependencias:** 3 y 4 (motor) y 12 (conteo por almacén).

## 6. Vacaciones y permisos con pedido y aprobación

**Hoy**

| Qué | Evidencia |
|---|---|
| Estados existentes | `ColaboradorEstado` y `AsistenciaEstado` `schema.prisma:2043-2059` |
| Asistencia: una marca viva por día; corregir = baja + reemplazo | `schema.prisma:2174-2200` |
| `factorDe`: PERMISO paga 0; VACACIONES y DESCANSO pagan 0 al jornal y 1 al sueldo | `lib/rrhh/ganado.ts:91-111` |
| **0 marcas de VACACIONES o PERMISO** en `main` y Blas | — |
| La antigüedad sale del ingreso | `Colaborador.fechaIngreso` `:2117` |
| Patrón de aprobación que se puede copiar (estado, revisadoPor, revisadoEn) | `PaymentApproval` `:5066` |
| El kiosko de marcación está en construcción (sin commit) | `lib/db/rrhh-kiosko.db.ts` |

### Contrato

```prisma
model SolicitudAusencia {
  id            String    @id @default(cuid())
  tenantId      String
  colaboradorId String
  tipo          String    // VACACIONES | PERMISO_CON_GOCE | PERMISO_SIN_GOCE | DESCANSO_MEDICO | LICENCIA (CHECK)
  desde         DateTime  @db.Date
  hasta         DateTime  @db.Date     // CHECK (hasta >= desde)
  dias          Decimal   @db.Decimal(4, 1)   // lo calcula el servidor (días calendario)
  motivo        String?
  adjuntoUrl    String?   // certificado médico
  estado        String    @default("PENDIENTE")  // PENDIENTE | APROBADA | RECHAZADA | ANULADA
  pedidoPor     String
  revisadoPor   String?
  revisadoEn    DateTime?
  motivoRechazo String?
  createdAt     DateTime  @default(now())
  deletedAt     DateTime?
  colaborador Colaborador @relation(fields: [tenantId, colaboradorId], references: [tenantId, id], onDelete: Restrict)
  @@index([tenantId, estado])
  @@index([tenantId, colaboradorId, desde])
}
// Settings + regimenLaboral String?   // general | pequena | micro  (lo comparte la planilla, 10a)
// AsistenciaEstado + PERMISO_GOCE, DESCANSO_MEDICO  (ALTER TYPE … ADD VALUE: aditivo)
```

```ts
// lib/rrhh/saldo-vacaciones.ts — PURO
export function saldoVacaciones(p: {
  fechaIngreso: FechaKey | null; regimen: "general" | "pequena" | "micro" | null;
  aprobadas: ReadonlyArray<{ desde: FechaKey; hasta: FechaKey; dias: number }>; hoy: FechaKey;
}): { ganados: number | null; tomados: number; pendientes: number | null; aviso: string | null };
// régimen o ingreso null → ganados null + aviso (nunca un 0 inventado)
```

Días por año: 30 en el régimen general y 15 en MYPE ⚠ (que lo valide el contador).

**Al aprobar:** una marca por día con `AsistenciaDB.guardar` (la única puerta), `origen: "solicitud"` y una nota con el id. Si un día ya tiene una marca viva, se devuelve la lista de choques y **no se pisa**. Anular algo ya aprobado reemplaza esas marcas.

| Ruta | Body | Roles |
|---|---|---|
| `GET/POST /api/rrhh/ausencias` | `{ colaboradorId, tipo, desde, hasta, motivo?, adjuntoUrl? }` | admin, owner, manager (después también el kiosko para lo propio) |
| `PATCH /api/rrhh/ausencias/[id]` | `{ accion: "aprobar" \| "rechazar" \| "anular", motivo? }` | admin, owner |
| `GET /api/rrhh/ausencias/saldo?colaboradorId=` | `saldoVacaciones` | admin, owner, manager |

**DB class:** `lib/db/rrhh-ausencias.db.ts`. La aprobación reclama con `updateMany … estado = 'PENDIENTE'`, así un doble clic no duplica las marcas.

**Migración:** expand (tabla, columna, 2 valores de enum). Sin backfill.

**Riesgos:**
- Plata: cambia lo ganado (`factorDe` necesita los 2 estados nuevos).
- Quién aprueba.
- Solicitudes que se solapan.

**Tamaño:** FEATURE (RRHH) → `reviewer`. **ADR:** sí, extiende ADR-414.
**Dependencias:** régimen laboral (compartido con 10a). El kiosko es opcional.

## 7. Aprobación de compras sobre un monto

**Hoy**

| Qué | Evidencia |
|---|---|
| Estados de la OC | `PurchaseStatus` `schema.prisma:867-873` · transiciones `lib/compras/estados-oc.ts:40-46` |
| **Hallazgo:** `auto_generated → pendiente` (aprobar la OC que propuso el forecast) lo puede hacer el **almacenero** | `app/api/purchases/[id]/route.ts:124` |
| Al crear: estado `pendiente` y, si es a crédito, la cuenta por pagar nace en el acto | `app/api/purchases/route.ts:60,100,125-136` |

### Contrato (sin tocar el enum)

```prisma
// Settings      + compraMontoAprobacion Decimal? @db.Decimal(12,2)   // null = no se pide OK
// PurchaseOrder + aprobacion String @default("no_requiere")  // no_requiere | pendiente | aprobada | rechazada (CHECK)
//               + aprobadaPor String? + aprobadaEn DateTime? + motivoRechazo String? + totalAprobado Decimal? @db.Decimal(12,2)
```

```ts
// lib/compras/aprobacion-oc.ts — PURO
export function requiereAprobacion(total: number, umbral: number | null, rol: AdminRole): boolean; // admin/owner nunca
export function bloqueoPorAprobacion(oc: { aprobacion: string }): null | "esperando_ok" | "rechazada";
```

**Mientras la aprobación esté pendiente o rechazada:**
- No hay recepción, en **los dos** caminos (3.er camino si cuentas el PDF).
- No nace la cuenta por pagar: se mueve al momento de aprobar.
- No se envía el PDF ni el WhatsApp al proveedor.
- Solo se puede cancelar.

Si alguien la edita y el total pasa `totalAprobado`, vuelve a `pendiente`.

| Ruta | Body | Roles |
|---|---|---|
| `PATCH /api/purchases/[id]/aprobacion` | `{ accion: "aprobar" \| "rechazar", motivo?: string }` | admin, owner |
| `GET /api/purchases?aprobacion=pendiente` | lista | admin, owner, almacenero |
| `PATCH /api/purchases/[id]` (`auto_generated → pendiente`) | sin cambios de body | **solo admin, owner** (arregla el hallazgo) |

**DB class:** `PurchasesDB.aprobar(tenantId, id, por)` y `.rechazar(…)`, con reclamo `updateMany … aprobacion = 'pendiente'` + `invalidate`. Aviso push al dueño con link a la vista «por aprobar». Aprobar respondiendo por WhatsApp necesita un token firmado: sin medir.

**Migración:** expand. Las 76 OC quedan en `no_requiere` y su significado no cambia.

**Riesgos:** dinero y permisos; concurrencia entre aprobar y recibir.

**Tamaño:** FEATURE → `reviewer` + `security` (permisos). **ADR:** corto, sí.
**Dependencias:** ninguna.

## 8. Embudo de clientes (prospecto → cotización → cliente)

**Hoy**

| Qué | Evidencia |
|---|---|
| «Leads» es el embudo **del SaaS**, guardado en `ActivityLog` | `lib/db/leads.db.ts:1-8` |
| `AdminTask` no se vincula a un cliente | `schema.prisma:2227` (title, status, assignedTo, module, dueDate) |
| `Reminder` y `FiadoGestion` existen, la segunda solo para cobranza | `schema.prisma:2265` · `:2687` |
| `Cotizacion.customerId` apunta al **teléfono** | `schema.prisma:3028` |
| `Customer.phone` es único global: **un prospecto sin teléfono no puede ser Customer** | `schema.prisma:343` |

### Contrato

```prisma
model Oportunidad {
  id               String    @id @default(cuid())
  tenantId         String
  titulo           String
  contactoNombre   String
  contactoTelefono String?
  customerId       String?   // Customer.id (cuid), sin FK; obligatorio al pasar a GANADA
  etapa            String    @default("NUEVA")   // NUEVA | CONTACTADA | COTIZADA | GANADA | PERDIDA (CHECK)
  montoEstimado    Decimal?  @db.Decimal(12, 2)
  cotizacionId     String?
  origen           String?   // whatsapp | tienda | referido | local
  responsable      String?   // username
  proximaAccion    String?
  proximaAccionEn  DateTime?
  motivoPerdida    String?
  cerradaEn        DateTime?
  createdBy        String
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  deletedAt        DateTime?
  notas OportunidadNota[]
  @@unique([tenantId, id])
  @@index([tenantId, etapa])
  @@index([tenantId, proximaAccionEn])
}
model OportunidadNota {
  id            String   @id @default(cuid())
  tenantId      String
  oportunidadId String
  tipo          String   // llamada | visita | whatsapp | nota
  texto         String
  createdBy     String
  createdAt     DateTime @default(now())
  oportunidad Oportunidad @relation(fields: [tenantId, oportunidadId], references: [tenantId, id], onDelete: Cascade)
  @@index([tenantId, oportunidadId])
}
```

**Reglas:**
- Pasa a COTIZADA sola cuando se le vincula una cotización.
- Pasa a GANADA sola cuando la cotización se convierte (enganche en 9).
- PERDIDA exige un motivo.

| Ruta | Roles |
|---|---|
| `GET/POST /api/crm/oportunidades` (filtros: etapa, responsable, `vencidas=1`) | admin, owner, manager, cajero |
| `PATCH /api/crm/oportunidades/[id]` | igual; reabrir una cerrada: admin, owner |
| `POST /api/crm/oportunidades/[id]/notas` | igual |

**DB class:** `lib/db/oportunidades.db.ts`, cacheada por `tenant:${id}:crm` + `invalidateByPrefix`.

**Migración:** expand (2 tablas).

**Riesgos:** bajos (no hay plata ni stock). Datos personales del contacto: entran en el export de Ley 29733.

**Tamaño:** FEATURE. **ADR:** corto, sí.
**Dependencias:** 9 (estado automático), 1 (precio al cotizar). **Lo decides tú:** si «Leads» se va al superadmin.

## 9. Cadena cotización → pedido → guía → factura

**Hoy:** `app/api/cotizaciones/[id]/convertir/route.ts` hace esto:

| Qué | Línea |
|---|---|
| Usa `prisma` directo, contra la regla 1 | `:4` |
| Roles admin, owner, manager | `:15` |
| Reclamo correcto ACEPTADA → CONVERTIDA | `:44-46` |
| Arma el pedido **sin `productId`**, con `customerPhone: ""`, `unit: "NIU"` y `quantity` Decimal(10,3) en un campo Int | `:52-73` |
| El vínculo es solo texto en `notes` | `:62` |

**Resultado:** el pedido convertido **no descuenta stock, no tiene costo, no tiene cliente y no entra al kardex**.

Además:
- `CotizacionItem.productoId` es **String** y `Product.id` es **Int** (`schema.prisma:3038`).
- `GuiaRemision.orderId` tiene `onDelete: Cascade` (`:3065`, `:3088`): borrar el pedido borra un documento legal. Sin medir si los pedidos se borran físicamente o solo con `deletedAt`.
- `GuiaRemisionItem.productoId` también es String (`:3098`).
- El comprobante ya sale desde un pedido (`app/api/sunat/emit/route.ts:31,85`) y la guía ya se prellena desde un pedido (`components/admin/GuiasRemisionModule.tsx:575`).
- 0 cotizaciones y 0 guías en los 15 negocios.
- `app/api/sales/route.ts:600-617` crea una «cotización automática»: sin medir para qué.

### Contrato

```prisma
// CotizacionItem   + productId Int?          (contract: borrar productoId String)
// GuiaRemisionItem + productId Int?
// Order            + cotizacionId String?  @@index([tenantId, cotizacionId])
// GuiaRemision.orderId: FK onDelete Cascade → SetNull (contract, DROP/ADD CONSTRAINT en una transacción)
```

```ts
// lib/db/cotizaciones.db.ts
convertirEnPedido(tenantId: string, cotizacionId: string, por: string):
  Promise<{ ok: true; orderId: string } | { ok: false; motivo: "no_encontrada" | "no_aceptada" | "stock_insuficiente"; detalle?: string }>;
// en UNA tx: reclamo ACEPTADA→CONVERTIDA, cliente resuelto, OrderItem con productId + costo real,
// descuento atómico con el MISMO helper que /api/orders (extraer de app/api/orders/route.ts:798-830 → StockDB, 3)

// GET /api/orders/[id]/documentos — vista de lectura, NO un estado nuevo en la máquina de pedidos
type DocumentosDelPedido = {
  cotizacion: { id: string; numero: string } | null;
  guias: Array<{ id: string; numero: string; status: string; sunatStatus: string | null }>;
  comprobantes: Array<{ id: string; tipo: string; serie: string; numero: number; sunatStatus: string }>;
  notasCredito: Array<{ id: string; numero: string }>;
};
```

**Zod de la cotización:** `cantidad` entera si el `productId` tiene stock (`refine`).

| Ruta | Roles |
|---|---|
| `POST /api/cotizaciones/[id]/convertir` (misma respuesta `{ orderId, numero }`) | admin, owner, manager |
| `POST /api/guias-remision` + `{ orderId }` que prellena los ítems con `productId` | los de hoy (sin medir) |
| `GET /api/orders/[id]/documentos` | admin, owner, manager, cajero |

**Migración:** expand. Sin backfill (0 filas). Contract: `productoId` String y la FK de la guía.

**Riesgos:**
- Stock.
- Emitir dos veces el comprobante: sin medir la idempotencia de `sunat/emit`.
- No tocar la máquina de estados de `orders.db.ts`: «facturado» se **deriva**, no se guarda.

**Tamaño:** FEATURE grande (ventas + guías + SUNAT) → `reviewer`. **ADR:** sí («Documentos encadenados por id»).
**Dependencias:** 1, 3 (helper de stock). Prepara 10b.

## 10. Planilla Perú y guía de remisión electrónica

### 10a. Planilla

**Hoy**
- El cálculo de hoy es solo una referencia. El propio código lo dice: «no calcula CTS, gratificaciones, EsSalud, ONP/AFP ni horas extra» (`lib/rrhh/ganado.ts:32-34`).
- Existen el sueldo versionado (`ColaboradorTarifa` `schema.prisma:2151`), los adelantos y lo descontado por planilla (`lib/rrhh/descuentos-planilla.ts`), y los contratos con firma.
- `Colaborador` (`:2101-2145`) **no tiene**: régimen pensionario, AFP, CUSPP, asignación familiar, tipo de contrato ni régimen laboral.
- 20 colaboradores en total (Blas 7, `main` 6).
- `DeclaracionTributaria` tipo plame: sin medir.

**Contrato**

Fase 1: pre-planilla mensual + boleta en PDF para firmar. Fase 2: archivos PLAME / AFPnet.

```prisma
model ParametroLaboral {          // GLOBAL (sin tenant), versionado; lo mantiene el superadmin. Nada hardcodeado.
  id           String   @id @default(cuid())
  clave        String   // RMV | UIT | ESSALUD_PCT | ONP_PCT | AFP_APORTE_PCT | AFP_PRIMA_PCT:<afp> | AFP_COMISION_PCT:<afp> | ASIG_FAMILIAR_PCT
  valor        Decimal  @db.Decimal(12, 4)
  vigenteDesde DateTime @db.Date
  fuente       String   // norma o link
  @@unique([clave, vigenteDesde])
}
// Colaborador + sistemaPension String? (ONP|AFP|NINGUNO) + afp String? + cuspp String? + asignacionFamiliar Boolean @default(false) + tipoContrato String?
model Planilla {
  id String @id @default(cuid())
  tenantId String
  periodo String                 // "2026-11"
  tipo String                    // MENSUAL | GRATIFICACION | CTS | LIQUIDACION
  estado String @default("BORRADOR")   // BORRADOR | CERRADA | ANULADA
  totalNeto Decimal @db.Decimal(12,2)
  totalAportesEmpleador Decimal @db.Decimal(12,2)
  cerradaPor String?
  cerradaEn DateTime?
  createdBy String
  createdAt DateTime @default(now())
  lineas PlanillaLinea[]
  @@unique([tenantId, id])
  @@index([tenantId, periodo, tipo])   // único parcial (tenantId, periodo, tipo) WHERE estado <> 'ANULADA' en SQL
}
model PlanillaLinea {
  id String @id @default(cuid())
  tenantId String
  planillaId String
  colaboradorId String
  conceptos Json      // [{ codigo, nombre, tipo: ingreso|descuento|aporte, base, tasa, monto }] + snapshot de ParametroLaboral usados
  neto Decimal @db.Decimal(12,2)
  boletaUrl String?
  firmadaEn DateTime?
  planilla Planilla @relation(fields: [tenantId, planillaId], references: [tenantId, id], onDelete: Cascade)
  @@index([tenantId, colaboradorId])
}
```

- **Cálculo:** `lib/rrhh/planilla/calcular.ts` PURO, un concepto por función. Tests con **casos dorados que entrega el contador**, por régimen.
- **Rutas:** `/api/rrhh/planillas` (GET, POST borrador), `/[id]/cerrar`, `/[id]/boletas`. **Solo admin y owner** (sueldos y DNI: Ley 29733).
- **Riesgos:** dinero y cumplimiento legal; los parámetros cambian cada año; datos personales.
- **Tamaño:** INITIATIVE → `reviewer` + `security`. **ADR:** sí.
- **Dependencias:** 6 (vacaciones → remuneración vacacional) y el régimen laboral.

### 10b. Guía de remisión electrónica (GRE)

**Hoy**
- `GuiaRemision` (`schema.prisma:3061-3093`) no tiene estado SUNAT.
- `lib/sunat/nubefact-client.ts`: **0** apariciones de «guia|remision».
- `TenantSunatConfig` existe (`:3886`). 0 guías en los 15 negocios.

**Contrato**

```prisma
// GuiaRemision + tipoGuia String @default("remitente") + serie String? + correlativo Int?
//   + sunatStatus String? (pendiente|aceptada|rechazada|observada) + sunatTicket String? + cdrResponse String?
//   + hash String? + enlacePdf String? + emitidaEn DateTime?
//   + ubigeoPartida String? + ubigeoLlegada String? + modalidadTransporte String? (01|02) + motivoCodigo String? (catálogo 20)
//   @@unique([tenantId, serie, correlativo])
```

- **Rutas:** `POST /api/guias-remision/[id]/emitir` y `GET …/estado` (consulta el ticket). Roles: admin, owner, manager.
- ⚠ **Sin medir:** si el plan de Nubefact incluye guías, y si el traslado de madera necesita una GRE además de la GTF de SERFOR.
- **Tamaño:** INITIATIVE. **ADR:** sí.
- **Dependencias:** 9.

## 11. Libros del contador: costo, fecha e IGV

**Hoy**
- El carril de libros está en construcción, sin commit: `lib/contabilidad/libros/*`, `lib/db/libros-contador.db.ts` y `app/api/admin/contabilidad/libros/route.ts`.
- El kardex valorizado **toma el costo de la línea de venta** (`kardex-valorizado.ts:9-12`). Deja vacíos el tipo de existencia y el método de valuación (`:105,108,200-202`).
- El registro de compras no tiene la fecha impresa en la factura (`registro-compras.ts:10`).
- `PurchaseOrder` (`schema.prisma:875-916`) tiene `invoiceNumber`, `invoiceType` e `igvIncluded`; **no** tiene `invoiceDate` ni `igvAmount`.
- `InventoryMovement` (`:1144-1168`) no guarda costo.

**Hallazgo que bloquea:** `app/api/sales/route.ts:234` y `app/api/orders/route.ts:376` ponen **costo = 70 % del precio** cuando el producto no tiene costo, y lo **guardan** en `SaleItem.costPrice` / `OrderItem.costPrice` (también `:287`, `:712`). En `main`, 37 de 89 productos no tienen costo. El libro presentaría ese 70 % como dato, contra la regla de verificación §2. Hay que guardar `null` y que la utilidad muestre «estimado» donde lo calcule.

### Contrato

```prisma
// PurchaseOrder     + invoiceDate DateTime? @db.Date + igvAmount Decimal? @db.Decimal(12,2)   // CHECK (igvAmount >= 0)
// InventoryMovement + unitCost Decimal? @db.Decimal(14,4)   // costo por UNIDAD DE STOCK al momento; null = no se sabe
// Product           + tipoExistencia String?   // Tabla 5 ⚠ códigos a confirmar; null hasta que tú lo marques (botón «todo es 01»)
// Settings          + metodoValuacion String?  // 'promedio' (lo que el sistema YA hace al recibir) | 'peps' (exige capas de costo: no)
```

```ts
// InventoryMovementsDB.record(data: { …; unitCost?: number | null })
// lib/inventario/costo-kardex.ts — PURO
export function costoParaKardex(tipo: string, ctx: {
  costoCompra?: number;        // costoUnitarioReal ÷ factor (2)
  costoPromedio?: number | null; // Product.costPrice
  costoLineaOriginal?: number | null; // devolución
}): number | null;
```

**Quién escribe el costo.** Los 16 archivos que escriben el kardex (medidos):

| Archivo | Sitios |
|---|---|
| `lib/db/inventory.db.ts` | 3 |
| `app/api/inventory-movements/route.ts` | 3 |
| `lib/db/supplier-returns-by-id.db.ts` | 2 |
| `lib/db/recetas.db.ts` | 2 |
| `app/api/recetas/[id]/producir/route.ts` | 2 |
| `app/api/purchases/[id]/route.ts` | 2 |
| `app/api/compras/recepciones/route.ts` | 2 |
| `mermas.db`, `inventory-conteo-items.db`, `devoluciones-pos.db`, `batches.db`, `inventory.agent`, `sales/route`, `returns/route`, `products/[id]/route`, `orders/route` | 1 c/u |

- **Zod:** el POST y el PATCH de compras + lo que lee el OCR de la factura llevan `invoiceDate: z.string().date().optional()` e `igvAmount: z.number().nonnegative().optional()`.
- **Validación en el servidor:** `igvAmount ≤ total`.

**Migración:**
- Expand: 5 columnas.
- Backfill **solo de compras**: `unitCost` desde `PurchaseItem.unitCost` por la referencia de la OC.
- Las ventas viejas **no** se rellenan: no se puede distinguir el 70 % inventado del costo real. El libro lo dice en una nota.

**Riesgos:** cumplimiento con SUNAT. Que el contador reciba cifras inventadas.

**Tamaño:** INITIATIVE pequeña (inventario + compras + ventas) → `reviewer`. **ADR:** sí («Costo en el kardex y nunca un costo inventado»).
**Dependencias:** 2 (factor). Coordinar con el carril de libros, que hoy lee `SaleItem.costPrice`.

## 12. Conteo físico: no perder lo vendido mientras se cuenta

**Hoy**

| Qué | Evidencia |
|---|---|
| El candado vive en la caché con TTL de 1 h | `app/api/inventory/conteo/route.ts:11-35` |
| Solo lo mira la caja; la tienda online no | `app/api/sales/route.ts:204` |
| La caché es Redis si existe `REDIS_URL`, si no memoria **por instancia** | `lib/cache.ts:233-236` |
| `REDIS_URL` está en `.env.local`; en producción | sin medir |
| Abrir saca la foto de todos los productos activos y **no** mira si ya hay otro conteo abierto | `lib/db/inventory-conteo-items.db.ts:151-181` |
| Cerrar ya lee el stock de hoy con `FOR UPDATE`, pero **pisa** con lo contado | `:236-244` · `:252-256` · nota «al abrir=» `:269` |
| Contar un ítem no guarda cuándo se contó | `:100-136` |
| `main`: un conteo **INICIADO desde el 07-05**, 56 ítems, 0 contados; el candado venció hace meses | — |

**Descarte:** el benchmark decía que el cierre usaba `prisma.*` directo. Ya no: `close/route.ts:22` llama a `InventoryConteoItemsDB.cerrar`.

### Las opciones, medidas contra el caso «cuento a las 9, vendo 5 a las 10, cierro a las 11»

| Opción | Qué pasa | Veredicto |
|---|---|---|
| Congelar ventas | La bodega no puede parar horas. La tienda online hoy ni lo mira y el candado es por instancia | Solo como opción para el conteo completo |
| Vencer el conteo | Limpia el de mayo, pero no arregla la cuenta | Sí, como higiene |
| Rehacer la foto al retomarlo | Igual pisa al cerrar | No alcanza |
| Diferencia contra la foto de apertura | Si vendes **antes** de contar ese ítem, la venta se cuenta dos veces | No |
| **Foto por ítem al contar + diferencia** | `nuevo = stockHoy + (contado − stockAlContar)`. Lo vendido después de contar se respeta; lo vendido antes ya está en la foto y en el estante | **Recomendada** |

Lo que queda abierto son los segundos entre contar el estante y apretar «guardar». Se documenta.

### Contrato

```prisma
// ConteoFisicoItem + stockAlContar Int? + contadoEn DateTime? + contadoPor String?
// ConteoFisico     + venceEn DateTime? + warehouseId String? (5) ; status suma 'VENCIDO' (String, sin enum)
// Único parcial en SQL: un solo conteo abierto por negocio
//   CREATE UNIQUE INDEX IF NOT EXISTS "ConteoFisico_un_abierto" ON "ConteoFisico"("tenantId") WHERE status IN ('INICIADO','EN_PROGRESO');
```

```ts
// contarItem: en la misma tx lee Product.stock → stockAlContar, contadoEn = now()
// cerrar: delta = contado − (stockAlContar ?? stockSistema)   // los contados antes de la migración caen al comportamiento de diferencia
//         nuevo = max(0, stockHoy + delta)   ;   movimiento ajuste_± con unitCost (11)
export interface ResumenCierreConteo {
  totalItems: number; contados: number; conDiferencia: number; ajustados: number;
  movidosDuranteConteo: number;   // Σ |stockAlContar − stockSistema|: transparencia de lo vendido mientras se contaba
}
```

| Ruta | Cambio |
|---|---|
| `POST /api/inventory/conteo` | 409 si ya hay uno abierto. Pone `venceEn` (por defecto 3 días: lo decides tú) |
| `PATCH /api/inventory/conteo/[id]/items` | Mismo body; el servidor guarda la foto del ítem |
| `POST /api/inventory/conteo/[id]/close` | Misma respuesta + `movidosDuranteConteo` |
| Candado | Se lee de la base (estado del conteo), no de la caché. Solo si eliges congelar, y también en `/api/orders` |

**Migración:**
1. **Antes** del índice: pasar el conteo de mayo de `main` a `VENCIDO` (un UPDATE). Es el negocio de QA y tiene 0 contados: no se pierde nada.
2. Columnas e índice.
3. Contract: borrar `setConteoLock` / `conteoLockKey`.

**Riesgos:** stock. Hoy el cierre puede **subir** el stock por encima de lo real, y eso termina en sobreventa.

**Tamaño:** FEATURE (inventario, 3-4 archivos) → `reviewer`. **ADR:** corto, sí.
**Dependencias:** ninguna. Con 5 suma el almacén; con 4, la variante.

---

## Dependencias en una línea

`12` sola · `2 → 11` · `1 → 9 → 8` · `9 → 10b` · `6 → 10a` · `3 + 4 + 5` comparten el motor «línea de stock» (un solo ADR, en este orden: 4/3 primero y 5 después) · `5 → 12` (conteo por almacén).

## Hallazgos al pasar (para arreglar aunque no se construya ninguna brecha)

| Hallazgo | Evidencia | Peso |
|---|---|---|
| Costo inventado del 70 % que se guarda como dato | `app/api/sales/route.ts:234,287` · `app/api/orders/route.ts:376,712` | Alto: contamina la utilidad y el libro |
| El almacenero aprueba la OC que propuso el sistema | `app/api/purchases/[id]/route.ts:124` | Medio: plata |
| Un pedido que nace de una cotización no descuenta stock ni guarda el cliente | `app/api/cotizaciones/[id]/convertir/route.ts:52-73` | Alto el día que se use (hoy 0 cotizaciones) |
| Borrar un pedido borra su guía | `schema.prisma:3088` | Medio: documento legal |
| 185 «Paquete del Día» que ningún canal vende | `app/api/cron/daily-deal-bundle/route.ts` | Bajo: ruido y cron inútil |
| Conteo abierto desde el 07-05 y candado que no protege la tienda online | `main` · `app/api/sales/route.ts:204` | Medio |
| Dos APIs de traslados con reglas distintas | `lib/db/transfers.db.ts` · `lib/db/admin-warehouse-transfers.db.ts` | Bajo (0 traslados) |
| Las variantes aceptan slug como tenant | `lib/db/product-variants.db.ts:91` | Medio: aislamiento entre negocios |
