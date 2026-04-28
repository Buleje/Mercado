# Session Handoff — 2026-04-28

**Branch:** `prod` (33 commits ahead of origin/prod, no pusheado)
**Working tree:** 57 archivos sin commitear (1 staged, 32 modified, 24 untracked)
**Server status:** dev server vivo en `localhost:3000`, todas rutas críticas 200

---

## Lo que se hizo en esta sesión

### Banner Studio (superadmin)
- ✅ Slider de tamaño para botón "Comprar" (no solo producto)
- ✅ Paneles laterales redimensionables (drag) con persistencia localStorage
- ✅ Schema Zod del PUT laxo con `.passthrough()` — antes daba 400 al guardar
- ✅ Errores 400 con `path` detallado para debug
- ✅ Eliminado texto fantasma "(sin producto)" cuando productName está vacío
- Archivos: `components/superadmin/banners/BannerPreviewStudio.tsx`, `app/api/superadmin/banners/route.ts`, `components/marketplace/PromoBannerRenderer.tsx`, `lib/promo-banners.ts`, `app/superadmin/banners/page.tsx`

### Ofertas reales (no más mocks)
- ✅ Endpoint `/api/marketplace/deals` con filtros (category/sort/limit/minDiscount/fallbackToLowest)
- ✅ Página `/marketplace/ofertas` con grid 5 cols + UnifiedProductCard + carrito + modal
- ✅ Hook compartido `use-marketplace-deals.ts` con cache sessionStorage TTL 60s
- ✅ Empty state con CTA "Sos bodeguero · Crear mi tienda"
- ✅ 3 secciones home (OfertasFlashSection, OfertasEditorial, ExplorarTileGrid) migradas → ocultas si no hay deals
- Archivos nuevos: `app/api/marketplace/deals/`, `hooks/use-marketplace-deals.ts`
- ADR pendiente migration: `docs/adr/081-store-product-discount-fields.md`

### Página `/marketplace/como-pagar` (nueva)
- Hero + 5 métodos (Yape, Plin, Efectivo, Transferencia, Tarjeta) + FAQ + CTA
- Link agregado al nav primario MarketplaceNavbar
- Card "Pagá como prefieras" en TiendasPromoCards apunta acá
- Archivos: `app/marketplace/como-pagar/page.tsx`, `components/marketplace/como-pagar/ComoPagarClient.tsx`

### Nav: "Tienda · Ofertas · Cómo pagar"
- DEFAULT_NAV_LINKS reordenado, label "Comprar" → "Tienda"
- Case `como-pagar` agregado en Header.tsx (desktop + mobile)
- `lib/i18n/translations.ts`: nav.howToPay agregado

### Descripciones únicas por bodega
- `lib/store-tagline.ts` con pools por categoría (bodega, polleria, restaurante, etc.)
- Hash determinístico por slug → siempre la misma frase
- Aplicado en: storefront hero, generateMetadata, JSON-LD, ItemListJsonLd marketplace

### Footer + SEO Ciudad Constitución / Pucallpa
- Footer: "Hecho en Ciudad Constitución, Perú · Pucallpa próximamente"
- JSON-LD: foundingLocation + address[] con ambas ciudades + areaServed
- metadata `/tiendas` actualizada
- Sitemap incluye `/tiendas`, `/marketplace/ofertas`, `/marketplace/como-pagar`, `/marketplace/explorar`

### Bug back-nav `/tiendas`
- 3 listeners: popstate + pageshow.persisted + visibilitychange
- Mount-time recovery + safety net 4.5s
- `router.refresh()` + retry combinado

### Bulk Import productos (admin)
- Endpoint `POST /api/admin/products/bulk-import` con Zod, dedup, batch 50
- Parser CSV propio (`lib/csv/parse-products.ts`) con auto-detect separador y aliases ES/EN
- Modal UI `components/admin/BulkImportModal.tsx` drag-drop + preview + errores
- Botón "Importar en masa" en ProductsAdminTab (junto a CSV legacy y Excel)

### Geo-detection silenciosa
- Auto-fetch coords solo si `Permissions API state="granted"` (no insiste con prompt)
- Cache sessionStorage TTL 1h
- Silent fail (sin alert invasivo)

### Store Analytics módulo
- Endpoint `/api/admin/store-analytics?days=7|30|90`
- Componente `StoreAnalyticsModule.tsx`: 4 KPIs + sparkline SVG + funnel + top10 views/revenue
- Página `/admin/store-analytics`
- Tracking automático: `lib/analytics.ts` ahora dispara fire-and-forget desde trackProductView/AddToCart/Purchase
- Endpoint batch `/api/marketplace/analytics/track-batch` (creado, antes faltaba)

### ⚠️ Schema Drift descubierto
- Tabla `ProductAnalytics` en DB de prod NO tiene `clicks`, `addsToCart`, `conversions`, `revenue` ni la UNIQUE
- Mitigación: `lib/db/product-analytics.db.ts` con detección dinámica de columnas + fallback sin ON CONFLICT
- Documentado en `docs/SCHEMA-DRIFT.md` con SQL listo para aplicar
- Track funciona pero todos los eventos van a `views++` por ahora

