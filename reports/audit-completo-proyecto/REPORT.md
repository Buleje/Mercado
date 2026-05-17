# Audit COMPLETO del Proyecto Buleje — 2026-05-17

**Branch:** `feat/checkout-payment-proof`
**Método:** 8 subagentes paralelos especializados + cross-cutting propio
**Alcance:** TODO el monorepo (no solo admin)

---

## Inventario global

| Capa | Cantidad |
|---|---|
| Componentes TSX | **1,640** |
| Endpoints API | **868** |
| Páginas (`app/`) | 180 |
| DB classes | 100 |
| Modelos Prisma | **172** |
| ADRs | 106 |
| Tests | 322 |
| Hooks | 87 |
| Cron jobs | **62** |
| Marketplace componentes | 313 |
| Storefront componentes | 138 |

---

## Resumen ejecutivo · 102 hallazgos

| # | Área | P0 | P1 | P2 | Otros | Total |
|---|---|---|---|---|---|---|
| 01 | Marketplace multi-vendor | 3 | 6 | 4 | — | **13** |
| 02 | Storefront SEO/Perf | 5 | 6 | 7 | — | **18** |
| 03 | Delivery / Riders | 4 | 5 | 3 | — | **12** |
| 04 | Webhooks / Integraciones | 2 | 3 | 3 | 1 P3 | **9** |
| 05 | Auth / RBAC / Multi-tenant | 1 | 4 | 3 | 7 info | **15** |
| 06 | Database / Prisma | 4 | 5 | 5 | — | **14** |
| 07 | Mobile / Capacitor / PWA | 4 | 5 | 4 | — | **13** |
| 08 | CI/CD / Infra / Observability | 2 | 5 | 1 | — | **8** |
| **TOTAL** | | **25** | **39** | **30** | **8** | **102** |

**Veredicto:** plataforma sólida en fundamentos (RBAC + multi-tenant + CSRF + JWT + hashing + raw SQL hygiene), pero con 25 P0 distribuidos en 8 áreas que **bloquean confiabilidad y dinero**. Concentración crítica: Marketplace (cross-tenant leak + error swallow), Mobile (POS móvil mock que no cobra), Database (1,106 prisma directos + índices wave-1 sin aplicar), Infra (57/62 crons sin tracking).

---

## TOP 10 P0 críticos · acción inmediata

| Rank | ID | Área | Hallazgo | Por qué urgente |
|---|---|---|---|---|
| 1 | **07-P0-1** | Mobile | `MobilePOS.handlePay()` mock — **NUNCA llama `/api/sales`** | Cajero usa `/admin/pos-mobile` → "Cobrado!" sin cobrar. PÉRDIDA DE DINERO REAL |
| 2 | **01-P0-1** | Marketplace | `storeProduct.findMany` sin `tenantId` por barcode | Cross-tenant inventory leak: admin ve precios competencia |
| 3 | **03-P0-1** | Delivery | Doble-cobro `delivery_fee` por idempotencia parcial | `recordCommission delivery_fee` sin findFirst previo |
| 4 | **06-P0-1** | Database | **431 archivos** con `prisma.*` directo (1,106 calls) | Multi-tenant leak latente — si falta `tenantId` en una sola query |
| 5 | **08-P0-2** | Infra | **57/62 crons** sin `withCronHealth` | Crons fallan silencioso sin traza en `CronHealthLog` |
| 6 | **05-P0-1** | Auth | Sin rotación `AUTH_SECRET` (estático para siempre) | Leak de .env → TODOS los JWT falsificables indefinidamente |
| 7 | **04-P0-1** | Webhooks | Sin `applyRateLimit` en webhook Stripe | DoS billing-related: 1000 req/s sin firma válida consume HMAC + Prisma |
| 8 | **07-P0-2** | Mobile | Dos `capacitor.config.*` en conflicto (`.json` gana) | APK live-reload prod (Google Play penaliza, MITM-prone) |
| 9 | **06-P0-2** | Database | `proposed-db-indexes-wave-1.sql` **NO aplicado** | 12 índices críticos sin aplicar → seq scans en Order/Product/Customer |
| 10 | **02-P0-2** | Storefront | Google Fonts `<link>` síncrono bloqueando render | +600-900ms LCP en 3G (Pucallpa) en tenant white-label |

