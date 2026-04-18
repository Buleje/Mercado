# Ola 1: Compra Recurrente — Design Spec

**Fecha:** 2026-04-13
**Autor:** Brandon + Claude
**Estado:** Aprobado (post-review v2)
**Objetivo:** Que el usuario que compra una vez vuelva a comprar con mínima fricción.

---

## Resumen Ejecutivo

5 features interconectadas que atacan retención y frecuencia de compra:

| # | Feature | Esfuerzo | Dependencias |
|---|---------|----------|-------------|
| 1 | Historial de pedidos + "Pedir de nuevo" | Bajo | Ninguna (usa Order existente) |
| 2 | Favoritos / Wishlist con alternativas | Bajo | Nueva tabla Favorite |
| 3 | Comparador de precios integrado | Bajo | Reutiliza PriceCompare.tsx |
| 4 | Lista de compras semanal | Medio | Extiende ShoppingList/Item existentes |
| 5 | Cupones y referidos | Medio | Extiende Coupon existente + Referral existente |

**Orden de implementación:** 1 → 2 → 3 → 4 → 5 (cada feature construye sobre la anterior).

---

## Identidad del Cliente

> **IMPORTANTE:** El sistema NO tiene modelo `User`. La identidad del cliente es:
> - Modelo: `Customer` con `phone String @id` como clave primaria
> - Todas las referencias a "usuario" en este spec usan `customerPhone: String`
> - El modelo `Product` tiene `id: Int` (autoincrement), NO String

---

## Navegación del Usuario

Nuevo menú de usuario (reemplaza botón "Ingresar" cuando está logueado):

```
👤 [Nombre] ▼
├── 📋 Mis pedidos        → /mi-cuenta/pedidos
├── ❤️ Mis favoritos      → /mi-cuenta/favoritos
├── 🛒 Mis listas         → /mi-cuenta/listas
├── 🎟️ Mis cupones        → /mi-cuenta/cupones
├── 👥 Invitar amigos     → /mi-cuenta/referidos
└── ⚙️ Mi cuenta          → /mi-cuenta
```

En mobile: página `/mi-cuenta` con grid de secciones.

**Auth guard:** Todas las rutas `/mi-cuenta/*` requieren autenticación. Middleware redirect a auth modal si no logueado.

---

## Feature 1: Historial de Pedidos + "Pedir de Nuevo"

### Qué es
Página donde el cliente ve todos sus pedidos anteriores y puede repetir cualquiera con 1 click.

### Modelo de datos
No requiere tablas nuevas. Usa `Order` + `OrderItem` existentes.
- `Order.customerPhone` identifica al cliente
- `Order.tenantId` aísla por tenant
- `Order.source` puede ser `"direct" | "marketplace" | "wholesale"`
- `OrderStatus`: `pendiente | confirmado | en_camino | entregado | cancelado`

### Flujo
1. Cliente abre "Mis pedidos"
2. Ve lista paginada: fecha, total, estado, thumbnails de productos
3. Click "Pedir de nuevo" en un pedido anterior
4. Modal `ReorderModal` muestra items a re-agregar
5. Si algún producto no tiene stock → aviso con sugerencia de reemplazo
6. Si el precio cambió → aviso: "Arroz subió de S/19 a S/20"
7. Cliente ajusta cantidades → items se agregan al carrito → checkout normal

### Componentes
| Componente | Responsabilidad |
|-----------|----------------|
| `OrderHistory.tsx` | Lista paginada de pedidos con filtros (fecha, estado) |
| `OrderCard.tsx` | Card: fecha, items preview, total, status badge, botón "Pedir de nuevo" |
| `ReorderModal.tsx` | Modal con items a re-agregar, alertas de stock/precio, cantidades editables |

### API
> Nota: El endpoint `GET /api/orders` existente usa `requireAdmin`. Para clientes del marketplace se necesita un endpoint separado.

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `GET /api/marketplace/my-orders?page=1&limit=10` | GET | Pedidos del cliente autenticado, paginados |
| `POST /api/marketplace/my-orders/[id]/reorder` | POST | Valida stock/precios, agrega items al carrito |

