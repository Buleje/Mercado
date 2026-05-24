# Auditoría de Seguridad Completa — Buleje (Bodega San Martín)

**Fecha:** 2026-05-23 · **Branch:** `prod` · **Alcance:** OWASP Top 10 sobre `app/api` (882 routes), `lib/db` (199 db classes), `proxy.ts`, `lib/middleware/**`, `lib/auth/**`.

**Riesgo general:** **MEDIO-BAJO**. Base sólida (CSP, CSRF double-submit, HMAC sessions, RBAC granular, raw SQL parametrizada, npm audit limpio, secrets gitignored, RNG criptográfico en tokens). Hallazgos concentrados en (a) higiene de credenciales demo, (b) **28 violaciones documentadas de la regla CLAUDE.md #4 `force-dynamic`** y (c) 295 endpoints que importan `prisma` directo (regla #1).

## Resumen ejecutivo — top 5 P0/P1

| # | Sev | Hallazgo | Impacto |
|---|---|---|---|
| 1 | **P1** | 295 routes en `app/api/**` importan `prisma` directo en vez de `lib/db/*.db.ts` (viola CLAUDE.md regla #1) | Sin cache + audit trail consistente; riesgo de queries sin `tenantId` aislamiento app-level (no hay RLS). |
| 2 | **P1** | **28 violaciones `export const dynamic = "force-dynamic"`** en `app/api/**` (viola CLAUDE.md regla #4) | Memoria persistente del proyecto (`feedback_no_force_dynamic_next16.md`) marca esto como **rompe servidor** en Next 16 con `cacheComponents`. Hotfix `bdb6f5f2` revirtió 16; ahora hay 28 reintroducidas. |
| 3 | **P1** | `Math.random()` en generación de códigos de **cupones**, **gift cards** y **delivery IDs** (`lib/db/cupones.db.ts:32`, `gift-cards.db.ts:444`, `delivery.db.ts:621`) | Códigos predecibles (~41 bits) → atacante puede generar/canjear cupones ajenos. Sessions ya migraron a CSPRNG; falta cerrar este lote. |
| 4 | **P1** | Demo credentials estáticas en respuesta JSON: `password: "demo1234"` (`app/api/demo/create/route.ts:452`) | Si un atacante crea N tenants demo en producción → todos comparten password fijo. Mínimo: randomizar + entregar 1 sola vez. |
| 5 | **P1** | `lib/db/payment-proofs.db.ts` opera **sin `tenantId`** declarado en su API (`getById(id)`, `listAll()`, `approve(id,…)`) | Comprobantes de pago accesibles cross-tenant si la route handler que lo consume olvida derivar el tenant desde la sesión. |

## Tabla completa de hallazgos

| # | Sev | OWASP | Archivo:Linea | Hallazgo | Fix sugerido |
|---|---|---|---|---|---|
| 1 | P1 | A05 | múltiples (28) `app/api/**/route.ts` con `export const dynamic = "force-dynamic"` | Incompatible con `nextConfig.cacheComponents`. Reintroducido en: `app/api/admin/{overview,seed-data,clear-data,export-all,health,dashboard,analytics,sunat/invoices,compliance-dashboard,chat/threads,log-error,leads}`, `app/api/superadmin/{variant-catalog,image-bank,tenants/pending-counts}`, `app/api/me/{notifications,referral-status,dashboard,addresses,credit-score,favorites,spending-summary,order-history}`, `app/api/{health,subscriptions}` | Reemplazar por `"use cache"` + `cacheLife()/cacheTag()` (ADR-019). |
| 2 | P1 | A01 | `app/api/**/route.ts` (295 archivos importan `@/lib/prisma` directo) | Viola CLAUDE.md #1. Sin garantía `tenantId` 1er-arg, sin cache invalidate, sin audit. | Migrar a DB classes. ESLint rule `no-restricted-imports` para bloquear. |
| 3 | P1 | A02 | `lib/db/cupones.db.ts:32` `Math.random().toString(36).slice(2,10)` | RNG predecible. | `crypto.randomBytes(8).toString("base64url")`. |
| 4 | P1 | A02 | `lib/db/gift-cards.db.ts:444` `Math.random()` en ID de redención | Dinero real expuesto. | CSPRNG. |
| 5 | P2 | A02 | `lib/db/delivery.db.ts:621` `dt_${Date.now()}_${Math.random()…}` | Trip ID adivinable → IDOR. | `dt_${randomUUID()}`. |
| 6 | P2 | A02 | `lib/db/image-bank.db.ts:61`, `lib/db/referrals.db.ts:44-53` `Math.random()` | Mismo patrón. | Quitar fallback. |
| 7 | P1 | A05 | `app/api/demo/create/route.ts:452` `password: "demo1234"` | Demo tenants comparten password fijo. | Generar password aleatorio 16 chars, retornar 1 sola vez. |
| 8 | P1 | A01 | `lib/db/payment-proofs.db.ts` API sin `tenantId` | IDOR posible si endpoints no cross-checkean. | Forzar `getById(id, expectedTenantSlug?)`. |
| 9 | P1 | A05 | `lib/db/orders.db.ts:231-244` `getByCustomerPhone(tenantIdOrPhone, phone?)` shape dual | Rama legacy expone órdenes cross-tenant. | Eliminar rama legacy. |
| 10 | P2 | A07 | `app/api/auth/login/route.ts` rate-limit "AUTH 50/h en dev" | Drift potencial en prod. | Confirmar `RATE_LIMITS.AUTH` ≤ 10/h en prod. |
| 11 | P2 | A01 | `lib/middleware/tenant.ts:125` retorna `rawSlug` crudo si no resuelve | Defensa frágil. | Bloquear con 404. |
| 12 | P2 | A04 | `proxy.ts:69` rate limit excluye `NODE_ENV==="development"` | DoS si NODE_ENV mal seteado. | Validar en `lib/env.ts`. |
| 13 | P2 | A03 | `app/api/marketplace/payment/mercadopago/webhook/route.ts` `prisma.*` directo | `updateMany`/`findUnique` sin cache invalidate. | Crear `OrdersDB.markPaidByExternalRef`. |
| 14 | P2 | A06 | `lib/db/payment-proofs.db.ts:59` `CREATE TABLE IF NOT EXISTS` en runtime | Drift entre schema y DB. | Migration formal. |
| 15 | P2 | A09 | `lib/db/sales.db.ts:51-52,98` admite "schema drift" omitiendo `idempotencyKey` | Retry POS puede duplicar venta. | `prisma migrate deploy` para aplicar drift. |
| 16 | P3 | A03 | `dangerouslySetInnerHTML` con `JSON.stringify(jsonLd)` en 22 sitios | Si campos JSON-LD contienen `</script>` literal → XSS. | Escape `\\u003c`. |
| 17 | P3 | A05 | `lib/middleware/security-headers.ts` no setea HSTS | Vercel agrega por default; defensa-en-profundidad. | Setear `Strict-Transport-Security` solo en prod. |

## Verificaciones positivas

| Control | Estado |
|---|---|
| `npm audit` | ✅ 0 vulns |
| Bcrypt hashing | ✅ |
| HMAC session tokens (CSPRNG) | ✅ |
| CSRF double-submit | ✅ |
| Rate limit edge | ✅ Upstash |
| CSP + nonce | ✅ |
| X-Frame-Options DENY | ✅ |
| Tenant fallback HMAC verify | ✅ |
| Path traversal slug | ✅ |
| `.env*` gitignored | ✅ |
| MercadoPago webhook HMAC obligatorio | ✅ |
| Open-redirect helper | ✅ |
| RBAC matrix 26 recursos × 6 roles | ✅ |
| XSS fix ActivityTracker (P0 hist) | ✅ |
| Raw SQL parametrizada | ✅ |
| PII redaction webhook queue | ✅ |
| Idempotency orders + metering | ✅ |
| Cron auth timingSafeEqual | ✅ |

## Resumen por severidad

| Sev | Cantidad |
|---|---|
| P0 | 0 |
| P1 | 6 |
| P2 | 8 |
| P3 | 3 |
| **Total** | **17** |

## Acciones recomendadas (orden)

1. **HOY** — Revertir las 28 `force-dynamic` (riesgo rompe-servidor)
2. **Esta semana** — `Math.random()` → CSPRNG en 4 archivos
3. **Esta semana** — Randomizar password demo
4. **Sprint** — ESLint rule `no-restricted-imports` para `@/lib/prisma`
5. **Sprint** — Eliminar shape legacy de `OrdersDB.getByCustomerPhone`
6. **Sprint** — Reforzar `PaymentProofsDB`
7. **Backlog** — HSTS explícito
