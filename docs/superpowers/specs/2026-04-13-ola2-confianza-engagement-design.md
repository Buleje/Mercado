# Ola 2: Confianza y Engagement — Design Spec

**Fecha:** 2026-04-13
**Autor:** Brandon + Claude
**Estado:** Aprobado
**Objetivo:** Generar confianza visual y visitas diarias al marketplace.

---

## Resumen Ejecutivo

5 features que atacan confianza del comprador y retorno diario:

| # | Feature | Esfuerzo | Dependencias |
|---|---------|----------|-------------|
| 1 | Ofertas Flash / Deals del Día | Medio | Nueva tabla FlashDeal + cron |
| 2 | Reviews con fotos reales | Bajo | Extender Review existente + upload |
| 3 | Categorías con imágenes reales | Bajo | Extender UI existente (sin DB changes) |
| 4 | Stories de tiendas | Medio | Nueva tabla StoreStory |
| 5 | Recetas con "Comprar ingredientes" | Medio | Extender Receta existente + cart integration |

**Orden:** 3 → 2 → 5 → 1 → 4 (de menor a mayor esfuerzo).

---

## Identidad del Sistema (heredado de Ola 1)

- Cliente: `Customer` con `phone String @id`
- Producto: `Product` con `id Int`
- Review: ya existe con `photosJson String?`, `verified Boolean`, `status String`
- Upload: ya existe en `/api/upload` con Supabase bucket `media`, solo admin
- Receta: `Receta` + `RecetaIngrediente` ya existen con `productoId` → `Product`

---

## Feature 1: Ofertas Flash / Deals del Día

### Qué es
Banner rotativo en landing y marketplace con productos en oferta con countdown timer. Genera urgencia y visitas recurrentes — "mejor entro a ver qué oferta hay hoy".

### Modelo de datos (tabla NUEVA)
```prisma
model FlashDeal {
  id            String   @id @default(cuid())
  tenantId      String
  productId     Int
  storeId       String
  originalPrice Decimal  @db.Decimal(12, 2)
  dealPrice     Decimal  @db.Decimal(12, 2)
  maxUnits      Int?     // null = ilimitado
  soldUnits     Int      @default(0)
  startsAt      DateTime
  endsAt        DateTime
  active        Boolean  @default(true)
  featured      Boolean  @default(false) // aparece en banner principal
  createdBy     String?  // admin que lo creó
  createdAt     DateTime @default(now())

  product Product @relation(fields: [productId], references: [id])
  store   Store   @relation(fields: [storeId], references: [id])
  tenant  Tenant  @relation(fields: [tenantId], references: [id])

  @@index([tenantId, active])
  @@index([endsAt])
  @@index([storeId])
}
```

### Decisiones
- **Duración por defecto:** 24 horas (configurable al crear)
- **Máximo activas por tienda:** 5 simultáneas (evita saturación)
- **Descuento mínimo:** 10% (si no es real deal, no se muestra)
- **Auto-desactivación:** Cron cada hora desactiva deals expirados
- **Quien crea:** El admin de cada tienda desde su panel. El superadmin puede crear deals globales (featured=true)

### Flujo
```
Admin crea deal: Arroz Costeño 5kg de S/22 a S/18.90 por 24h
  → Aparece en:
    1) Banner hero del marketplace (si featured=true): countdown + imagen + precio tachado
    2) Sección "Ofertas del día" debajo del hero: grid de deal cards
    3) Badge en la UnifiedProductCard: "🔥 -14% · Quedan 3h"
  → Cuando el timer llega a 0 o se agotan las unidades → deal desaparece
  → Si hay maxUnits, muestra barra de progreso: "12 de 20 vendidos"
```

### Componentes
| Componente | Responsabilidad |
|-----------|----------------|
| `FlashDealBanner.tsx` | Banner principal con countdown, carousel de deals featured |
| `FlashDealCard.tsx` | Card individual: imagen, precio tachado, deal price, timer, barra progreso |
| `FlashDealBadge.tsx` | Badge en UnifiedProductCard: "🔥 -X%" con mini-timer |
| `FlashDealsSection.tsx` | Sección "Ofertas del día" con grid de FlashDealCard |
| `CountdownTimer.tsx` | Timer reutilizable: DD:HH:MM:SS con colores según urgencia |