---

## P0 por área · detalle

### 01 Marketplace (3)
- `app/api/marketplace/stores/my/products/route.ts:93` — competition pricing leak cross-tenant
- `lib/whatsapp/concierge/multi-vendor-checkout.ts:133-142` — `.catch(()=>{})` silencioso en UPDATE paymentApprovalId
- `app/api/marketplace/orders/route.ts:411-461` — 2 async IIFE con `catch {}` vacío

### 02 Storefront (5)
- `app/t/[slug]/page.tsx:369,391` — `<img>` raw en LCP (sin next/image)
- `app/t/[slug]/page.tsx:226-229` — Google Fonts sync block
- `components/marketplace/MarketplaceContent.tsx:1` — `"use client"` innecesario (40-80KB bundle)
- `components/marketplace/explorar/ExplorarClient.tsx:1` — 306 LOC client innecesario
- `app/marketplace/[slug]/producto/[productId]/page.tsx:78` — `fetch()` HTTP interno

### 03 Delivery (4)
- `lib/db/commissions.db.ts:357-363` — doble-cobro delivery_fee (idempotencia falta en este path)
- `app/api/admin/delivery/manual-assign/route.ts:37-91` — TOCTOU vs cascada (P2002 sin manejar)
- `app/api/delivery/assignments/route.ts:79-128` — override `fee` por admin sin gate (fraude)
- `app/api/admin/driver-applications/route.ts:27-145` — `extractPhoneFromBody` escalable

### 04 Webhooks (2)
- `app/api/billing/webhook/route.ts:17` — sin rate-limit Stripe webhook
- `app/api/webhooks/whatsapp/route.ts:25-74` — endpoint legacy sin rate-limit, duplica router

### 05 Auth (1)
- `lib/session.ts:90-115` — sin rotación AUTH_SECRET (toda la plataforma)

### 06 Database (4)
- 431 archivos con `prisma.*` directo (1,106 calls)
- `proposed-db-indexes-wave-1.sql` no aplicado
- `WholesaleOrder.tenantId` nullable
- `Customer.phone @unique` global (TD-040 Phase 1)

### 07 Mobile (4)
- `components/admin/MobilePOS.tsx:271-279` — `handlePay` MOCK
- `capacitor.config.json` + `.ts` en conflicto
- `themeColor: "var(--accent)"` no resuelve build-time
- Manifest dinámico `app/manifest.ts` nunca se sirve (proxy excluye)

### 08 Infra (2)
- `vercel.json:8` — timeout 30s global mata crons AI multi-tenant
- 57/62 crons sin `withCronHealth`

---

## Cross-cutting hallazgos propios