### Reseñas reales (no más mocks)
- DB class `lib/db/store-reviews.db.ts` lee de tabla `Review` con summary calculado
- Storefront `/marketplace/[slug]` usa StoreReviewsDB
- Empty state honesto cuando no hay reviews
- Form `LeaveReviewForm.tsx` para que el cliente deje review (POST a endpoint preexistente)
- Tab admin `/admin/store-reviews` con moderación (approve/reject/hide/reply)
- Endpoint admin `/api/admin/store-reviews` (GET filtrable + PATCH discriminated union)

---

## Estado del proyecto

### Server health (verificado con curl al final de sesión)
| Ruta | Status |
|---|---|
| `/`, `/tiendas`, `/marketplace`, `/marketplace/ofertas`, `/marketplace/como-pagar`, `/marketplace/explorar`, `/marketplace/[slug]` | 200 ✅ |
| `/admin/store-analytics`, `/admin/store-reviews` | 200 (con auth) ✅ |
| `/api/marketplace/deals`, `/api/marketplace/stores`, `/api/marketplace/promo-banners` | 200 ✅ |
| `/api/admin/store-analytics`, `/api/admin/store-reviews` | 401 sin auth (correcto) ✅ |

### Memoria persistente del agente
- `~/.claude/projects/-home-usuario-proyectos-Mercado/memory/feedback_always_test.md` — siempre testear con curl + render + tail logs antes de reportar listo

---

## Pendientes / Bloqueados

### 🔴 Bloqueado por DIRECT_URL
1. **Migration ADR-081** (StoreProduct.discountPrice + discountUntil + discountLabel) — requiere `prisma migrate deploy` con DIRECT_URL accesible
2. **Schema drift fix ProductAnalytics** — ALTER TABLE para columnas faltantes (`docs/SCHEMA-DRIFT.md` tiene SQL listo)

### 🟡 Próximas mejoras lógicas
1. Renderizar `adminReply` en ReviewCard pública (hoy solo se ve en admin)
2. Notificación WhatsApp al bodeguero cuando llega review nueva
3. Bulk actions en admin de reviews (seleccionar varias y aprobar/rechazar todas)
4. Filtro "Solo de mi tienda" cuando admin tiene multi-stores
5. Eliminar `lib/mock-deals.ts` por completo (3 consumers ya migrados)
6. Form CSV bulk-import: completar UI con tab "Plantillas" para diferentes tipos
7. Service worker + push notifications de oferta favorita

### 🟢 Discusión estratégica abierta
Brandon planteó:
- Idea de dropshipping local con bodegas en Pucallpa, margen S/100-200/venta
- Consulta sobre SEO rápido en Pucallpa
- **Recomendación dada: NO dropshipping bodega** (alta fuga de cliente). En su lugar: **pre-venta nicho premium** (repuestos moto, pesca, electrónica usada, equipo bodega, suplementos).
- Brandon va a configurar single-tenant mode para SU tienda personal (no marketplace ni venta a bodegueros)
- Cuentas reales: pre-venta puede dar S/600-1k mes 1, S/2.5-5k mes 3, S/8-15k mes 6 con repuestos moto u otro nicho específico

---

## Estrategia de commits sugerida

Cuando vuelvas, agrupá en 7 commits semánticos:

