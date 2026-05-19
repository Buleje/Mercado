# Audit Storefront Público — SEO, Performance, Accesibilidad, Mobile

**Fecha:** 2026-05-17 · **Agente:** Performance Engineer

---

## Resumen ejecutivo

El storefront tiene buenas bases (RSC por defecto, `"use cache"` activo en home, sitemap completo, skip-link, JSON-LD en pages clave). Los problemas críticos se concentran en tres áreas: imágenes sin `priority` en LCP above-the-fold, dos pages de alta tráfico que inyectan todo su JS en el cliente innecesariamente, y el tenant storefront que carga fuentes de Google Fonts sin preload (bloquea render por tercero).

---

## P0 — Críticos (LCP / render blocking / SEO duro)

| # | Hallazgo | Archivo:línea | Impacto | Fix |
|---|----------|--------------|---------|-----|
| P0-01 | **`<img>` raw en tenant hero** — logo del tenant con `<img>` nativo (no `next/image`), sin lazy, sin preload, sin `sizes` | `app/t/[slug]/page.tsx:369,391` | LCP +400ms en móvil, sin optimización Vercel | Reemplazar con `<Image>` de `next/image`, `priority` en desktop, `loading="lazy"` en móvil |
| P0-02 | **Google Fonts inline sin preload** — `<link rel="stylesheet">` síncrono a `fonts.googleapis.com` en cada render del tenant storefront | `app/t/[slug]/page.tsx:226-229` | Render-blocking request HTTP en red lenta (3G: +600-900ms LCP) | Usar `next/font/google` con el font como variable CSS, o al menos agregar `rel="preload"` + `as="style"` + `onLoad` swap |
| P0-03 | **MarketplaceContent es "use client" completo** — el hub `/marketplace` envía todo su JS al cliente a pesar de ser principalmente contenido estático | `components/marketplace/MarketplaceContent.tsx:1` | Bundle extra ~40-80KB en first paint de la page con más tráfico | Partir en RSC shell + "use client" solo para filtros/búsqueda |
| P0-04 | **ExplorarClient es "use client" con 306 líneas** — `/marketplace/explorar` es contenido estático (categorías, CTAs, HowItWorks) pero se hidrata completamente | `components/marketplace/explorar/ExplorarClient.tsx:1` | TTI +300ms en móvil low-end; sin necesidad real de interactividad | Mover secciones estáticas (Hero, TrustStrip, HowItWorks) a RSC; solo useEffect sección final |
| P0-05 | **PDP hace `fetch()` HTTP interno a su propia API** — fetchProduct llama a `/api/marketplace/products/:id` en lugar de la capa DB directa | `app/marketplace/[slug]/producto/[productId]/page.tsx:78` | Round-trip HTTP adicional en SSR (~50-150ms); error en build si `BASE_URL` no está set | Llamar `MarketplaceStoreProductsDB` directamente desde el Server Component |

---

## P1 — Altos (Core Web Vitals degradados)

| # | Hallazgo | Archivo:línea | Impacto | Fix |
|---|----------|--------------|---------|-----|
| P1-01 | **Ninguna imagen hero tiene `priority`** — home `/` tiene logos de tiendas con `fill` pero sin `priority`; el hero es LCP candidate | `app/(store)/page.tsx:504-510` | LCP ~2.8s estimado en 3G (objetivo <2.5s) | Agregar `priority` a primera imagen de `TopStoresSection` (primeras 3 logos) |
| P1-02 | **Imágenes de categorías sin `priority` en featured** — las 2 cards XL de categoría (Restaurante + Bodega) son above-the-fold en mobile | `app/(store)/page.tsx:379-388` | LCP aumenta ~200ms si la imagen de categoría es el elemento más grande | Agregar `priority` a `featured[0]` (primera card XL) |
| P1-03 | **Sitemap sin `take` en `storeProducts`** — `prisma.storeProduct.findMany` sin límite puede retornar miles de rows en build | `app/sitemap.ts:198-215` | OOM en build si hay >50k storeProducts; build cuelga | Agregar `take: 5000` o paginación |
| P1-04 | **`/marketplace/buscar` siempre `noindex`** — incluso sin query `?q=`, la página nunca es indexada | `app/marketplace/buscar/page.tsx:34-37` | Pierde posicionamiento para búsquedas genéricas de categoría | Indexar solo cuando `!q` (sin query), noindex con query |
| P1-05 | **100 botones en `components/store/` sin `aria-label`** — grep retorna 100 `<button>` sin atributo label explícito | `components/store/**/*.tsx` | WCAG 2.1 SC 4.1.2 (botones sin nombre accesible); falla axe | Auditar con `@axe-core/playwright` y añadir `aria-label` a todos los botones-icono |
| P1-06 | **Canonical faltante en `app/t/[slug]/page.tsx`** — `generateMetadata` no emite `alternates.canonical` | `app/t/[slug]/page.tsx:106-123` | Google puede indexar duplicados (preview=true vs normal) | Añadir `alternates: { canonical: \`https://www.buleje.pe/t/\${slug}\` }` |

