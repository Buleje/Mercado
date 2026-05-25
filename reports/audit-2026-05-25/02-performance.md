# Auditoría de Performance — Buleje 2026-05-25

> Auditor: Optimizer (Hub OPS) · Rama: `prod` · Fecha: 2026-05-25

---

## Resumen ejecutivo

| Severidad | Count |
|-----------|-------|
| P0        | 0     |
| P1        | 5     |
| P2        | 6     |
| P3 (micro)| 3     |

**Sin violaciones `force-dynamic`** — el hotfix `bdb6f5f2` está vigente, los 3 archivos que lo mencionan solo tienen comentarios de advertencia.

**Bien resuelto vs. auditoría 2026-05-24:**
- `MarketplaceContent` ya recibe `initialStores` + `initialBestsellers` por props SSR ✓
- `TiendasDestacadas` y `MarketplaceBestsellersStrip` tienen guard `if (initialItems) return` en useEffect ✓
- `app/t/[slug]/page.tsx` tiene `preconnect` a Google Fonts + hero `<Image priority>` ✓
- Admin TabRouter tiene 44 `dynamic()` wrappers cubriendo todos los módulos pesados ✓

---

## Tabla de hallazgos priorizados

### P1 — Alto impacto en CWV o UX crítica

| # | Archivo | Línea | Hallazgo | Ganancia estimada | Fix |
|---|---------|-------|----------|-------------------|-----|
| P1-01 | `app/t/[slug]/page.tsx` | 406 | Logo del tenant en el hero desktop usa `<img>` raw sin `width`/`height` — candidato LCP sin dimensiones → CLS medible al cargar | CLS -0.08–0.15, LCP -150ms | Reemplazar con `<Image fill sizes="128px" priority>` dentro del contenedor `relative` existente |
| P1-02 | `contexts/settings-context.tsx` | 150–259 | `fetch("/api/settings", { cache: "no-store" })` en useEffect al mount. `SettingsProvider` es el 3er nivel de `StoreProviders` — dispara en cada hydration de página pública. Sin caché HTTP → round-trip DB por visita | ~200ms por pageview en 3G | Mover `cache: "no-store"` a `cache: "default"` + stale-while-revalidate 60s, o pre-pasar settings como prop desde el layout RSC |
| P1-03 | `contexts/promotions-context.tsx` | 23–35 | `fetch("/api/promotions")` en useEffect `[]` — mismo patrón que P1-02. Suma un segundo request en mount a la cascada de hidratación de StoreProviders | ~150ms paralelo a P1-02 | Igual que P1-02: pasar `initialPromotions` como prop desde el Server Component padre o agregar `Cache-Control: s-maxage=60` en el endpoint |
| P1-04 | `app/checkout/entrega/page.tsx` | 253–308 | Página de 1702 líneas completamente `"use client"` con 12 `useEffect`. Los 3 primeros (ubigeo dep/prov/dist) son waterfalls seriales en la carga del checkout — el usuario espera 3 fetches encadenados antes de poder elegir distrito | ~600ms en 3G para cargar los selects de ubigeo | Los datos ubigeo vienen de memoria (`ubigeo-peru`), no de DB. Pasar `departamentos` iniciales como prop SSR desde un Server Component wrapper, o pre-cargar con `<link rel="prefetch">` al entrar al carrito |
| P1-05 | `components/store/tenant/SectionRenderer.tsx` | 68 | `<img src={imageUrl}>` raw en sección "imagen-texto" del storefront de tenant — imagen de contenido editorial renderizada sin `next/image`, sin `loading="lazy"`, sin `sizes`. Puede ser above-the-fold en storefonts personalizados | CLS variable; sin WebP/AVIF → +30–60% payload de imagen | Reemplazar con `<Image src={imageUrl} fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover">` dentro del div `aspect-[4/3]` existente |

---

### P2 — Impacto moderado