```bash
# 1. Banner Studio fixes
git add app/api/superadmin/banners/route.ts \
        app/superadmin/banners/page.tsx \
        components/superadmin/banners/BannerPreviewStudio.tsx \
        components/marketplace/PromoBannerRenderer.tsx \
        lib/promo-banners.ts \
        lib/data/promo-banners.json \
        public/uploads/banners-tiendas-hero/
git commit -m "feat(superadmin/banners): resize button + side panels drag + zod passthrough fix 400"

# 2. Ofertas reales + endpoint /deals + page como-pagar
git add app/api/marketplace/deals/ \
        app/marketplace/como-pagar/ \
        components/marketplace/como-pagar/ \
        components/marketplace/ofertas/ \
        components/marketplace/home/Ofertas*.tsx \
        components/marketplace/explorar/ExplorarTileGrid.tsx \
        components/marketplace/TiendasPromoCards.tsx \
        hooks/use-marketplace-deals.ts \
        lib/mock-deals.ts
git commit -m "feat(marketplace): real deals from DB + /como-pagar page + 5col grid + empty CTA"

# 3. Nav + i18n
git add components/Header.tsx \
        components/marketplace/MarketplaceNavbar.tsx \
        contexts/settings-context.tsx \
        lib/i18n/translations.ts
git commit -m "feat(nav): add Tienda + Ofertas + Cómo pagar links across primary nav"

# 4. SEO + ciudades + tagline única
git add app/\(store\)/about/page.tsx \
        app/\(store\)/page.tsx \
        app/marketplace/page.tsx \
        app/marketplace/\[slug\]/page.tsx \
        app/tiendas/ \
        app/sitemap.ts \
        components/Footer.tsx \
        components/marketplace/store-detail/StoreDetailClient.tsx \
        lib/store-tagline.ts
git commit -m "feat(seo): Ciudad Constitución + Pucallpa próximamente + unique tagline per bodega"

# 5. Reviews reales + form + admin
git add app/admin/store-reviews/ \
        app/api/admin/store-reviews/ \
        components/admin/StoreReviewsAdminModule.tsx \
        components/marketplace/store-detail/StoreReviews.tsx \
        components/marketplace/store-detail/LeaveReviewForm.tsx \
        lib/db/store-reviews.db.ts \
        lib/mock-store-reviews.ts
git commit -m "feat(reviews): real reviews from Review table + leave-review form + admin moderation"

# 6. Analytics + bulk import
git add app/admin/store-analytics/ \
        app/api/admin/store-analytics/ \
        app/api/admin/products/bulk-import/ \
        app/api/marketplace/analytics/track-batch/ \
        components/admin/BulkImportModal.tsx \
        components/admin/StoreAnalyticsModule.tsx \
        components/admin/ProductsAdminTab.tsx \
        lib/analytics.ts \
        lib/csv/ \
        lib/db/product-analytics.db.ts
git commit -m "feat(admin): store analytics module + product bulk CSV import + auto event tracking"

# 7. Bug fixes + ADR + schema drift docs
git add app/tiendas/TiendasClient.tsx \
        components/marketplace/useMarketplaceGeo.ts \
        app/api/marketplace/stores/\[slug\]/products/route.ts \
        docs/adr/081-store-product-discount-fields.md \
        docs/SCHEMA-DRIFT.md
git commit -m "fix: back-nav recovery + silent geo + ADR-081 + schema drift mitigation"
```

---

## Para arrancar la próxima sesión

1. Lee este SESSION_HANDOFF.md
2. `git status` para confirmar lo no commiteado
3. Decidir camino:
   - **Camino A — commitear todo:** ejecutar script de 7 commits arriba
   - **Camino B — single-tenant mode personal:** activar flag para que sea TU tienda, definir nicho, subir 20 productos reales con foto propia, configurar Google Business Profile
   - **Camino C — fix schema drift:** conseguir red con acceso Supabase, correr migrations bloqueadas, revertir mitigaciones defensive

---

## Archivos sin commitear

### Modified (32)
```
app/(store)/about/page.tsx
app/(store)/page.tsx
app/api/marketplace/stores/[slug]/products/route.ts
app/api/superadmin/banners/route.ts
app/marketplace/[slug]/page.tsx
app/marketplace/page.tsx
app/sitemap.ts
app/superadmin/banners/page.tsx
app/tiendas/TiendasClient.tsx
app/tiendas/page.tsx
components/Footer.tsx
components/Header.tsx
components/admin/ProductsAdminTab.tsx
components/marketplace/MarketplaceNavbar.tsx
components/marketplace/PromoBannerRenderer.tsx
components/marketplace/TiendasPromoCards.tsx
components/marketplace/explorar/ExplorarTileGrid.tsx
components/marketplace/home/OfertasEditorial.tsx
components/marketplace/home/OfertasFlashSection.tsx
components/marketplace/ofertas/DealsGrid.tsx
components/marketplace/ofertas/OfertasClient.tsx
components/marketplace/store-detail/StoreDetailClient.tsx
components/marketplace/store-detail/StoreReviews.tsx
components/marketplace/useMarketplaceGeo.ts
components/superadmin/banners/BannerPreviewStudio.tsx
contexts/settings-context.tsx
lib/analytics.ts
lib/data/promo-banners.json
lib/db/product-analytics.db.ts
lib/i18n/translations.ts
lib/mock-deals.ts
lib/mock-store-reviews.ts
lib/promo-banners.ts
```

### Untracked (24)
```
app/admin/store-analytics/
app/admin/store-reviews/
app/api/admin/products/bulk-import/
app/api/admin/store-analytics/
app/api/admin/store-reviews/
app/api/marketplace/analytics/track-batch/
app/api/marketplace/deals/
app/api/superadmin/banners/copy-suggest/  ← preexistente
app/marketplace/como-pagar/
components/admin/BulkImportModal.tsx
components/admin/StoreAnalyticsModule.tsx
components/admin/StoreReviewsAdminModule.tsx
components/marketplace/como-pagar/
components/marketplace/store-detail/LeaveReviewForm.tsx
docs/SCHEMA-DRIFT.md
docs/adr/081-store-product-discount-fields.md
hooks/use-marketplace-deals.ts
lib/csv/
lib/db/store-reviews.db.ts
lib/store-tagline.ts
public/uploads/banners-tiendas-hero/*.webp  ← imágenes subidas vía editor
```
