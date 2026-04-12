# Performance Audit — 2026-04-10

> Auditoría estática completa. Ningún archivo dirty fue modificado.
> Ejecutada por el agente `performance-engineer` como subagente del Orquestador Principal.

---

## Baseline metrics

| Métrica | Valor | Estado |
|---------|-------|--------|
| Bundle JS main (estimado) | ~350-500 KB gzip | No medible: build bloqueado por `app/api/og/route.tsx` (edge runtime incompatible con `cacheComponents: true`) |
| Route handlers totales | 535 | — |
| Route handlers con cualquier forma de cache | 15 / 535 | **2.8%** — crítico |
| Route handlers GET sin ningún cache | ~380 / 406 GET | **93.6% sin cache** |
| Componentes con `"use client"` | **842** | Muy alto |
| Tags `<img>` nativo (no next/image) | 6 | Bajo — contextos válidos (QR en popups de impresión, templates HTML email) |
| `findMany` sin paginación en lib/db | **108** | Alto — riesgo de queries sin límite |
| Imports `recharts` estáticos (no dynamic) | **37 archivos** | Alto — carga recharts en bundle inicial |
| Imports `framer-motion` sin LazyMotion | **100 archivos** | Mitigado: `optimizePackageImports` activo |
| Store pages RSC (sin use client) | 14 / ~20 | Aceptable |
| Store pages con `"use cache"` | 5 / 20 | Bajo |
| Build bloqueado | SÍ | `app/api/og/route.tsx`: `runtime = "edge"` incompatible con `cacheComponents: true` |

---

## Hallazgos críticos previos a los Big Wins

### BLOCKER: Build roto — `app/api/og/route.tsx`
- Línea 18: `export const runtime = "edge";`
- Incompatible con `nextConfig.cacheComponents = true` (Next.js 16)
- **Impacto:** CI/CD completamente bloqueado. Ningún deploy llega a producción.
- **Fix:** eliminar `export const runtime = "edge"` o migrar a Node.js runtime.
- **Archivo:** `app/api/og/route.tsx` (está en working tree limpio — es modificable)

---

## Top 10 Big Wins (orden por impact/effort ratio)

### 1. Fix build blocker — `app/api/og/route.tsx` edge runtime
- **Impact:** Desbloquea CI/CD completamente. Sin esto, nada más importa.
- **Effort:** 0.25 h
- **Files to create:** ninguno (modificar `app/api/og/route.tsx` — no está en dirty list)
- **Rationale:** `ImageResponse` de `next/og` funciona perfectamente en Node.js runtime. El edge runtime solo aporta ~5ms de latencia edge que no justifica bloquear el build. Eliminar la línea `export const runtime = "edge"` resuelve el blocker sin pérdida funcional.

---

### 2. Cache masivo en `app/api/marketplace/catalog/route.ts` — ruta de mayor tráfico
- **Impact:** LCP storefront -40-60%. Esta ruta es el catálogo unificado del marketplace — hit en cada page load público. Sin cache, ejecuta 4 queries Prisma paralelas + `applyBoostsToProducts`. Estimado: -200-400ms por request en p95.
- **Effort:** 2 h
- **Files to create:** ninguno (modificar `app/api/marketplace/catalog/route.ts` — no dirty)
- **Rationale:** Patron `getOrSet` con TTL 120s + key `marketplace:catalog:{tenantId}:{category}:{sort}:{cursor}` reduce 99%+ de queries DB para lecturas repetidas. Los datos de catálogo toleran 2 min de stale. La ruta ya importa `prisma` directamente — wrappear en `getOrSet` es cambio quirúrgico.
- **Cache key sugerida:** `marketplace:catalog:{tenantId}:{category}:{sort}:{cursor}:{limit}` → TTL 120s

---

### 3. Cache en `app/api/settings/route.ts` — hit en CADA request del storefront
- **Impact:** -50-80ms por request. `SettingsDB.get()` se llama en cada render del storefront para cargar configuración de tienda (horarios, delivery zones, tema). Con `private, no-cache` actual, el browser no cachea y el servidor tampoco.
- **Effort:** 1 h
- **Files to create:** ninguno (modificar `app/api/settings/route.ts` — no dirty)
- **Rationale:** Cambiar header a `public, s-maxage=300, stale-while-revalidate=60`. Los settings de tienda cambian raramente. Invalidar con `revalidateTag("settings:{tenantId}")` en el PUT de settings. Reducción estimada de ~60% invocaciones Vercel en rutas públicas.

---