| # | Archivo | Línea | Hallazgo | Ganancia estimada | Fix |
|---|---------|-------|----------|-------------------|-----|
| P2-01 | `app/t/[slug]/page.tsx` | 243 | Google Fonts cargada como stylesheet externa (no `next/font/google`). Con preconnect el bloqueo baja a ~50–80ms, pero no elimina el FOUC ni el request extra. `next/font/google` genera CSS inline en el HTML sin request de red | -50–80ms FCP en primera visita | Migrar a `next/font/google` con `display: "swap"` y variable CSS, pasando la font como prop al tenant o inyectando vía CSS variable dinámica |
| P2-02 | `app/(store)/mis-pedidos/page.tsx` | 1–1745 | Componente de 1745 líneas todo `"use client"` sin segmentar. La lógica de tracking en tiempo real, el modal de detalle y la lista de órdenes están en un solo chunk. Sin dynamic imports para secciones below-fold | Bundle +80–120KB estimado en chunk inicial de mis-pedidos | Extraer `OrderDetailModal` y `TrackingSection` a `dynamic()` con `ssr: false` — ya hay 3 dynamic al inicio pero no segmentan el cuerpo principal |
| P2-03 | `components/Header.tsx` | 1–2036 | 2036 líneas, `"use client"`, 45 hooks internos. Se incluye en todas las rutas públicas. No tiene `React.memo` explícito ni submódulos diferidos. Cualquier cambio de contexto re-renderiza todo el header | Re-renders en cada cart update, navigation, scroll | Envolver subcomponentes estáticos (`NavLinks`, `AnnouncementBar`) en `React.memo` + mover lógica de scroll a un hook separado para aislar re-renders |
| P2-04 | `app/superadmin/orders/OrdersClient.tsx` | 684, 874 | Thumbnails de productos en lista de órdenes superadmin usan `<img>` raw (36×36px) sin `next/image`. En listas largas → sin lazy loading nativo del browser (no hay `loading="lazy"`) | Sin lazy: descarga todas las imágenes al cargar la tabla | Reemplazar con `<Image width={36} height={36} loading="lazy">` o con `loading="lazy"` en el `<img>` como mínimo |
| P2-05 | `app/superadmin/banco-imagenes/ImageBankClient.tsx` | 602, 801 | Galería de imágenes usa `<img src={safeUrl}>` raw sin `loading="lazy"` ni `next/image`. En un banco con decenas de imágenes → fetch eager de todos los recursos | -40–70% requests en primera carga de galería | Agregar `loading="lazy"` como mínimo; idealmente `<Image fill sizes="200px" loading="lazy">` |
| P2-06 | `lib/db/` — 20 archivos | — | 20 de 199 archivos `*.db.ts` no tienen `"use cache"`. Entre ellos: `finance.db.ts`, `transactions.db.ts`, `analytics-cash-flow.db.ts`, `campaigns.db.ts`. Las rutas de admin que los consumen hacen DB round-trip en cada request | Varía por ruta; estimado -100–300ms en rutas de reportes | Agregar `"use cache"` + `cacheLife({ revalidate: 30 })` + `cacheTag` apropiado en las funciones de lectura de estos archivos |

---

### P3 — Microoptimizaciones (sin acción urgente)

| # | Archivo | Hallazgo |
|---|---------|----------|
| P3-01 | `components/store/PromoBannerRotator.tsx:112` | `setInterval` sin `document.visibilityState` check — el rotador corre en background tabs, desperdiciando ciclos. Agregar listener `visibilitychange` para pausar. |
| P3-02 | `next.config.ts:21` | `typescript.ignoreBuildErrors: true` — ya documentado como trade-off intencional (ADR-008). Sin acción, solo monitorear que el gate CI compense. |
| P3-03 | `app/checkout/entrega/page.tsx` | El endpoint `/api/marketplace/ubigeo` devuelve datos en memoria (no DB), pero no tiene `Cache-Control` en la respuesta. Agregar `res.headers.set("Cache-Control", "public, max-age=86400")` eliminaría los 3 fetches cascada de ubigeo en visitas repetidas. |

---

## Contexto técnico por hallazgo

### P1-01: Logo tenant en hero desktop sin dimensiones

```tsx
// app/t/[slug]/page.tsx:406 — ACTUAL (problemático)
<img
  src={tenant.logoUrl}
  alt=""
  className="w-32 h-32 rounded-full object-cover"
/>

// FIX — contenedor ya tiene posición relative implícita por el div padre
<Image
  src={tenant.logoUrl}
  alt=""
  fill
  sizes="128px"
  priority        // ← above-fold en desktop hero
  className="rounded-full object-cover"
/>
```

El div padre en línea ~400 ya tiene `w-48 h-48 relative` (blurred background + backdrop). El logo de 128×128 es above-fold en desktop y candidato LCP directo.

---

### P1-02 + P1-03: Triple fetch en mount de StoreProviders

`StoreProviders` apila 12 Context.Providers. En el mount de cualquier página pública:

1. `SettingsProvider` → `fetch("/api/settings")` (settings-context.tsx:174)
2. `PromotionsProvider` → `fetch("/api/promotions")` (promotions-context.tsx:24)
3. `CustomerProvider` → `fetch("/api/auth/customer/me")` (customer-context.tsx:142)

Los 3 se disparan en paralelo pero **todos** ocurren **antes** del primer INP. Los datos de settings y promotions son tenant-wide y raramente cambian — son candidatos ideales para SSR pre-fetch + prop injection.