### API
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `GET /api/marketplace/flash-deals` | GET | Deals activos (público) |
| `GET /api/marketplace/flash-deals/featured` | GET | Deals featured para banner (público) |
| `POST /api/marketplace/flash-deals` | POST | Crear deal (admin tienda) |
| `PUT /api/marketplace/flash-deals/[id]` | PUT | Editar deal (admin tienda) |
| `DELETE /api/marketplace/flash-deals/[id]` | DELETE | Desactivar deal (admin tienda) |
| `GET /api/cron/expire-flash-deals` | GET | Cron: desactivar deals expirados (Vercel cron usa GET) |

### Reglas de negocio
- Deal price debe ser >= 10% menos que originalPrice
- Solo productos con stock > 0 y active=true
- Si maxUnits definido, incrementar soldUnits **atómicamente**: `UPDATE "FlashDeal" SET "soldUnits" = "soldUnits" + 1 WHERE id = $1 AND ("maxUnits" IS NULL OR "soldUnits" < "maxUnits")` — verificar affected rows > 0
- Timer muestra rojo cuando quedan < 1h
- Máximo 3 featured simultáneos (para el banner)
- **Coexistencia:** FlashDeal es SEPARADO de Promotion y Bundle/BundleItem. FlashDeal es para deals visuales con countdown en el marketplace (UI-driven). Promotion es para descuentos admin internos. Si un producto tiene FlashDeal activo y una Promotion, el FlashDeal price toma prioridad en el marketplace

---

## Feature 2: Reviews con Fotos Reales

### Qué es
Permitir que el comprador suba fotos del producto recibido con su review. Ya existe el modelo Review con `photosJson` y el sistema de reviews verificadas — solo falta la UI de upload para el cliente marketplace.

### Modelo de datos (SIN cambios)
- `Review.photosJson` ya existe como `String?` — almacena JSON array de URLs
- `Review.verified` ya existe
- `ReviewsMarketplaceDB` ya tiene `createVerified()`
- `photo-filters.ts` ya tiene query helpers para filtrar por foto

### Lo que ya existe
- `POST /api/marketplace/reviews/upload` — **ya existe** (público, rate-limited por IP, usa bucket `media`, resize 800px WebP via sharp)
- `POST /api/marketplace/reviews` — ya acepta `photosJson` como string

### Lo que falta
1. **Agregar auth a upload endpoint** — actualmente público, agregar `requireCustomer()` para seguridad (verificar `customerId` definido)
2. **UI de upload en el formulario de review** — drag & drop o seleccionar fotos
3. **Galería de fotos en reviews** — mostrar las fotos con lightbox

### Decisiones
- **Máximo 3 fotos por review** (limita storage, suficiente para mostrar producto)
- **Máximo 2MB por foto** (comprimidas client-side antes de upload)
- **Formato:** solo JPEG/PNG/WebP
- **Resize:** ya funciona — server-side a max 800px wide vía sharp
- **Storage:** Bucket `media` existente (no crear bucket separado — simplificar)
- **Moderación:** fotos heredan el status de la review (pending → approved)
- **Auth:** `requireCustomer()` + verificar `customerId` definido (no undefined). Si `customerId` es undefined, retornar 400 "Vincula tu teléfono primero"

### Flujo
```
Rosa recibe su pedido → va a "Mis pedidos" → click "Calificar"
  → Formulario: estrellas + texto + [Subir fotos] (max 3)
  → Arrastra/selecciona fotos → preview con thumbnails
  → Envía → review queda como pending + verified
  → Admin modera → approved → fotos visibles públicamente
  → En la tienda, otros ven: "⭐⭐⭐⭐⭐ Rosa L. · Compra verificada ✓ · 📷 3 fotos"
  → Click en foto → lightbox fullscreen
```

### Componentes
| Componente | Responsabilidad |
|-----------|----------------|
| `ReviewPhotoUpload.tsx` | Drag & drop / file picker, preview, max 3, client-side compress |
| `ReviewPhotoGallery.tsx` | Grid de thumbnails + lightbox al click |
| `ReviewForm.tsx` | Formulario completo: rating + texto + fotos + submit |
| Modificar `StoreDetail.tsx` | Mostrar fotos en las reviews existentes |

### API
| Endpoint | Método | Descripción | Estado |
|----------|--------|-------------|--------|
| `POST /api/marketplace/reviews` | POST | Crear review | **Existe** — ya acepta photosJson |
| `POST /api/marketplace/reviews/upload` | POST | Upload foto de review | **Existe** — agregar `requireCustomer()` auth |
| `GET /api/marketplace/reviews` | GET | Listar reviews | **Existe** — ya retorna photosJson |