### Reglas de negocio
- Solo muestra pedidos con status `entregado` y `confirmado`
- "Pedir de nuevo" valida stock en tiempo real antes de agregar
- Si >50% de items no tienen stock, sugiere no repetir ese pedido
- Precios se toman del catálogo actual, no del histórico
- Filtra por `customerPhone` del cliente autenticado + `tenantId`

---

## Feature 2: Favoritos / Wishlist con Alternativas

### Qué es
Corazón en cada product card. Al ver favoritos, muestra dónde está más barato.

### Modelo de datos (tabla NUEVA)
```prisma
model Favorite {
  id            String   @id @default(cuid())
  customerPhone String   // Customer.phone
  productId     Int      // Product.id (Int, no String)
  storeId       String   // Store.id — tienda donde lo marcó
  tenantId      String
  createdAt     DateTime @default(now())

  customer Customer @relation(fields: [customerPhone], references: [phone], onDelete: Cascade)
  product  Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  store    Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  tenant   Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([customerPhone, productId, tenantId])
  @@index([customerPhone, tenantId])
  @@index([tenantId])
}
```

Un solo registro por producto por cliente. Si marca el mismo arroz desde otra tienda, hace upsert actualizando `storeId`.

### Flujo
1. Rosa ve "Arroz Costeño 5kg" en Buleje → click ❤️ → se guarda
2. Va a "Mis favoritos":
   - `★ Arroz Costeño 5kg` — Guardado de: Buleje S/19.00 [Agregar al carrito]
   - También en: luis1 S/18.50 · Tienda3 S/18.00
3. Si no está logueada y toca ❤️ → abre auth modal existente

### Componentes
| Componente | Responsabilidad |
|-----------|----------------|
| `FavoriteButton.tsx` | Corazón toggle, funciona en cualquier product card |
| `FavoritesPage.tsx` | Lista de favoritos con alternativas |
| `FavoriteCard.tsx` | Card: producto + tienda guardada + alternativas más baratas |

### API
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `GET /api/marketplace/favorites` | GET | Favoritos del cliente con precios de todas las tiendas |
| `POST /api/marketplace/favorites` | POST | Agregar/upsert favorito `{ productId, storeId }` |
| `DELETE /api/marketplace/favorites/[id]` | DELETE | Quitar favorito |
| `GET /api/marketplace/favorites/check?productIds=1,2,3` | GET | Check batch para pintar corazones (evita N+1) |

### Reglas de negocio
- Máximo 100 favoritos por cliente
- El corazón aparece en: UnifiedProductCard, detalle de producto, resultados de búsqueda
- Alternativas solo muestran tiendas con stock > 0 y producto activo
- No mostrar alternativa si diferencia < S/0.50
- El endpoint `check` acepta hasta 50 productIds por request (batch)

---

## Feature 3: Comparador de Precios Integrado

### Qué es
No es una página separada. El comparador vive dentro del flujo natural de compra en 3 puntos.

### Modelo de datos
No requiere tablas nuevas. Query que busca el mismo producto (por `name` normalizado o `barcode` compartido) en múltiples tiendas (diferentes `tenantId` → diferentes `Store`).

### Punto 1: Badge en Product Card
```
┌─────────────────────────────┐
│  Arroz Costeño 5kg          │
│  S/19.00 — Buleje           │
│  🏷️ S/1 más barato en luis1 │
│           [Agregar 🛒]      │
└─────────────────────────────┘
```

### Punto 2: Tabla en Detalle del Producto
```
Tienda        Precio    Stock
────────────────────────────
Tienda3       S/18.00   ✓      ← mejor precio (highlight)
luis1         S/18.50   ✓
Buleje        S/19.00   ✓
```

### Punto 3: En Favoritos
(Ya diseñado en Feature 2 — "También en: luis1 S/18.50")

### Componentes
| Componente | Responsabilidad |
|-----------|----------------|
| `PriceBadge.tsx` | Badge en card: "Mejor precio" o "S/X menos en [tienda]" |
| `PriceCompareTable.tsx` | Tabla comparativa en detalle de producto |
| Refactor `PriceCompare.tsx` | Extraer lógica compartida para alimentar ambos componentes |