**Fix arquitectural (RSC-first):**
```tsx
// En app/layout.tsx o app/(store)/layout.tsx (Server Component)
const [settings, promotions] = await Promise.all([
  getSettings(tenantId),
  getActivePromotions(tenantId),
]);
// Pasar como props a StoreProviders
<StoreProviders initialSettings={settings} initialPromotions={promotions}>
```

Ganancia: elimina 2 de los 3 fetches del mount, -350ms en primera visita.

---

### P1-04: Ubigeo waterfall en checkout

```
useEffect #1 → fetch departamentos  (siempre al mount)
useEffect #2 → fetch provincias     (cuando cambia departamento)
useEffect #3 → fetch distritos      (cuando cambia provincia)
```

Los datos ubigeo son **estáticos en memoria** (paquete `ubigeo-peru`). El endpoint `/api/marketplace/ubigeo/route.ts` solo llama `listDepartamentos()`, `listProvincias(dep)`, `listDistritos(dep, prov)` — sin DB. Agregar `Cache-Control: public, max-age=86400` en el response y pre-cargar departamentos como prop SSR elimina el primer fetch.

---

### P1-05: SectionRenderer `<img>` en storefront

La función `ImageTextBlock` en `SectionRenderer.tsx:68` renderiza la imagen principal de secciones tipo "imagen + texto". Esta sección puede ser la primera sección visible del storefront de un tenant (above-fold en mobile). Sin dimensiones explícitas ni `loading="lazy"`, provoca CLS y fuerza descarga eager del recurso.

---

### P2-06: 20 archivos db sin "use cache"

Archivos de mayor impacto (consultas frecuentes en rutas de admin):

| Archivo | Uso típico |
|---------|------------|
| `lib/db/finance.db.ts` | Dashboard financiero |
| `lib/db/transactions.db.ts` | Módulo tesorería |
| `lib/db/analytics-cash-flow.db.ts` | Reportes caja |
| `lib/db/campaigns.db.ts` | Módulo marketing |
| `lib/db/me-credit-score.db.ts` | Score crediticio cliente |
| `lib/db/abandoned-cart-stats.db.ts` | Stats carrito abandonado |
| `lib/db/stats-live.db.ts` | Dashboard live — requiere `revalidate: 5` no `30` |
| `lib/db/visitor-welcome.db.ts` | Home storefront |

Para `stats-live.db.ts` usar `cacheLife({ revalidate: 5, stale: 10 })` — datos en tiempo real. Para el resto, `cacheLife({ revalidate: 30, stale: 60 })`.

---

## Hallazgos que NO aplican (verificados)

| Sospecha inicial | Verificación | Estado |
|-----------------|--------------|--------|
| `force-dynamic` en rutas | Solo comentarios en 5 archivos, sin `export const dynamic =` activo | OK |
| MarketplaceContent waterfall (auditoría 2024-05-24) | Props SSR reconectadas: `initialStores` L201 + `initialBestsellers` L203 | Resuelto |
| Hero de /t/[slug] sin priority (auditoría 2024-05-24) | `<Image priority>` en línea 280, `preconnect` Google Fonts en línea 239-240 | Resuelto |
| TrendingTodayWidget fetch en mount | Componente removido del árbol principal (solo en worktrees estale) | OK |
| Admin tabs sin lazy loading | TabRouter: 44 `dynamic()` cubre todos los módulos > 300 líneas | OK |
| `next/image` AVIF/WebP config | `formats: ["image/avif", "image/webp"]` en next.config.ts:89 | OK |
| Supabase en remotePatterns | `*.supabase.co` en L98 | OK |

---

## Priorización de fixes (orden sugerido)

| Orden | Hallazgo | Tiempo estimado | Impacto |
|-------|----------|-----------------|---------|
| 1 | P1-01: Logo tenant hero → `<Image priority>` | 15 min | LCP -150ms, CLS -0.1 |
| 2 | P1-05: SectionRenderer img → `<Image>` | 15 min | CLS storefront |
| 3 | P2-04 + P2-05: thumbnails superadmin → `loading="lazy"` | 20 min | Network en admin |
| 4 | P3-03: Cache-Control ubigeo endpoint | 5 min | Ubigeo waterfall en checkout |
| 5 | P1-02 + P1-03: settings+promotions SSR props | 2h | -350ms mount público |
| 6 | P2-06: "use cache" en 20 db files | 1h | DB load admin |
| 7 | P2-01: next/font/google para tenant | 3h | FOUC + FCP |
| 8 | P1-04: ubigeo SSR prop en checkout | 1h | -600ms checkout 3G |
