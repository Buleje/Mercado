# ADR-131 — Producto preparado vs empaquetado (distribución Inicio vs Tienda)

> Estado: **Aceptado** · Fecha: 2026-06-12 · Autor: Brandon + Claude

## Contexto

El Inicio muestra un **catálogo cruza-tiendas** (producto-first, estilo Mercado
Libre/Temu). Eso funciona para **retail empaquetado** (ropa, útiles, juguetes,
ferretería, abarrotes sellados, gaseosas): el cliente busca un producto, compara
y mezcla de varias tiendas en un carrito.

Para **comida preparada** (pollería, pizzería, restaurante) ese modelo **rompe**:
cada plato lo hace una cocina, con su propio pedido, delivery y cuenta. No podés
combinar "1/8 de pollo" de una tienda con una "pizza" de otra en un solo pedido.
Ese es el modelo **tienda-first** (Rappi/PedidosYa): elegís el negocio → ves su
menú → pedís de ese.

La distinción real no es "comida vs no-comida" sino **preparado al momento vs
empaquetado** — una misma bodega puede vender ambos.

## Decisión

Agregar un flag **por producto**: `Product.isPrepared: Boolean @default(false)`.

- `false` (EMPAQUETADA, default) → se muestra en el **Inicio** (catálogo
  cruza-tiendas) **y** en la ficha de la tienda.
- `true` (PREPARADA) → **solo** en la ficha de la tienda (tienda-first). **No**
  aparece en el Inicio.

El dueño lo marca al crear/editar el producto (admin), y el superadmin también
desde el modal "Productos del negocio" (`/superadmin/tenants`).

El filtro vive en `MarketplacePublicDB.getCatalogPage({ excludePrepared })`. El
route `/api/marketplace/catalog` pasa `excludePrepared: !storeSlug` → la vista
**cross-store** (Inicio) excluye preparadas; la vista **store-scoped** (ficha,
top-sellers) muestra todo.

## Consecuencias

- **+** El Inicio queda como marketplace de retail (producto-first); la comida
  vive store-first en la ficha de tienda — alineado con el carrito (1 cocina = 1
  pedido) y con el estándar de la industria.
- **+** Flexible por producto: una bodega puede tener empaquetados en el Inicio
  y un menú del día solo en su ficha.
- **−** Requiere que los dueños clasifiquen sus productos. Default `false`
  (empaquetada) = comportamiento previo intacto hasta que marquen "preparada".
- **Migración:** columna idempotente vía pg directo (el pooler cuelga
  `prisma migrate`) → `scripts/apply-isprepared-migration.sql` + `prisma generate`
  + reiniciar dev.

## Alternativas descartadas

- **Clasificar por vertical de la tienda** (restaurante = todo preparado): no
  contempla bodegas mixtas (empaquetado + menú del día).
- **Dos catálogos separados sin flag**: duplica datos y no resuelve el caso mixto.

## Referencias

- `prisma/schema.prisma` (Product.isPrepared), `lib/db/products.db.ts`,
  `lib/db/marketplace-public.db.ts` (getCatalogPage), `app/api/marketplace/catalog`.
- UIs: `components/admin/ProductsAdminTab.tsx`,
  `components/superadmin/tenants/TenantAddProductModal.tsx`.
