# Auditoría Backend — Buleje 2026-05-23

## Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Endpoints totales (route.ts en app/api/**) | **880** |
| DB classes lib/db/*.db.ts | **199** |
| Endpoints con `prisma` directo (viola regla #1) | **295** (33%) |
| Endpoints con `force-dynamic` reintroducido | **28** (viola regla #4) |
| Endpoints con Zod `.parse()` en vez de `safeParse()` | sample identifica ~12% no cumplidos |
| Endpoints con `requireAdmin` sin roles[] específico | varios |
| Multi-tenant: endpoints sin tenantId guard | ~30 sospechosos |

## P0 — Bloqueantes deploy

| # | Endpoint | Hallazgo |
|---|---|---|
| 1 | `app/api/admin/{dashboard, analytics, overview, health, ...}` (28 archivos) | `export const dynamic = "force-dynamic"` — incompatible con Next 16 cacheComponents |
| 2 | `app/api/marketplace/orders/route.ts:585,592,611,625` | `prisma.*` directo en creación de orders → sin cache invalidate, sin audit consistente |
| 3 | `app/api/marketplace/payment/mercadopago/webhook/route.ts:98+` | `prisma.updateMany`/`findUnique` directo en webhook MP — riesgo de doble pago si no atomic |
| 4 | `app/api/marketplace/stores/route.ts:37,45,85,231` | `prisma.*` sin filtro `tenantId` en algunos paths |

## P1 — Sistémicos

| # | Hallazgo | Conteo |
|---|---|---|
| 1 | 295 routes importan `@/lib/prisma` directo (regla #1 CLAUDE.md) | sistema entero |
| 2 | 28 `force-dynamic` reintroducido (regla #4) | 28 routes |
| 3 | `OrdersDB.getByCustomerPhone(phone)` shape legacy expone cross-tenant | 1 método |
| 4 | TD-116 (memory): 880 endpoints sin migrar a `withRlsTenant()` | sistema |
| 5 | `PaymentProofsDB` métodos sin `tenantId` obligatorio | 5 métodos |
| 6 | Endpoints con Zod `.parse()` (lanzan, no controlan) | ~12% sample |
| 7 | Endpoints sin rate-limit explícito en paths de mutación | sample sospechoso ~40 |

## P2 — Refactor

| # | Hallazgo |
|---|---|
| 1 | DB classes sin patrón consistente de cache (algunas con getOrSet, otras no) |
| 2 | Endpoints write sin `invalidate(key)` tras update (regla #5 CLAUDE.md) |
| 3 | Errores devuelven stack traces en algunos paths (debería ser JSON sano) |
| 4 | Idempotency en `MarketplaceOrdersDB.createFromCart` parcial |
| 5 | Algunos endpoints usan `try { await prisma.X.findUnique } catch` sin distinguir P2025 (not found) de error genérico |

## Top 20 endpoints con problemas

| # | Endpoint | Sev | Issue |
|---|---|---|---|
| 1 | `app/api/marketplace/orders/route.ts` | P0 | prisma directo (4×) + idempotency parcial |
| 2 | `app/api/marketplace/payment/mercadopago/webhook/route.ts` | P0 | prisma directo, doble-pago posible |
| 3 | `app/api/marketplace/stores/route.ts` | P0 | prisma directo, tenantId guard inconsistente |
| 4 | `app/api/admin/dashboard/route.ts` | P1 | force-dynamic |
| 5 | `app/api/admin/analytics/route.ts` | P1 | force-dynamic |
| 6 | `app/api/admin/overview/route.ts` | P1 | force-dynamic |
| 7 | `app/api/admin/sunat/invoices/route.ts` | P1 | force-dynamic |
| 8 | `app/api/admin/compliance-dashboard/route.ts` | P1 | force-dynamic |
| 9 | `app/api/superadmin/variant-catalog/route.ts` | P1 | force-dynamic |
| 10 | `app/api/superadmin/tenants/pending-counts/route.ts` | P1 | force-dynamic |
| 11 | `app/api/me/notifications/route.ts` | P1 | force-dynamic |
| 12 | `app/api/me/dashboard/route.ts` | P1 | force-dynamic |
| 13 | `app/api/health/route.ts` | P1 | force-dynamic |
| 14 | `app/api/subscriptions/route.ts` | P1 | force-dynamic |
| 15 | `app/api/demo/create/route.ts` | P1 | password fijo demo1234 |
| 16 | `app/api/auth/login/route.ts` | P2 | rate-limit drift dev→prod |
| 17 | `app/api/cron/sunat-retry/route.ts` | P2 | revisar idempotency |
| 18 | `app/api/whatsapp/webhook/route.ts` | P2 | verificar signature Twilio antes de procesar |
| 19 | `app/api/cron/vendor-reverify/route.ts` | **P0** | **NO EXISTE** (TD-058 capa 4 inerte — ver marketplace) |
| 20 | `app/api/stripe/webhook/route.ts` | P2 | confirmar STRIPE_WEBHOOK_SECRET env validado en startup |

## Distribución por área

| Área | Endpoints | % correctos est. |
|---|---|---|
| `api/admin` | ~250 | 70% (force-dynamic + prisma directo) |
| `api/superadmin` | ~80 | 80% |
| `api/marketplace` | ~120 | 65% (prisma directo en money paths) |
| `api/me` | ~40 | 75% (force-dynamic) |
| `api/auth` | ~20 | 90% |
| `api/cron` | ~25 | 85% (faltan: vendor-reverify) |
| `api/stripe`, `api/mercadopago` | ~15 | 80% |
| `api/whatsapp` | ~10 | 75% |
| Resto | ~320 | 75% |

## Acciones

1. **HOY**: Revertir 28 `force-dynamic` con script bulk + grep gate en pre-commit
2. **Esta semana**: Crear `/api/cron/vendor-reverify` (TD-058 capa 4 — bloquea marketplace)
3. **Esta semana**: ESLint rule `no-restricted-imports` para `@/lib/prisma` fuera de `lib/db/**`
4. **Sprint**: Migrar top 50 endpoints con prisma directo a DB classes (priorizar money paths)
5. **Sprint**: Eliminar shape legacy `OrdersDB.getByCustomerPhone(phone)`
6. **Backlog**: Refactor `PaymentProofsDB` con tenantId obligatorio
