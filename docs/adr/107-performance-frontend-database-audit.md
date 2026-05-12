# ADR-107: Performance + Frontend + Database Audit — Estado Real

**Fecha:** 2026-05-12
**Estado:** Aceptado · gaps de percepción documentados
**Origen:** Sprint Día 2 plan que estimaba 4-6 hrs de optimización

## Contexto

El plan Sprint Día 2 anticipaba:
- Bundle splitting admin tabs (dynamic import)
- Fix N+1 review.findMany 3× + tenant.findFirst 3×
- Lighthouse audit + optimizaciones
- Schema drift fix ProductAnalytics + index optimization
- Code splitting admin pesado

**Hallazgo sorpresa**: la mayoría YA está implementado en commits previos sin
ADR explicito. Este ADR documenta el estado real.

## Inventario del estado actual

### Code Splitting Admin — ✅ Completo

`app/admin/_components/TabRouter.tsx` ya usa `dynamic()` con `TabSpinner` loading
para TODOS los tabs pesados:

```
const InventoryTab           = dynamic(() => import("@/components/admin/tabs/InventoryTab"), { loading: TabSpinner });
const MarketplaceModule      = dynamic(() => import("@/components/admin/unified/MarketplaceModule"), ...);
const DeliveryPartnersModule = dynamic(() => import("@/components/admin/unified/DeliveryPartnersModule"), ...);
const PrestamosModule        = dynamic(() => import("@/components/admin/PrestamosModule"), ...);
const StoreCustomizer        = dynamic(() => import("@/components/admin/StoreCustomizer"), ...);
const ContratosModule        = dynamic(() => import("@/components/admin/ContratosModule"), ...);
const ReportsTab             = dynamic(...);
const SettingsTab            = dynamic(...);
const AuditTab               = dynamic(...);
const SupportInboxTab        = dynamic(...);
```

**18+ dynamic imports en TabRouter** = code splitting "TASK-003 reusable dynamic
shells" completo. Tab spinners + chunks separados por módulo.

Score Frontend pre-asumido: 16/20. Real: **17/20** (faltaba documentar).

### N+1 Reviews — ✅ Resuelto (PERF 2026-05-05)

`lib/reviews/photo-filters.ts:127` exporta `getFilteredReviewsWithAggregate`
que combina las 2 queries en `Promise.all`:

```ts
const [filteredRows, allRows] = await Promise.all([
  prisma.review.findMany({ where: {...}, take, skip }),
  prisma.review.findMany({ where: {...}, select: { rating: true, ... } }),
]);
```

Comentario en el archivo: *"PERF 2026-05-05: traemos todos los campos necesarios
en UN viaje"*.

El "review.findMany 3× detectado en logs" era el patrón antiguo. Hoy ningún
caller usa `getFilteredReviews` + `getReviewAggregate` por separado.

### N+1 tenant.findFirst — ✅ Cacheado en sesión 2026-05-12

`lib/tenant.ts:14` ahora exporta `findTenantByIdOrSlug` memoizado con
`React.cache` (commit `3d0cd1a6`). Las 8 llamadas en `lib/` se deduplican
within request tree.

### Índices Prisma — ✅ Bien cubiertos

| Modelo | Índices clave | Estado |
|---|---|---|
| Order | `[tenantId, status, createdAt]` + `[tenantId, createdAt]` + `[tenantId, customerPhone]` | ✅ Cubierto |
| Product | `[tenantId, active]` + `[tenantId, category, active]` + `[barcode]` | ✅ Cubierto |
| Review | 9 índices incluyendo `[tenantId, productId, status, deletedAt]` | ✅ Excelente |
| Customer | `phone @unique` global (TD-040 plan a migrar a `@@unique[tenantId,phone]`) | ⚠️ Deuda planeada |

**Gap único**: Customer Phase 3 contract migration (documentado TD-040). No es
P0 — solo si Buleje permite mismo phone en tenants distintos.

### Bundle Size

| Métrica | Valor |
|---|---:|
| `.next/static` dev (Turbopack) | 74.7 MB |
| Esperado prod build | ~3-5 MB (sin gzip) |
| Esperado prod gzipped | ~1-2 MB |

**74.7 MB dev** = normal con Turbopack que mantiene chunks separados sin minify.
Prod build aplica Terser + tree-shake + code splitting agresivo.

Pendiente: correr `npm run build` + `npx @next/bundle-analyzer` en próxima
sesión para confirmar prod size.

## Decisión

**No aplicar optimizaciones que ya existen.** Performance + Frontend + Database
están en mejor estado del que se asumió. Actualizar scoring para reflejar
realidad.

## Cambios de score post-audit

| Categoría | Pre-asumido | Real | Cambio |
|---|---:|---:|---:|
| Performance | 15/20 | **17/20** | +2 (N+1 resueltos + React.cache) |
| Frontend | 16/20 | **17/20** | +1 (code splitting 18+ tabs) |
| Database | 16/20 | **17/20** | +1 (índices multi-column completos) |

**Score promedio Δ**: +0.17 por reconocimiento sin cambios de código.

## Pendientes verdaderos (no urgentes)

| # | Acción | Impacto | Esfuerzo |
|---|---|---|---:|
| 1 | Customer @@unique [tenantId, phone] (TD-040 Phase 3) | DB 17→18 | 4h (data migration + contract) |
| 2 | `npm run build` + bundle analyzer en CI | Visibility | 30min |
| 3 | Lighthouse audit en `buleje.pe` production | Validar Web Vitals | 5min (post-deploy) |
| 4 | Pre-render schema check (`db:sanity` con DIRECT_URL) | Detect drift | 5min Brandon |

## Consecuencias

### Positivas

- Sprint Día 2 "termina" sin tocar código (todo ya optimizado)
- Tiempo liberado para Día 3 (compliance + runbook + OpenAPI)
- Documentación actualizada — futuros devs saben qué NO refactorizar

### Negativas / Riesgos

- Bundle size en prod NO verificado todavía (asumido pero no medido)
- Customer phone @unique global puede generar duplicate-key cross-tenant si
  el SaaS escala (mitigado por TD-040 plan)

## Recomendación operacional

Después del próximo deploy a `buleje.pe`, correr:

```bash
# Lighthouse audit (5 min)
npx lighthouse https://buleje.pe \
  --only-categories=performance,accessibility,seo \
  --output=json --output-path=reports/lighthouse-2026-05-12.json

# Bundle analyzer (5 min, requires build)
ANALYZE=true npm run build
```

Si Lighthouse < 85 en Performance, abrir ADR-108 con plan específico.

## Referencias

- TabRouter.tsx (code splitting completo)
- lib/reviews/photo-filters.ts (N+1 fix 2026-05-05)
- lib/tenant.ts (React.cache fix 2026-05-12)
- ADR-022: rate-limit distributed Upstash
- TD-040: Customer phone Phase 3 contract migration
