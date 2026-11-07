# Contrato: venta por peso (kg) en la caja y la tienda — arquitecto 28-10 (sólo lectura)

Pedido aprobado por Brandon 28-10. **No arrancar sin las respuestas de §Decisiones.**

## Hallazgo principal
El backend de la caja ya acepta 0,5 (`app/api/sales/route.ts:47`, `z.number().positive()`), pero la base tiene 6 columnas `Int`: 0,5 se cae al guardar la línea. En la tienda, tras migrar, el descuento de stock en SQL (`app/api/orders/route.ts:825`) redondearía sin avisar.

## Dónde vive la cantidad (`prisma/schema.prisma`)
| Eslabón | Campo | Tipo |
|---|---|---|
| Stock | `Product.stock` :117 (`unit` :114, texto libre) | `Int?` |
| Línea POS / pedido | `SaleItem.quantity` :1065 · `OrderItem.quantity` :580 | `Int` |
| Kardex | `InventoryMovement.quantity/previousStock/newStock` :1177-1179 | `Int` |
| Devolución · compra | `ReturnItem` :1247 · `PurchaseItem` :977 | `Int` |
| Lotes FEFO | `Batch.quantity` :2503 | ya `Decimal(10,3)` |

- «Se vende por kilo» = `unit='kg'` (no hay columna). Los 9 de `main`: ids 1252414-1252423, sin variantes, 0 ventas POS, 3 pedidos; todos con «1kg» en el nombre (p. ej. «Papa Amarilla Tumbay 1kg», S/ 5,90, stock 40). En toda la base: 13 productos kg/g/L en 3 negocios, nunca vendidos.
- Tablas chicas (99 líneas de venta, 224 de pedido, 135 movimientos): la migración bloquea un instante.

## Qué se rompe
| Punto | Evidencia | Qué |
|---|---|---|
| Carrito POS | `usePOSCarrito.ts:123,157` ±1 · `:228` dictado `Math.round` · `:255` «repetir» loop `for i<quantity` · `POSCartItem.tsx:45-49` | medio kilo entra como 1 |
| Total POS | `sales/route.ts:377` `price*qty` sin redondear · `:404-411` compara pagado vs total crudo | 0,333 × 4,20 = 1,3986 rechaza S/ 1,40 |
| Unidad | el Zod acepta 0,5 de cualquier producto | validar `unit` en el servidor |
| Stock POS | `kits.db.ts:287-299` `gte`+`decrement` (sirve con Decimal) · `:111` kits enteros | kits no se tocan |
| Tienda | `cart-context.tsx:20` tope 20 · `:152,158` cantidad 1 · `orders/route.ts:49` mínimo 1 | zona de peligro |
| SUNAT | `lineas-comprobante.ts:157` unidad fija `"NIU"` | `KGM`; el mapa existe en `lib/guias/desde-gtf.ts:64` → un solo lugar |
| Devolución | `sales/devolucion/route.ts:12` `.int()` | |
| Reportes | 28 archivos con `_sum: { quantity }` → `Decimal` | convertir a número en la clase de `lib/db` (`"0.5"+1="0.51"`) |

**Prisma viejo de producción** (7.8, `runtime/client.js`): un campo `Int` que lee `numeric` hace `Math.trunc(Number(v))`, sin error → leer es compatible; trunca fracciones guardadas (39,5 → 39) y si alguien guarda el producto ahí se pierde la fracción.

## Fases
**F0 base (`database`, Opus, solo)** — `prisma/migrations/20261028_venta_por_peso_adr<N>/migration.sql`, idempotente, un bloque por columna:
```sql
DO $$ BEGIN IF (SELECT data_type FROM information_schema.columns
  WHERE table_name='Product' AND column_name='stock')='integer' THEN
  ALTER TABLE "Product" ALTER COLUMN "stock" TYPE numeric(12,3) USING "stock"::numeric(12,3);
END IF; END $$;
```
Columnas: `SaleItem.quantity`, `OrderItem.quantity`, `InventoryMovement.quantity/previousStock/newStock`, `ReturnItem.quantity`, `Product.stock`. Quedan `Int`: `stockMin/stockMax`, `ProductVariant.stock`, `PurchaseItem`. Cadena `migrar-esquema` (ensayo → aplicar → cruzar → `resolve --applied`). `schema.prisma` → `Decimal @db.Decimal(12,3)`; tipos se arreglan en `lib/db` (p. ej. `products.db.ts:95,291,333`).

**Contrato compartido (lo escribe el hilo principal ANTES de los carriles): `lib/venta-por-peso.ts`**
```ts
export const UNIDADES_CON_DECIMALES = ["kg", "L"] as const;
export function aceptaDecimales(unit: string | null | undefined): boolean;
/** céntimos enteros × milésimas enteras; redondeo half-up */
export function importeLineaCentimos(precioSoles: number, cantidad: number): number;
export function restarStock(stock: number, cantidad: number): number; // en milésimas
export function formatearCantidad(cantidad: number, unit: string): string; // "0,500 kg" | "3"
export function unidadSunat(unit: string): "KGM" | "LTR" | "NIU";
export const cantidadVentaSchema: z.ZodNumber; // positive, max 100_000, ≤3 decimales (safeParse)
```

**F1 caja + backend + stock + SUNAT** (2 carriles disjuntos):
- A backend: `sales/route.ts` (leer `unit` de la base; 0,5 de lo que no es kg → 400; total = Σ `importeLineaCentimos`), `kits.db.ts`, `inventory.db.ts`, `lineas-comprobante.ts`, `devolucion/route.ts`.
- B frontend: `usePOSCarrito.ts`, `POSCartItem.tsx`, nuevo `POSPesoInput.tsx` (¼ · ½ · 1 kg + libre), ticket.
- Tests `__tests__/venta-por-peso.test.ts`: 0,5×4,20=210 c · 0,333×4,20=140 · 0,125×4,20=53 (half-up) · 0,25×29,90=748 · stock 1,25−0,5=0,75 · 0,5 de `und` → 400 · línea SUNAT `KGM` total 2,10.
- `reviewer` obligatorio (plata y stock).

**F2 tienda (zona de peligro, + `security`)**: `cart-context.tsx`, `orders/route.ts` (mínimo por unidad en el servidor; descuento SQL con `Prisma.Decimal`), selector en la ficha, `components/checkout/**` sólo para mostrar. No tocar idempotencia ni la máquina de estados de `orders.db.ts`.

## Riesgos
- Producción (julio) lee truncado; no vender fracciones reales en producción hasta desplegar F0 allí.
- El ensayo puede fallar si una vista depende de esas columnas (no verificado: el ensayo lo muestra).
- `sales/route.ts` ya usaba `prisma.$transaction` directo antes: no se toca.

## ADR
Sí: «ADR-<siguiente a 519>: cantidades con decimales para venta por peso (stock, ventas, pedidos y kardex en numeric(12,3))». Alternativas descartadas: gramos (×1000 en reportes `price*qty`), columnas paralelas (dos verdades de stock).

## Decisiones (preguntadas el 28-10; Brandon cerró la terminal antes de contestar)
1. Base: **migrar y hacer la caja primero** (recomendado) · caja y tienda juntas · esperar al deploy.
2. Reglas (varias): caja al gramo, mínimo 10 g, atajos ¼·½·1 kg (recomendado) · tienda en pasos de 0,25 kg · sacar «1kg» del nombre de los 9 · litros también.
3. Pedido online: se cobra el peso pedido; el ajuste por peso real al despachar queda fuera.