### API
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `GET /api/marketplace/products/[id]/prices` | GET | Precios en todas las tiendas |
| `GET /api/marketplace/products` | GET | Extender response para incluir `cheapestAlternative` |

### Lógica del Badge
- Producto tiene MEJOR precio → `🏷️ Mejor precio` (verde)
- Hay uno más barato en otra tienda → `🏷️ S/X menos en [tienda]` (naranja)
- Único que lo vende → sin badge
- Diferencia < S/0.50 → sin badge (no vale el ruido visual)

---

## Feature 4: Lista de Compras Semanal

### Qué es
El cliente crea listas de productos reutilizables. "Mi canasta semanal" con 1 click al carrito.

### Modelo de datos (MIGRACIÓN de tablas existentes)

> Las tablas `ShoppingList` y `ShoppingListItem` ya existen en el schema (líneas 901-924).
> Esta feature las **extiende** con nuevos campos.

**Cambios en `ShoppingList`:**
```prisma
model ShoppingList {
  id            String   @id @default(cuid())
  customerPhone String
  name          String
  isDefault     Boolean  @default(false)  // ← NUEVO
  tenantId      String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  customer Customer          @relation(fields: [customerPhone], references: [phone], onDelete: Cascade)
  items    ShoppingListItem[]

  @@index([customerPhone])
  @@index([tenantId])
}
```

**Cambios en `ShoppingListItem`:**
```prisma
model ShoppingListItem {
  id             Int     @id @default(autoincrement())
  shoppingListId String
  productId      Int     // Product.id es Int
  storeId        String? // ← NUEVO: tienda preferida (null = más barata)
  quantity       Int     @default(1)
  notes          String? // ← NUEVO: "marca Gloria, no Ideal"
  sortOrder      Int     @default(0)  // ← NUEVO

  shoppingList ShoppingList @relation(fields: [shoppingListId], references: [id], onDelete: Cascade)
  product      Product      @relation(fields: [productId], references: [id])
  store        Store?       @relation(fields: [storeId], references: [id])

  @@index([shoppingListId])
}
```

**Migración necesaria:**
```sql
ALTER TABLE "ShoppingList" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShoppingListItem" ADD COLUMN "storeId" TEXT;
ALTER TABLE "ShoppingListItem" ADD COLUMN "notes" TEXT;
ALTER TABLE "ShoppingListItem" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
```

### Flujo
1. Pedro va a "Mis listas" → "Nueva lista" → Nombre: "Semanal"
2. Busca productos y agrega: Arroz x2, Aceite x1, Leche x3
3. Cada producto muestra mejor precio disponible
4. Lunes siguiente: abre "Semanal" → "Agregar todo al carrito"
5. Sistema valida stock/precios → agrega items → checkout normal
6. Si algo sin stock → aviso con sugerencia

