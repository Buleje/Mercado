# Bug Hunter — Auditoría de Performance Admin Panel

**Fecha:** 2026-05-16
**Branch:** `feat/checkout-payment-proof`
**Síntoma reportado:** Brandon nota lentitud al navegar entre tabs del admin.
**Alcance:** `lib/db/*.db.ts`, `app/api/admin/**` (113 routes), `components/admin/**`.

---

## Métricas globales

| Métrica | Valor | Comentario |
|---|---|---|
| Endpoints admin con `getOrSet` | 4 / 113 (3.5%) | Cobertura de cache muy baja |
| `prisma.*` directo en routes admin | 41 archivos | Violación regla #1 (sin audit + sin tenantId guard) |
| `tenant.findFirst` duplicado fuera de `findTenantByIdOrSlug` | 15 sitios | Sólo 1 usa `React.cache` |
| Endpoints admin con `force-dynamic` (anti-patrón Next 16) | 3 archivos | Rompe `cacheComponents` (ADR-019) |
| Setintervals en `components/admin/**` | 25+ | Muchos a 30–60s sin `Page Visibility` ni dedupe SSE |
| Raw SQL con interpolación | 0 | Todos los `$queryRawUnsafe` usan `$1 $2 $3` (OK) |

---

## TOP 10 hallazgos

### #1 — N+1 real en `lib/db/store-page.db.ts:609` (toggle masivo de productos en página pública)

| Campo | Detalle |
|---|---|
| Archivo | `lib/db/store-page.db.ts:606-635` |
| Tipo | N+1 (1 findUnique + 1 update/create por producto) |
| Severidad | Alta cuando se publican >50 productos a la vez |
| Causa | Comentario admite "prisma no soporta upsertMany nativo" → loop secuencial `await` |
| Impacto | Marcar 200 productos = ~400 queries serializadas (≈ 5–8 s) |
| Fix | Reemplazar por `findMany({where:{tenantId, productId:{in: ids}}, select:{productId:true}})` + 2 batchs (`createMany` skipDuplicates + `updateMany` por bloque). O `INSERT … ON CONFLICT DO UPDATE` raw con `unnest($1::text[], ...)` |
| Regresión sugerida | Test con 500 productIds; verificar ≤3 queries y resultado idempotente |

### #2 — `AdminSidebar` dispara 3 fetches al montar **+ poll cada 60s** (siempre, en background)

| Campo | Detalle |
|---|---|
| Archivo | `components/admin/AdminSidebar.tsx:922-961` |
| Tipo | API waterfall + polling permanente |
| Detalle | `Promise.all([doc-badges, stats])` (paralelo) **+** `await fetch("/api/fiados?status=ACTIVO")` (serial, **fuera** del Promise.all) cada 60s |
| Impacto | El sidebar vive en TODO el layout admin → cada tab paga 3 requests. `/api/fiados` carga el array completo (sin cache, sin count). Si el bodeguero deja la pestaña abierta = 180 requests/h aún sin interactuar |
| Fix | (a) Mover `fiadosRes` al `Promise.all`. (b) Crear `GET /api/admin/sidebar-badges` único con `getOrSet` TTL 60s que devuelva `{ docs, stats, fiados }` en 1 sola Server-Side aggregation. (c) Pausar interval con `document.visibilityState === 'hidden'` |
| Quick win | Pausar polling cuando la pestaña no está visible (1 hook, 30 min) |

### #3 — `/api/admin/doc-badges` ejecuta **3 COUNT separados sin cache** y sin `Promise.all`