| Patrón | Cantidad | Acción |
|---|---|---|
| Endpoints mutadores sin `assertCsrf` explícito | **373/474** | Filtrar webhooks/cron/internal legítimos → enforcement en CI |
| Endpoints con `prisma.*` directo sin eslint-disable | **135** | Plan de migración progresiva (regla #1) |
| Páginas con `fetch("/api/...")` interno (RSC anti-pattern) | **50** | Migrar a DB layer directo (Storefront audit confirma 1 P0) |
| `force-dynamic` real (regla #4 Next 16) | 1 (`onboarding/industry`) | Quitar o migrar a `"use cache"` |
| Componentes con `shadow-2xl` (warn DS) | 20 | Migrar a `shadow-[var(--shadow-xl)]` (ADR-072) |

---

## Lo que SÍ está bien (validado en 8 áreas)

### Seguridad
- CSRF double-submit constant-time (audit 04 + 05)
- JWT con jti blacklist, refresh + access separados (lib/session)
- Timing-safe login con padding a 50 hashes + DUMMY_HASH (anti enumeration)
- bcrypt rounds 12 en password
- TOTP replay protection (window + last-used-step)
- Webhooks firma HMAC + anti-replay (Stripe 1h, MP 5min)
- SSRF allowlist (Twilio + Meta CDN)
- Prompt injection mitigation en concierge AI
- Sin secrets hardcodeados, sin .env commiteados
- Purge TOTP forzado + reason + literal

### Arquitectura
- Multi-tenant defense en `require-admin.ts` (no fallback "main")
- Tenant resolution con header validation
- Cache Components Next 16 + cacheLife/cacheTag
- Hub-spoke v2 + 14 agentes especializados
- 106 ADRs vivos
- Pre-commit: lint + tsc + tests changed
- Sentry + OpenTelemetry configurados

### Negocio
- Idempotencia atómica Stripe/MP webhooks
- Anti-replay timing en webhooks
- Cross-tenant claim Stripe valida customerId
- Order state machine documentada (ADR + skill)
- Backup diario encriptado

---

## Plan de ejecución sugerido

### Hot-fix inmediato (2-4h)
1. **07-P0-1** MobilePOS mock → implementar real (copiar de POSView)
2. **01-P0-2/P0-3** error swallows en marketplace orders (logger.warn)
3. **04-P0-1** rate-limit en Stripe webhook (10 min)
4. **08-P0-1** timeout override AI crons en vercel.json (3 líneas)

### Sprint 1 (1 semana)
- **06-P0-2** aplicar `proposed-db-indexes-wave-1.sql` (zero-downtime, `CONCURRENTLY`)
- **08-P0-2** script bulk migrar 57 crons a `withCronHealth`
- **07-P0-2** decisión Capacitor: borrar `.json` o invertir
- **03-P0-1..3** delivery: idempotencia + TOCTOU + fee guard
- **01-P0-1** competition pricing scope al tenant propio o ADR explícito

### Sprint 2 (1 semana)
- **05-P0-1** implementar rotación AUTH_SECRET (multi-secret list)
- **06-P0-1** plan progresivo migración 431 archivos prisma → DB classes
- **02-P0-1..5** storefront: next/image en LCP + fonts + RSC split + PDP DB layer
- **07-P0-3/P0-4** theme color hex + manifest fix

### Backlog priorizado
- 39 P1 distribuidos en áreas
- 30 P2 deuda técnica
- Refactor TENANT_MODELS (60 → 173 modelos)
- Migrar Float financiero → Decimal (8 columnas)

---

## Reportes detallados

| Reporte | Hallazgos |
|---|---|
| [01-marketplace.md](./01-marketplace.md) | 13 (3 P0, 6 P1, 4 P2) |
| [02-storefront-seo-perf.md](./02-storefront-seo-perf.md) | 18 (5 P0, 6 P1, 7 P2) |
| [03-delivery.md](./03-delivery.md) | 12 (4 P0, 5 P1, 3 P2) |
| [04-webhooks-security.md](./04-webhooks-security.md) | 9 (2 P0, 3 P1, 3 P2, 1 P3) |
| [05-auth-rbac.md](./05-auth-rbac.md) | 15 (1 P0, 4 P1, 3 P2, 7 info) |
| [06-database.md](./06-database.md) | 14 (4 P0, 5 P1, 5 P2) |
| [07-mobile-pwa.md](./07-mobile-pwa.md) | 13 (4 P0, 5 P1, 4 P2) |
| [08-infra-cicd.md](./08-infra-cicd.md) | 8 (2 P0, 5 P1, 1 P2) |

---

## Acciones de prevención sugeridas

1. **CI script** que falle si:
   - `requireAdmin(req)` sin segundo argumento (audit admin ya marcó 17 endpoints)
   - Mutator endpoints sin `assertCsrf` (373/474 hoy)
   - `prisma.*` directo nuevo (más allá de allowlist)
   - `withCronHealth` faltante en `app/api/cron/**`
2. **Audit automático** de `invalidate` coverage en `lib/db/*.db.ts` writes
3. **`gitleaks`** en CI (no instalado hoy)
4. **ESLint rules custom:**
   - `Number(x).toFixed()` sin `isFinite` guard
   - `fetch(...).then(r => r.ok ? r.json() : [])` swallow pattern
   - `<img>` raw fuera de iconos SVG inline
5. **DR drill** mensual obligatorio (hoy: 0 ejecuciones registradas)
6. **Bundle analyzer** automático en PR (audit storefront detectó 80KB extra)

---

*Generado: 2026-05-17 · 8 subagentes paralelos especializados (Code Reviewer + Performance Engineer + Bug Hunter + Security Pentester + Security Auditor + Database Engineer + Bug Hunter + DevOps Release Engineer) · NO modifica código, solo reporta.*