### 4. Cache en `app/api/v1/products/route.ts` — catálogo de productos por tenant
- **Impact:** -150-300ms LCP en páginas de tienda. `ProductsDB.getAll(tenantId)` es llamado en cada request sin ningún cache. Cada tenant con 500+ productos deserializa todo el catálogo por request.
- **Effort:** 1.5 h
- **Files to create:** ninguno (modificar `app/api/v1/products/route.ts` — no dirty)
- **Rationale:** Wrappear `ProductsDB.getAll(tenantId)` en `getOrSet("products:{tenantId}", 300, ...)`. TTL 5 min — suficiente para catálogos que cambian con ediciones manuales. Invalidar en el POST de productos. Reducción estimada -80% queries DB en lecturas.

---

### 5. Recharts — 37 archivos con import estático vs dynamic()
- **Impact:** Recharts pesa ~120-180 KB gzip. Con 37 imports estáticos en componentes admin, todo ese peso entra en el bundle inicial del panel de administración aunque el usuario no haya abierto ningún gráfico. Estimado JS inicial admin: -80-120 KB gzip.
- **Effort:** 4 h
- **Files to create:** `components/admin/charts/LazyChart.tsx` — wrapper unificado de dynamic import para todos los charts recharts
- **Rationale:** Un wrapper `LazyChart` con `dynamic(() => import("recharts").then(m => m.BarChart), { ssr: false, loading: () => <ChartSkeleton /> })` permite reemplazar todos los imports estáticos desde un solo punto. Los 37 archivos usan subsets similares de recharts — unificarlos en un barrel lazy reduce la superficie.

---

### 6. `"use client"` en 842 componentes — empujar boundary hacia las hojas
- **Impact:** Cada `"use client"` innecesario en un componente padre convierte todo su subárbol en client bundle, multiplicando el JS enviado. Top candidatos a convertir a RSC: `components/admin/AdminStats.tsx`, `components/admin/ActivityFeed.tsx`, `components/admin/AdminBottomNav.tsx` — son componentes de presentación que solo muestran datos.
- **Effort:** 8 h (para top 10 candidatos)
- **Files to create:** versiones RSC de `components/admin/AdminStatsRSC.tsx` (nuevas — no tocar originales)
- **Rationale:** El patron correcto es: componente padre RSC + extraer solo el interactive bit como client leaf. Reducción estimada: -30-50 KB JS inicial en admin.

---

### 7. `app/(store)/cuenta/page.tsx` — 115 KB con `"use client"` completo
- **Impact:** La página de cuenta de usuario es la más pesada del storefront (115 KB source, `"use client"` completo). Convierte toda la historia de pedidos, perfil, favoritos y puntos en un monolito cliente. En 3G, añade ~800ms de parse/execute JS.
- **Effort:** 6 h
- **Files to create:** `app/(store)/cuenta/CuentaShell.tsx` (client shell), `app/(store)/cuenta/PedidosSection.tsx` (client), `app/(store)/cuenta/PerfilSection.tsx` (RSC) — todos nuevos
- **Rationale:** Separar en RSC shell que carga datos de perfil server-side + lazy client components para secciones interactivas (formularios, historial live). Reducción estimada: -40-60% JS enviado en `/cuenta`.

---

### 8. Cache en `app/api/marketplace/stores/[slug]/route.ts` — store page data
- **Impact:** Cada visita a una página de tienda (`/tienda/[slug]`) recarga los datos del tenant desde DB. Con múltiples tiendas y alta concurrencia, genera N queries simultáneas para los mismos datos. Estimado: -100-200ms LCP en mobile 3G.
- **Effort:** 1 h
- **Files to create:** ninguno (modificar route — no dirty)
- **Rationale:** `getOrSet("marketplace:store:{slug}", 300, ...)` con invalidación en PUT/PATCH de store. Los datos de tienda (nombre, logo, horarios) cambian raramente. TTL 5 min con stale-while-revalidate de 60s es seguro.

---

### 9. Framer Motion — migrar 100 imports directos a usar `m.` con `LazyMotion`
- **Impact:** `MotionProvider` existe y está en `app/(store)/layout.tsx`. Sin embargo, 100 componentes admin importan `motion` completo (no `m` + LazyMotion). Framer Motion completo vs domAnimation: ~80 KB gzip de diferencia cuando no hay LazyMotion boundary activo en admin.
- **Effort:** 3 h
- **Files to create:** ninguno — cambiar `motion` por `m` en imports, wrappear admin layout con `MotionProvider`
- **Rationale:** `optimizePackageImports: ["framer-motion"]` en next.config.ts ya ayuda con tree-shaking estático, pero el verdadero ahorro viene de usar `LazyMotion` + `domAnimation` que carga features asíncronamente. El panel admin no tiene `MotionProvider` — añadirlo en `app/admin/layout.tsx` es el cambio correcto.

---