| Campo | Detalle |
|---|---|
| Archivo | `app/api/admin/doc-badges/route.ts:17-37` |
| Tipo | API serial + sin cache + `prisma.*` directo (regla #1) |
| Impacto | 3 round-trips DB cada 60s × N tabs abiertos × M tenants. Cada COUNT recorre tabla. |
| Fix | (a) Envolver en `Promise.all`. (b) `getOrSet(\`doc-badges:${tenantId}\`, 60, ...)`. (c) Mover a `DocumentsDB` |

### #4 — `/api/admin/stats` cuenta `lowStockProducts` con WHERE inválido + falta filtro real

| Campo | Detalle |
|---|---|
| Archivo | `app/api/admin/stats/route.ts:62-72` |
| Tipo | Query rota — el comentario admite "Prisma no soporta column comparisons; use raw query" pero el código **no usa raw query**. Cuenta todos los productos activos con stockMin no-null → siempre da count global, no "low stock" real |
| Bug funcional | Badge "inventario" siempre muestra el total de productos con stockMin definido |
| Fix | `prisma.$queryRawUnsafe<{count:number}[]>(`SELECT COUNT(*)::int FROM "Product" WHERE "tenantId"=$1 AND active=true AND stock IS NOT NULL AND "stockMin" IS NOT NULL AND stock<="stockMin"`, tenantId)` |

### #5 — `useOrdersData` polling 15s **+** SSE redundante

| Campo | Detalle |
|---|---|
| Archivo | `components/admin/OrdersTab/hooks/useOrdersData.ts:52-78` |
| Tipo | Polling agresivo + redundancia con `EventSource("/api/admin/sse")` |
| Impacto | Doble notificación; cada 15s un fetch full incluso con SSE conectado |
| Fix | Si SSE conectado: poll a 60s como fallback. Si SSE falla: bajar a 15s. Detectar con `es.readyState === EventSource.OPEN` |

### #6 — `tenant.findFirst` ad-hoc en 15 sitios fuera de `findTenantByIdOrSlug`

| Campo | Detalle |
|---|---|
| Sitios | `lib/trial.ts:20`, `lib/tenant-check.ts:14`, `lib/billing/require-active-subscription.ts:32`, `lib/db/marketplace/stores.db.ts:41`, `lib/db/marketplace-public.db.ts:604`, `lib/db/tenant-billing.db.ts:16/33`, `lib/db/marketplace-compare.db.ts:52`, `lib/db/product-variants.db.ts:96`, `lib/resolve-tenant.ts:43`, `lib/compliance/gdpr-export.ts:30`, + 4 routes en `app/api/admin/{alerts-summary, setup-marketplace-store, plan/checkout/stripe-session, plan/mock-activate}` |
| Tipo | Bypass del helper memoizado (`React.cache`) en `lib/tenant.ts:20` |
| Impacto | En un mismo request varias capas hacen su propio findFirst (3× confirmado por logs históricos) |
| Fix | Migración masiva: reemplazar `prisma.tenant.findFirst({where:{OR:[{id},{slug}]}})` por `findTenantByIdOrSlug(tenantId)`. Apto para codemod (`scripts/migrate-tenant-lookup.ts`) |
| Mejor | Pasar `tenant` resuelto en `requireAdmin` y exponerlo en `auth.tenant` para que routes no vuelvan a buscar |

### #7 — `/api/admin/alerts-summary` correcto, **pero el banner pollea cada 30s** sin Page Visibility

| Campo | Detalle |
|---|---|
| Archivo | `components/admin/AdminAlertsBanner.tsx:58,114` |
| Estado | Endpoint ya tiene `getOrSet 60s` y `Promise.all` (bien). El problema es el cliente |
| Impacto | El banner está en TODO `/admin/*` → cada tab + cada sesión inactiva = 120 req/h |
| Fix | Pausar interval con `document.visibilityState`. Sumar `If-None-Match` + ETag en server para 304 cuando no cambia |

### #8 — `InicioDashboardV2` monta y pide `/api/admin/overview` **+** los 4 charts (`stock-critical`, `eoq-suggest`, etc.) en paralelo al mismo tiempo

| Campo | Detalle |
|---|---|
| Archivos | `components/admin/inicio/InicioDashboardV2.tsx:114`, `InventarioCharts.tsx:54`, `InventarioAdvancedCharts.tsx:93` |
| Tipo | API fan-out al montar (4 fetches concurrentes, ninguno cacheado salvo overview) |
| Fix | (a) `getOrSet` en `stock-critical` y `eoq-suggest` (TTL 120s — alertas no necesitan tiempo real). (b) Consolidar en `/api/admin/inicio-bundle` que devuelva `{overview, stockCritical, eoq, alerts}` con `"use cache"` + `cacheTag(\`tenant:${id}\`)` (ADR-019). |

### #9 — Endpoints frecuentes **sin cache** (107 de 113)

| Endpoint relevante | TTL recomendado | Razón |
|---|---|---|
| `/api/admin/doc-badges` | 60s | Badges no críticos |
| `/api/admin/inventory/eoq-suggest` | 300s | Cálculo pesado (joins orderItems + saleItems) |
| `/api/admin/alerts/stock-critical` | 90s | Lectura de inventario |
| `/api/admin/today-summary` | (ya tiene) | OK |
| `/api/admin/dashboard` | (ya tiene 15s) | OK |
| `/api/admin/cron-health` | 60s | Solo lectura logs |

### #10 — 3 endpoints admin con `export const dynamic = "force-dynamic"` (anti-patrón Next 16)

| Archivo | Memoria del proyecto |
|---|---|
| `app/api/admin/compliance-dashboard/route.ts:30` | [[feedback_no_force_dynamic_next16]] — rompe `cacheComponents` (ADR-019) |
| `app/api/admin/leads/funnel/route.ts:26` | idem |
| `app/api/admin/leads/route.ts:29` | idem |
| Fix | Eliminar la línea; `requireAdmin` ya hace que Next infiera dynamic por cookies |

---

## Quick wins (≤1 h cada uno)

| # | Acción | Archivos | Impacto |
|---|---|---|---|
| QW1 | Pausar polling cuando `document.hidden` en `AdminAlertsBanner`, `AdminSidebar`, `useOrdersData`, `ShipmentTrackingTab`, `ActivityLogTab` | 5 hooks | -50% requests background |
| QW2 | Consolidar 3 COUNT de `/api/admin/doc-badges` en `Promise.all` + `getOrSet 60s` | 1 archivo | -200ms p95 |
| QW3 | Mover `fetch("/api/fiados")` del sidebar **dentro** del `Promise.all` existente | `AdminSidebar.tsx:927-954` | -1 RTT por mount |
| QW4 | Eliminar 3 `force-dynamic` violations en admin | 3 archivos | Habilita `cacheComponents` |
| QW5 | Fix lógico de `lowStockProducts` en `/api/admin/stats` (badge incorrecto hoy) | 1 archivo | Bug funcional |
| QW6 | Cachear `/api/admin/alerts/stock-critical` + `/api/admin/inventory/eoq-suggest` con `getOrSet` | 2 archivos | -800ms en mount de Inicio |

---

## N+1 patterns auto-fixeables con script

| Pattern | Detección | Reemplazo |
|---|---|---|
| `for (const X of ids) await prisma.Y.findUnique(...)` | grep `lib/db/**` | `findMany({where:{X:{in:ids}}})` + Map lookup |
| `prisma.tenant.findFirst({where:{OR:[{id:X},{slug:X}]}})` | 15 hits ya identificados | `findTenantByIdOrSlug(X)` |
| `for/forEach con await prisma.X.update` | `lib/db/documents.db.ts:378`, `store-page.db.ts:609` | `updateMany` o transacción única |

Codemod sugerido: `scripts/codemod-tenant-lookup.ts` con `ts-morph` — reemplazo seguro porque la firma es estable.

---

## Migración recomendada a `"use cache"` (Next 16)

| Endpoint | Patrón actual | Patrón objetivo |
|---|---|---|
| `/api/admin/overview` | `getOrSet 30s` manual | `"use cache"` + `cacheLife("minutes")` + `cacheTag(\`tenant:${id}\`,\`overview:${id}\`)` |
| `/api/admin/stats` | `getOrSet 30s` | igual + invalidar con `revalidateTag(\`orders:${id}\`)` desde `OrdersDB.create` |
| `/api/admin/dashboard` | `getOrSet 15s` | igual + tag por dataset (`products`, `orders`, ...) |
| `/api/admin/alerts-summary` | `getOrSet 60s` | igual |
| `/api/admin/doc-badges` | sin cache | `"use cache"` + `cacheTag(\`docs:${id}\`)` |

Beneficio: invalidación quirúrgica al escribir (`revalidateTag`) en lugar de TTL ciego; deja de pegarle a DB tras cada checkout.

---

## Riesgo de regresión por fix

| Hallazgo | Riesgo | Mitigación |
|---|---|---|
| #1 batch upsert | Medio | Test idempotencia con 0/1/N productos |
| #2 sidebar bundle | Bajo | El UI ya tolera fallos parciales (`badges[..] = ...`) |
| #4 lowStock raw | Bajo | Comparar count vs query previa en staging |
| #6 codemod tenant | Bajo | `findTenantByIdOrSlug` ya tiene firma compatible (devuelve `Tenant | null`) |
| #10 force-dynamic | Bajo | Brandon ya documentó hotfix `bdb6f5f2` que revirtió 16 violaciones similares |