### Componentes
| Componente | Responsabilidad |
|-----------|----------------|
| `ShoppingListsPage.tsx` | Lista de listas con preview (nombre, # items, total estimado) |
| `ShoppingListDetail.tsx` | Items, cantidades, precios actuales, "Agregar todo al carrito" |
| `AddToListButton.tsx` | Botón en product cards: "Agregar a lista" con selector |
| `ShoppingListModal.tsx` | Modal para crear lista o elegir lista destino |

### API
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `GET /api/marketplace/shopping-lists` | GET | Mis listas |
| `POST /api/marketplace/shopping-lists` | POST | Crear lista |
| `GET /api/marketplace/shopping-lists/[id]` | GET | Detalle con items y precios actuales |
| `PUT /api/marketplace/shopping-lists/[id]` | PUT | Editar nombre/default |
| `DELETE /api/marketplace/shopping-lists/[id]` | DELETE | Eliminar lista |
| `POST /api/marketplace/shopping-lists/[id]/items` | POST | Agregar item |
| `PUT /api/marketplace/shopping-lists/[id]/items/[itemId]` | PUT | Actualizar cantidad/notas |
| `DELETE /api/marketplace/shopping-lists/[id]/items/[itemId]` | DELETE | Quitar item |
| `POST /api/marketplace/shopping-lists/[id]/add-to-cart` | POST | Agregar todos al carrito |

### Reglas de negocio
- Máximo 10 listas por cliente
- Máximo 50 items por lista
- Si storeId es null, usa el precio más barato con stock
- "Agregar todo" valida stock en tiempo real
- Total estimado se recalcula cada vez que se abre la lista

---

## Feature 5: Cupones y Referidos

### Qué es
Extender el sistema de cupones existente + programa de referidos existente con UI de marketplace.

### Modelo de datos (EXTENSIÓN de tablas existentes)

> **Coupon** ya existe (línea 847) con: `id, code, tenantId, storeId, description, discountType ("percent"|"fixed"|"giftcard"), discountValue, balance, minPurchase, maxUses, usedCount, active, expiresAt`.
>
> **Referral** ya existe como raw SQL con: `id, tenantId, referrerId, refereeId, status ("pending"|"rewarded"), rewardCouponId, orderId, createdAt, rewardedAt`.
>
> **`ReferralsDB`** en `lib/db/referrals.db.ts` ya implementa: generateCodeForCustomer, registerReferral, onFirstOrderCompleted, listReferralsByCustomer.

**Cambios en Coupon (additive):**
```sql
ALTER TABLE "Coupon" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'promotional';
-- type: 'welcome' | 'referral' | 'promotional' | 'birthday'
ALTER TABLE "Coupon" ADD COLUMN "maxDiscount" DECIMAL(12,2);
-- tope para descuentos porcentuales
ALTER TABLE "Coupon" ADD COLUMN "createdBy" TEXT;
-- admin que lo creó, null si auto-generado
```

**Nueva tabla CouponRedemption (tracking de uso por usuario):**
```prisma
model CouponRedemption {
  id              String   @id @default(cuid())
  couponId        String
  customerPhone   String   // Customer.phone
  orderId         String?
  discountApplied Decimal  @db.Decimal(12, 2)
  redeemedAt      DateTime @default(now())
  tenantId        String

  coupon   Coupon   @relation(fields: [couponId], references: [id])
  customer Customer @relation(fields: [customerPhone], references: [phone])
  order    Order?   @relation(fields: [orderId], references: [id])
  tenant   Tenant   @relation(fields: [tenantId], references: [id])

  @@index([customerPhone])
  @@index([couponId])
  @@index([tenantId])
}
```

### Cambios en Referral
No se modifica la tabla. Se mantiene la estructura existente. Solo se agrega UI de marketplace que consume `ReferralsDB` existente.

Configuración actual en `referrals.db.ts`:
- Referee: 10% descuento primera compra (cupón auto-generado)
- Referrer: S/10 fijo cuando referee completa primer pedido
- Expiración: 30 días

### Flujo de referidos (ya implementado en backend)
1. Rosa va a "Invitar amigos" → llama `ReferralsDB.generateCodeForCustomer()`
2. Ve su código (base36 8 chars) y comparte link: `buleje.com/r/[CODE]`
3. Lucía abre link → se registra → `ReferralsDB.registerReferral()` crea cupón 10%
4. Lucía hace primera compra → `ReferralsDB.onFirstOrderCompleted()` crea cupón S/10 para Rosa

### Flujo de cupón en checkout (ya implementado en `/api/coupons/validate`)
El endpoint existente ya valida: código existe, activo, no expirado, no agotado, mínimo de compra, calcula descuento por tipo (percent/fixed/giftcard).

**Lo que falta:** validar 1 uso por cliente (con `CouponRedemption`), y registrar la redención.

### Componentes NUEVOS (UI marketplace)
| Componente | Responsabilidad |
|-----------|----------------|
| `MyCouponsPage.tsx` | Lista tabs: Disponibles / Usados / Expirados |
| `CouponCard.tsx` | Card: código, descuento, expiración, condiciones, tipo |
| `ReferralPage.tsx` | Código + link compartible + historial de referidos |
| `CouponInput.tsx` | Input mejorado en checkout con validación inline |
| `ShareReferralButton.tsx` | Share nativo (WhatsApp prioritario, copiar link) |

### API
| Endpoint | Método | Descripción | Estado |
|----------|--------|-------------|--------|
| `POST /api/coupons/validate` | POST | Validar cupón | **Existe** — extender con check 1-uso-por-cliente |
| `GET /api/marketplace/my-coupons` | GET | Mis cupones disponibles/usados/expirados | **Nuevo** |
| `GET /api/marketplace/my-referral` | GET | Mi código + historial referidos | **Nuevo** (consume ReferralsDB) |
| `POST /api/marketplace/referral/register` | POST | Registrar referido en signup | **Nuevo** (consume ReferralsDB) |
| `GET /api/coupons/admin` | GET | Admin: listar cupones | **Existe** |
| `POST /api/coupons/admin` | POST | Admin: crear cupón promocional | **Existe** |

### Tipos de cupón auto-generados
| Tipo | Trigger | Descuento | Expiración |
|------|---------|-----------|------------|
| `welcome` | Registro del cliente | 10% (max S/15) | 30 días |
| `referral` (referee) | Registro via link referido | 10% primera compra | 30 días |
| `referral` (referrer) | Referido completa 1ra compra | S/10 fijo | 30 días |
| `birthday` | Cron nocturno (00:00) busca cumpleaños del día | S/10 fijo | 7 días |

### Reglas de negocio
- 1 cupón por pedido (no acumulables)
- 1 uso por cliente por cupón (validado via CouponRedemption)
- Admin puede desactivar cualquier cupón
- Birthday cron: `POST /api/cron/birthday-coupons` con `CRON_SECRET`

---

## Arquitectura Transversal

### DB Layer (regla CLAUDE.md: nunca Prisma directo)
| Archivo | Feature | Estado |
|---------|---------|--------|
| `lib/db/favorites.db.ts` | Favoritos CRUD + batch check | **Nuevo** |
| `lib/db/shopping-lists.db.ts` | Listas CRUD + add-to-cart | **Nuevo** (o extender si existe) |
| `lib/db/coupons.db.ts` | Cupones + CouponRedemption | **Extender** existente |
| `lib/db/referrals.db.ts` | Referidos | **Existe** — solo consumir |

Todos con: `tenantId` 1er param, cache + audit, safeParse Zod.

### Validación (regla: safeParse Zod)
Schemas en `lib/validations/`:
- `favorite.schema.ts` — productId (number), storeId (string)
- `shopping-list.schema.ts` — name (string, 1-50 chars), items, quantity (1-99)
- `coupon.schema.ts` — code (string, uppercase, 3-20 chars)

### Cache Invalidation
| Acción | Keys invalidadas |
|--------|-----------------|
| Toggle favorito | `favorites:${customerPhone}`, `favorites:check:${customerPhone}` |
| Crear/editar lista | `shopping-lists:${customerPhone}` |
| Usar cupón | `coupons:${customerPhone}`, `coupon:${code}` |
| Nuevo referido | `referrals:${customerPhone}` |

### Multi-tenant
Todas las queries llevan `tenantId` como primer parámetro. Índices compuestos en todas las tablas nuevas.

### Rate Limiting
| Endpoint | Tier | Límite |
|----------|------|--------|
| `POST /api/marketplace/favorites` | Normal | 30/min por IP |
| `POST /api/coupons/validate` | Strict | 10/5min por IP (ya existe) |
| `POST /api/marketplace/referral/register` | Strict | 5/5min por IP |

### Testing
- Unit tests: lógica de validación de cupones (edge cases), lógica de reorder (stock/precio changes)
- Integration tests: flujo completo de referidos (ya parcialmente existente)
- E2E Playwright: flujo "pedir de nuevo" → checkout, flujo favoritos, flujo listas

---

## Fuera de Scope (Ola 2+)

- Sugerencias automáticas de lista basadas en historial (Ola 3)
- Sistema de puntos de fidelización (Ola 3)
- Notificaciones push de cambios de precio en favoritos (Ola 2)
- Reviews con fotos (Ola 2)
- Ofertas flash con timer (Ola 2)