### 10. Middleware hot path — `checkRateLimit` (Upstash Redis) en cada `/api/*`
- **Impact:** Cada request a `/api/*` en producción hace una llamada async a Upstash Redis para rate limiting (proxy.ts línea 65-68). Si Upstash tiene latencia alta o cold start, añade 20-80ms a **todos** los requests de API. INP en acciones de usuario aumenta directamente.
- **Effort:** 3 h
- **Files to create:** `lib/middleware/rate-limit-local.ts` — sliding window en memoria como primera capa, Upstash como segunda capa (fail-open si no disponible)
- **Rationale:** Sliding window in-memory con `Map` + expiry para IPs que no están cerca del límite. Solo llamar Upstash cuando el contador local llega al 80% del límite. Reduce llamadas Redis en ~90% en tráfico normal.

---

## Quick wins para Oleada 2 (paralelizables)

Estos pueden ser ejecutados en paralelo por 3-4 agentes simultáneos:

| # | Tarea | Agente | Tiempo |
|---|-------|--------|--------|
| A | Fix `runtime = "edge"` en `app/api/og/route.tsx` | backend-platform | 15 min |
| B | `getOrSet` en `app/api/settings/route.ts` + `Cache-Control public` | backend-platform | 45 min |
| C | `getOrSet` en `app/api/v1/products/route.ts` | backend-platform | 45 min |
| D | `getOrSet` en `app/api/marketplace/catalog/route.ts` | backend-platform | 1 h |
| E | Crear `components/admin/charts/LazyChart.tsx` wrapper | frontend | 2 h |
| F | Reemplazar imports recharts directos en top 10 archivos más pesados | frontend | 3 h |
| G | Añadir `MotionProvider` en `app/admin/layout.tsx` | frontend | 30 min |
| H | Cache `app/api/marketplace/stores/[slug]/route.ts` | backend-platform | 45 min |

**Dependencia crítica:** A (Fix build) debe completarse antes que cualquier deploy. B, C, D, H pueden ir en paralelo post-A.

---

## Anti-patterns detectados

| Anti-pattern | Severidad | Archivos afectados |
|---|---|---|
| `runtime = "edge"` en ruta con `cacheComponents: true` | CRITICO — bloquea build | `app/api/og/route.tsx` |
| 380/406 routes GET sin ningún cache (ni memoria, ni CDN, ni RSC cache) | ALTO | 380 routes |
| `"use client"` en 842 componentes — muchos innecesarios | ALTO | 842 archivos |
| 108 `findMany` sin `take:` / `skip:` — queries sin límite en DB | ALTO | 15+ archivos en `lib/db/` |
| 37 imports estáticos de recharts | MEDIO | 37 componentes admin |
| `font preload: false` en `app/layout.tsx` — Geist se carga sin preload | MEDIO | `app/layout.tsx` |
| `app/(store)/cuenta/page.tsx` — 115 KB monolito "use client" | MEDIO | 1 archivo |
| `checkRateLimit` Upstash en cada `/api/*` sin capa local primero | MEDIO | `proxy.ts` |
| `Hero.tsx` es `"use client"` completo — calcula greeting, store status en cliente | BAJO | `components/Hero.tsx` |
| `<img>` en templates HTML email / QR print — correcto en contexto, no es bug | INFO | 6 instancias |

---

## Proyección de impacto si se implementan los Top 10

| Métrica | Actual (estimado) | Post-oleada 2 | Post-top-10 completo |
|---------|-------------------|---------------|----------------------|
| LCP mobile 3G (storefront) | 4-7s | 2.5-3.5s | 2-3s |
| API p95 latencia | ~300-500ms | ~150-250ms | ~100-150ms |
| Cache coverage API | 2.8% | ~15% | ~30% |
| JS bundle admin (initial) | ~500 KB gzip | ~400 KB gzip | ~300 KB gzip |
| Invocaciones Vercel/día | baseline | -40-50% | -60-70% |
| Costo infraestructura | baseline | -30% | -45-55% |

---

## Recomendacion Go/no-go para proxima oleada

**GO — con prioridad máxima en este orden:**

1. **INMEDIATO (antes de cualquier otra cosa):** Fix `app/api/og/route.tsx` — el build está roto y bloquea todo CI/CD. Sin este fix, ningún cambio puede llegar a producción.

2. **Oleada 2 paralela (4 agentes simultáneos):** cache en settings + products + catalog + store-slug. Estas 4 rutas son el hot path del storefront. Con `getOrSet` en las 4, la mejora de LCP en mobile 3G será visible e inmediata.

3. **Oleada 3 (frontend):** LazyChart wrapper + migrar recharts estáticos + MotionProvider en admin. Impacto en bundle inicial del panel.

4. **Oleada 4 (refactor):** Romper `app/(store)/cuenta/page.tsx` en RSC + client shells. Es el cambio más grande pero el de mayor impacto en UX mobile.

Los big wins 1-4 son todos modificaciones a archivos NO en el working tree dirty, son cambios quirúrgicos y pueden desplegarse en <1 día de trabajo paralelo.

---

*Generado por performance-engineer subagente — 2026-04-10*
*Auditoría estática: 0 archivos modificados, solo lectura.*