### Reglas de negocio
- Solo clientes con pedido entregado pueden subir fotos
- Fotos se suben primero, luego se linkean al crear la review
- Si la review es rechazada, las fotos se mantienen pero no son públicas
- Rate limit: 10 uploads por hora por customer

---

## Feature 3: Categorías con Imágenes Reales

### Qué es
Reemplazar los emojis de las categorías del landing y marketplace por fotos reales de productos de bodega peruana. Cero cambios de DB — solo assets y UI.

### Decisiones
- **12 categorías actuales** con emoji → reemplazar por imagen real
- **Imágenes:** fotos profesionales de productos peruanos representativos
- **Formato:** WebP, 400x300px, optimizadas < 50KB cada una
- **Fallback:** si imagen no carga, mostrar emoji actual
- **Storage:** `/public/images/categories/` (estáticas, no necesitan Supabase)

### Mapeo de categorías
| Categoría | Emoji actual | Imagen propuesta |
|-----------|-------------|-----------------|
| Bodegas | 🏪 | Estante de bodega con productos variados |
| Restaurantes | 🍔 | Plato de lomo saltado |
| Licorería | 🍺 | Cervezas peruanas (Cusqueña, Pilsen) |
| Farmacia | 💊 | Estante de farmacia organizado |
| Frutas y Verduras | 🥦 | Canasta de frutas tropicales |
| Panadería | 🍞 | Pan francés recién horneado |
| Limpieza | 🧹 | Productos de limpieza (Sapolio, etc) |
| Mascotas | 🐾 | Bolsa de comida para perro |
| Carnicería | 🥩 | Cortes de carne en vitrina |
| Congelados | 🧊 | Helados y productos congelados |
| Snacks | 🍿 | Variedad de galletas y dulces peruanos |
| Cuidado Personal | 🧴 | Shampoo, jabón, crema dental |

### Implementación
No requiere nuevos modelos. Solo:
1. Generar/obtener 12 imágenes optimizadas
2. Crear mapa `CATEGORY_IMAGES` en la landing
3. Modificar las cards de categoría para usar `<Image>` con fallback a emoji
4. Aplicar mismo tratamiento en MarketplaceFilters

### Componentes a modificar
| Archivo | Cambio |
|---------|--------|
| `app/(marketing)/page.tsx` o componente de categorías del landing | Reemplazar emoji por `<Image>` |
| `components/marketplace/MarketplaceFilters.tsx` | Agregar imágenes a filtros de categoría |

### Generación de imágenes
Usar AI (DALL-E/Midjourney) o fotos stock peruanas. Formato final: WebP 400x300, quality 80, < 50KB. Se guardan en `/public/images/categories/{slug}.webp`.

---

## Feature 4: Stories de Tiendas

### Qué es
Círculos estilo Instagram en la parte superior del marketplace. Las tiendas publican actualizaciones: "Llegó fruta fresca", "Promo cerveza hoy", "Nuevo producto". Genera visitas diarias por curiosidad.

### Modelo de datos (tabla NUEVA)
```prisma
model StoreStory {
  id        String   @id @default(cuid())
  tenantId  String
  storeId   String
  type      String   @default("update") // update | promo | new_product | announcement
  title     String   // "Llegó fruta fresca"
  imageUrl  String?  // foto opcional
  productId Int?     // producto linkado (opcional)
  linkUrl   String?  // URL personalizada
  viewCount Int      @default(0)
  active    Boolean  @default(true) // admin puede ocultar manualmente
  expiresAt DateTime // auto-expira (default 24h)
  createdAt DateTime @default(now())

  store   Store    @relation(fields: [storeId], references: [id])
  tenant  Tenant   @relation(fields: [tenantId], references: [id])
  product Product? @relation(fields: [productId], references: [id])

  @@index([tenantId, expiresAt])
  @@index([storeId])
}
```

### Decisiones
- **Duración:** 24 horas por defecto (como Instagram Stories)
- **Máximo por tienda:** 5 stories activas simultáneas
- **Quién crea:** Admin de tienda desde su panel
- **Vista:** círculo con logo de tienda + borde colorido si tiene stories nuevas
- **Al abrir:** slideshow tipo Instagram con swipe/tap para avanzar
- **Auto-limpieza:** Cron borra stories > 7 días