---

## P2 — Medios (mejoras incrementales)

| # | Hallazgo | Archivo:línea | Impacto | Fix |
|---|----------|--------------|---------|-----|
| P2-01 | **`/marketplace/explorar` usa `"use cache"` en el Page pero retorna `<ExplorarClient />` que es "use client"** — el cache funciona pero todo el componente es JS del cliente | `app/marketplace/explorar/page.tsx:40-43` | Desperdicia el benefit del cache; el HTML cacheado incluye bundle completo | Ver P0-04 |
| P2-02 | **JSON-LD de la home usa `storeCount` como `reviewCount`** — schema.org AggregateRating requiere reseñas reales, no conteo de tiendas | `app/(store)/page.tsx:156-159` | Rich result inválido en Google Search Console | Usar reviewCount real o eliminar aggregateRating del WebSite schema |
| P2-03 | **Sitemap no incluye `/t/[slug]`** — páginas de tenants public están fuera del sitemap root | `app/sitemap.ts` completo | Tenants white-label no se indexan en Google | Agregar query `prisma.tenant.findMany({ where: { active:true } })` y generar `/t/{slug}` entries |
| P2-04 | **OG image de tenant sin dimensiones fijas declaradas** — cuando no hay `ogImage`, no se emite `images[]` en OG | `app/t/[slug]/page.tsx:104` | Share en WhatsApp/FB sin preview visual para tiendas sin imagen personalizada | Usar `/api/og?store={slug}` como fallback con dimensiones 1200×630 |
| P2-05 | **`BottomNav` en marketplace sin compensación `pb-safe-area`** — layout no compensa el safe-area-inset-bottom | `app/marketplace/layout.tsx:86-100` | En iPhone con home bar, el BottomNav tapa contenido; CLS potencial | Agregar `pb-[env(safe-area-inset-bottom)]` al contenedor principal |
| P2-06 | **`robots.ts` bloquea `/_next/` para todos los bots** — `/_next/static/` no necesita estar en disallow ya que Google lo ignora por defecto | `app/robots.ts:27` | Inocuo pero añade confusión; puede impedir que Googlebot cargue chunks para render | Eliminar `/_next/` del disallow (Googlebot no lo rastrea, pero sí carga los chunks JS para indexar) |
| P2-07 | **Fuente display `Instrument_Serif` sin `fallback` declarado** — si el preload falla, el texto desaparece hasta que carga | `app/layout.tsx:21` | Flash of invisible text (FOIT) en conexiones lentas | Añadir `fallback: ["Georgia", "serif"]` en la config de `next/font` |

---

## Fortalezas confirmadas (no tocar)

| Area | Detalle |
|------|---------|
| Cache home `/` | `"use cache"` + `cacheLife` + `cacheTag` en las 3 funciones async (categorias, stats, top-stores) |
| JSON-LD marketplace | WebSite + BreadcrumbList + CollectionPage + ItemList en `/marketplace` |
| JSON-LD store detail | LocalBusiness + AggregateRating en `/marketplace/[slug]` |
| Skip link | `<SkipLink>` presente en `app/(store)/layout.tsx:147` |
| Sitemap completo | Zonas + distritos + recetas + stores + productos |
| Robots.txt | Bloqueo correcto de `/admin/`, `/api/`, crawlers AI training |
| Debounce búsqueda | `SearchAutocompleteInput` usa debounce 250ms ref-based |
| `next/font` | Geist + Instrument_Serif con `preload: true` desde fix 2026-05-12 |
| OG base | Home + marketplace + store-detail tienen OG completo |
| Canonical `/marketplace` | Dinámico por zona con `alternates.canonical` correcto |

---

## Métricas estimadas (3G, Android mid-range)

| Metrica | Actual estimado | Objetivo | Brecha |
|---------|----------------|----------|--------|
| LCP home `/` | ~2.8s | <2.5s | -300ms (P1-01, P1-02) |
| LCP `/t/[slug]` | ~3.4s | <2.5s | -900ms (P0-01, P0-02) |
| LCP `/marketplace` | ~2.2s | <2.5s | OK |
| TTI `/marketplace/explorar` | ~4.5s | <4s | -500ms (P0-04) |
| Bundle first paint `/marketplace` | ~180KB est. | <120KB | (P0-03) |