### Flujo
```
Admin de "Buleje" va a su panel → "Nueva Story"
  → Selecciona tipo: "Nuevo producto" 
  → Título: "Llegaron mangos frescos 🥭"
  → Sube foto del mango
  → Linkea al producto "Mango Kent" del catálogo
  → Publica → story aparece en el marketplace

Cliente abre marketplace:
  → Ve círculos arriba: [Buleje🔵] [luis1] [Tienda3]
  → Borde azul = tiene stories no vistas
  → Click en Buleje → slideshow:
    "Llegaron mangos frescos 🥭" [foto] [Ver producto →]
  → Click "Ver producto" → navega a /marketplace/main?product=mango-kent
  → Story marca como "vista" para ese cliente
```

### Componentes
| Componente | Responsabilidad |
|-----------|----------------|
| `StoreStoriesBar.tsx` | Barra horizontal de círculos de tiendas con stories |
| `StoreStoryCircle.tsx` | Círculo individual: logo, borde si tiene no-vistas |
| `StoryViewer.tsx` | Slideshow fullscreen: imagen, título, link, timer, swipe |
| `StoryCreateForm.tsx` | Formulario admin: tipo, título, foto, producto link |

### API
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `GET /api/marketplace/stories` | GET | Stories activas agrupadas por tienda (público) |
| `POST /api/marketplace/stories/[id]/view` | POST | Registrar vista |
| `POST /api/marketplace/stories` | POST | Crear story (admin tienda) |
| `DELETE /api/marketplace/stories/[id]` | DELETE | Eliminar story (admin tienda) |
| `GET /api/cron/cleanup-stories` | GET | Cron: borrar stories > 7 días (Vercel cron usa GET) |

### Tracking de vistas
Para no crear otra tabla, las vistas por cliente se trackean en localStorage: `story-views:${customerPhone}` = Set de story IDs vistos. El `viewCount` del modelo es un counter global (para analytics del admin), no per-customer.

### Reglas de negocio
- Solo tiendas con `isPublished: true` muestran stories
- Stories sin imagen usan gradiente con emoji según tipo
- El borde del círculo solo aparece colorido si tiene stories que el cliente no vio
- Auto-expire: `expiresAt = createdAt + 24h` por defecto

---

## Feature 5: Recetas con "Comprar Ingredientes"

### Qué es
Mejorar la página de recetas existente con un botón "Agregar ingredientes al carrito" que matchea ingredientes con productos reales del catálogo.

### Modelo de datos (SIN cambios principales)
- `Receta` ya existe con `nombre`, `descripcion`, `ingredientes[]`
- `RecetaIngrediente` ya tiene `productoId Int` → `Product`
- El endpoint `/api/recetas/publicas` ya retorna recetas con ingredientes y productos linkeados

### Lo que falta
1. **Campos de presentación** en Receta: `emoji`, `tiempoMinutos`, `porciones`, `dificultad`, `categoria`, `pasos`, `imageUrl`
2. **Botón "Agregar ingredientes al carrito"** que suma productos con stock
3. **Indicador de disponibilidad**: "8 de 10 ingredientes disponibles"
4. **Página de receta individual** con paso a paso

### Decisiones
- **Campos nuevos en Receta** (agregar a `prisma/schema.prisma`, luego `npx prisma migrate dev`):
  ```prisma
  // Agregar al model Receta:
  emoji         String?
  tiempoMinutos Int?
  porciones     Int?
  dificultad    String?  @default("Facil")
  categoria     String?  @default("platos-de-fondo")
  pasosJson     String?  // JSON array de strings
  imageUrl      String?
  ```
  > **Nota:** `RecetarioClient.tsx` ya define estos campos en su tipo TypeScript como opcionales — el frontend ya está preparado.
- **Disponibilidad:** solo cuenta ingredientes con `productoId` linkado y stock > 0
- **Precio estimado:** suma precios de ingredientes disponibles
- **Si un ingrediente no tiene stock:** muestra tachado con "Sin stock" pero no bloquea agregar el resto

### Flujo
```
Cliente abre /marketplace/recetas → ve grid de recetas con fotos
  → "Ceviche 🐟 · 30 min · 4 porciones · Fácil · S/25 estimado"
  → "9/10 ingredientes disponibles"
  → Click → página individual:
    - Foto grande + descripción
    - Lista de ingredientes con checkbox, precio, stock
    - Pasos: 1, 2, 3...
    - [Agregar ingredientes al carrito] → solo los disponibles
  → Click "Agregar" → modal confirma: "8 productos agregados (2 sin stock)"
  → Items van al carrito → checkout normal
```

### Componentes
| Componente | Responsabilidad |
|-----------|----------------|
| `RecipeCard.tsx` | Card: foto, nombre, tiempo, porciones, dificultad, costo, disponibilidad |
| `RecipeDetail.tsx` | Página individual: ingredientes con check, pasos, botón agregar |
| `RecipeIngredientList.tsx` | Lista de ingredientes con estado de stock y checkbox |
| `AddIngredientsButton.tsx` | Botón que agrega productos disponibles al carrito |
| Modificar `RecetarioClient.tsx` | Usar nuevos componentes, mejorar layout |

### API
| Endpoint | Método | Descripción | Estado |
|----------|--------|-------------|--------|
| `GET /api/recetas/publicas` | GET | Lista recetas con ingredientes | **Existe** — ya funciona |
| `GET /api/recetas/[id]` | GET | Detalle de receta | **Existe** — verificar respuesta |
| `GET /api/marketplace/recetas` | GET | Nuevo endpoint marketplace con precios/stock actualizados | **Nuevo** |

> **Nota:** NO crear `POST /api/marketplace/recetas/[id]/add-to-cart`. El carrito es client-side (`useCart().addItem()`). `RecetarioClient.tsx` ya implementa `handleAddAll()` que agrega ingredientes al carrito. El botón "Agregar ingredientes" reutiliza esa lógica existente.

### Reglas de negocio
- Solo recetas con `activa: true`
- Precio estimado = suma de `product.price` de ingredientes con `productoId` linkado
- Disponibilidad = ingredientes con stock > 0 / total ingredientes
- Al agregar al carrito, saltar ingredientes sin stock (con aviso)
- Si 0 ingredientes disponibles → botón deshabilitado: "Ingredientes no disponibles"

---

## Relaciones Prisma (back-references requeridas)

Los nuevos modelos requieren arrays de back-referencia en modelos existentes:

| Modelo existente | Agregar |
|-----------------|---------|
| `Product` | `flashDeals FlashDeal[]`, `stories StoreStory[]` |
| `Store` | `flashDeals FlashDeal[]`, `stories StoreStory[]` |
| `Tenant` | `flashDeals FlashDeal[]`, `stories StoreStory[]` |

> `prisma/schema.prisma` es **zona de peligro** — requiere review de security.

---

## Arquitectura Transversal

### DB Layer (nuevos archivos)
| Archivo | Feature | Estado |
|---------|---------|--------|
| `lib/db/flash-deals.db.ts` | Ofertas flash CRUD + expiración | **Nuevo** |
| `lib/db/stories.db.ts` | Stories CRUD + agrupado por tienda | **Nuevo** |
| `lib/db/reviews.db.ts` | Reviews marketplace | **Existe** — extender con upload helper |
| `lib/db/recetas.db.ts` | Recetas marketplace | **Nuevo** (wrapper sobre Receta existente) |

### Upload para clientes
Nuevo endpoint `POST /api/marketplace/reviews/upload`:
- Acepta `multipart/form-data` con max 3 files
- Requiere `requireCustomer()` (no requireAdmin)
- Supabase bucket: `review-photos`
- Resize via sharp: max 800px width, WebP output
- Rate limit: 10 uploads/hora/customer
- Retorna array de URLs

### Cache
| Acción | Keys invalidadas |
|--------|-----------------|
| Crear/editar flash deal | `flash-deals:${tenantId}`, `flash-deals:featured` |
| Crear/eliminar story | `stories:${tenantId}` |
| Crear review con fotos | `reviews:${storeId}` |
| Actualizar receta | `recetas:marketplace` |

### Cron Jobs (agregar a vercel.json)
| Cron | Schedule | Endpoint |
|------|----------|----------|
| Expirar flash deals | Cada hora | `GET /api/cron/expire-flash-deals` |
| Limpiar stories viejas | Diario 3am | `GET /api/cron/cleanup-stories` |

> Ambos crons deben iterar tenants: `prisma.tenant.findMany({ where: { active: true } })`. Autenticación via `CRON_SECRET` en header Authorization.

---

## Fuera de Scope (Ola 3)

- Tracking de pedido en tiempo real
- Notificaciones push
- Slots de delivery por zona
- Búsqueda por voz
- Ruleta de fidelización
- Sugerencias automáticas de lista
