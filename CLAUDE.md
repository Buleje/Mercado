# CLAUDE.md — Buleje (Bodega San Martín)

> **Última verificación:** 2026-05-04 · Fuente: `package.json`, `MEMORIA-PROYECTO.md`, `AGENTS.md`

**Idioma:** español. **Estilo de respuesta:** Feynman + tablas, ≤100 palabras de prosa.

---

## 1. Contexto de negocio

| Item | Valor |
|---|---|
| Negocio real | Bodega/minimarket familiar en **Pucallpa, Perú** |
| Producto digital | **ERP + e-commerce + POS + Marketplace multi-tenant** SaaS |
| Tipos de usuario | vecino (cliente), admin (dueño/cajero/almacenero), repartidor, proveedor, superadmin, vendor (marketplace) |
| Tenancy | Multi-tenant por `slug` (subdominio) o `customDomain`. Aislamiento app-level vía `tenantId` + middleware (no RLS de Postgres) |
| Pagos PE | **Yape**, efectivo, tarjeta, Stripe (suscripciones SaaS), Mercado Pago |
| Mensajería | WhatsApp (Twilio) — AI-first webhook (ADR-058) |
| Tributación | SUNAT (facturación electrónica), IGV |
| Compliance | Ley 29733 PE — audit log, GDPR-equivalent export, derecho de acceso |
| Planes SaaS | `free | pro | business`, programa Socio Buleje, Bodega al Mes |

**Ámbito funcional:** 133 tabs en panel admin, 14 fases ERP completadas (detalle histórico en `docs/HISTORY.md`) + Marketplace multi-vendor + POS móvil + Kiosk + Delivery app.

---

## 2. Stack tecnológico

### Core
| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | **16.2.3** |
| UI | React | **19.2.3** |
| Lenguaje | TypeScript (strict) | 5 |
| Estilos | Tailwind CSS | **4** (`@theme` tokens) |
| ORM | Prisma + `@prisma/adapter-pg` | **7.4.2** |
| DB | Supabase PostgreSQL | — |
| Auth | bcryptjs + JWT (`jose`) + sessions | — |
| Validación | Zod (siempre `safeParse`) | **4.3.6** |
| Estado | React Context API (no Zustand — ADR-056) | — |
| State machines | XState | 5 |
| Workspaces | `packages/*` (design-system propio) | — |

### Observabilidad / Infra
| Categoría | Stack |
|---|---|
| Monitoring | Sentry, Vercel Analytics, Speed Insights, `@vercel/otel`, OpenTelemetry, PostHog |
| Cache / RL | Upstash Redis + `@upstash/ratelimit`, Next 16 `"use cache"` + `cacheLife/Tag` |
| Queues | BullMQ (workers en `lib/queue/workers.ts`) |
| Hosting | Vercel + Capacitor (Android/iOS) |

### Integraciones externas
Stripe · Mercado Pago · Twilio (WhatsApp) · Resend · Nodemailer · Web Push (VAPID) · ubigeo-peru · Leaflet · `@ai-sdk/anthropic` + `@ai-sdk/openai` (router en `lib/claude-router.ts`).

### Testing / DX
Vitest 4 · Playwright 1.59 + `@playwright/mcp` · `@axe-core/playwright` · k6 (load) · Storybook 8 + Chromatic · ESLint 9 + Prettier 3 · Husky + lint-staged · commitlint (Conventional Commits) · size-limit · `@next/bundle-analyzer`.

---

## 3. Mapa de módulos

### `app/` (38 segmentos)
| Segmento | Propósito |
|---|---|
| `(store)/` | Tienda pública: home, `tienda`, `cuenta`, `mis-pedidos`, `buscar` |
| `(marketing)/`, `(onboarding)/` | Landing y onboarding tenants |
| `admin/` | Panel ERP (133 tabs en `page.tsx` con `next/dynamic`) |
| `marketplace/` | Cross-store catálogo, vendors, comisiones |
| `superadmin/` | Plataforma SaaS (gestión tenants) |
| `panel/`, `cms/` | Editor visual + page-builder |
| `delivery/`, `delivery-app/` | Repartidor (+ Capacitor) |
| `supplier/` | Portal proveedores |
| `t/[tenantSlug]/` | Storefront por tenant (white-label) |
| `api/` | **903 endpoints** REST |
| `checkout/`, `pedido/`, `tracking/`, `venta/` | Flujos de compra y POS |
| `pricing/`, `vender/`, `tiendas/` | Marketing SaaS |
| `playground/`, `design-system/`, `api-docs/` | Internos / dev |

### `lib/` (~222 archivos)
- **`lib/db/`** (≈196 clases `*.db.ts`) — única vía de acceso a Prisma. Cada clase: `tenantId` 1er param, cache + audit + invalidate.
- **`lib/auth/`** — sesiones, RBAC `role-permissions.ts` (26 recursos × 6 roles).
- **`lib/middleware/`, `proxy.ts`** — auth, CSP, rate limit, multi-tenant guard.
- **`lib/ai/`, `lib/agents/`, `claude-router.ts`** — features IA (chef, asistente, recomendaciones).
- **`lib/cache.ts`, `lib/circuit-breaker.ts`, `lib/cron/`, `lib/queue/`** — infra.
- **`lib/billing/`, `lib/commissions.ts`, `lib/credit/`, `lib/coupons/`** — dinero.
- **`lib/audit/`, `lib/compliance/`, `lib/cms/`, `lib/analytics/`** — gestión.
- **`lib/env.ts`** — valida secrets en startup.

### `components/` (30 subdirs)
`admin/` (133 tabs) · `store/` · `checkout/` · `marketplace/` · `customer/` · `delivery/` · `supplier/` · `superadmin/` · `socio-buleje/` · `loyalty/` · `landing/` · `marketing/` · `cms` (`blocks/`) · `ui/` + `ui-system/` (primitivos del DS) · `auth/` · `notifications/` · `onboarding/` · `accessibility/` · `tracking/` · `seo/` · `charts/` · `providers/`.

### `contexts/` (19)
`cart` · `customer` · `theme` · `settings` · `tenant` · `favorites` · `wishlist` · `compare` · `currency` · `locale` · `vocabulary` · `subscription` · `socio-buleje` · `promotions` · `quick-add` · `reviews` · `module-tabs` · `dashboard-data` · `assistant` · `toast`.

### `prisma/schema.prisma` — **177 modelos**
Tenant · Product (+ Image/Variant/Modifier) · Customer · Order/OrderItem · Sale/SaleItem · Supplier · PurchaseOrder · Promotion · Coupon · CashRegister · Batch · Review · AdminUser/SuperadminUser · Notification · WhatsAppConversation · StripeWebhookQueue · CMS (Page/PageBlock/Media) · Treasury · Fiado · Turno · Receta · Cotizacion · GuiaRemision · NotaCredito · etc.

### `docs/adr/` (ADRs vivos)
057 hub-spoke · 058 whatsapp-ai-first · 059 marketplace-retention · 069–075 design-system governance · 076 bodega-al-mes · 077 gift-cards · 078 socio-buleje · 079 vendor-approval.

---

## 4. Convenciones de código

### Reglas críticas (NO negociables)

| # | Regla | Razón |
|---|---|---|
| 1 | **Nunca `prisma.*` directo** — usar `lib/db/*.db.ts` | Cache + audit + tenantId obligatorio |
| 2 | **`safeParse()` Zod**, nunca `.parse()` | Errores controlados, no excepciones |
| 3 | **`tenantId` 1er argumento** en toda query | Aislamiento multi-tenant |
| 4 | **Next 16 sin segment configs** — `"use cache"` + `cacheLife()` + `cacheTag()` | ADR-019 |
| 5 | **Invalidar caché tras writes** — `invalidate(key)` / `invalidateByPrefix(prefix)` | Consistencia |
| 6 | **Totales en backend**; client-side solo preview | Anti-fraude checkout |
| 7 | **Fire-and-forget** con `.catch(() => {})` | Background no rompe UX |
| 8 | **`tsc --noEmit` real** — `ignoreBuildErrors: false` | — |
| 9 | **`requireAdmin(req, roles[])`** en routes protegidas | RBAC |
| 10 | **Sin secrets hardcodeados** — `.env*` + `lib/env.ts` valida startup | — |
| 11 | **Raw SQL** — solo `$1 $2 $3`, nunca interpolation | SQLi |
| 12 | **ADR nuevo** para arquitectura / contratos / schema → `/adr [título]` | — |
| 13 | **Self-heal** — 3 intentos auto antes de escalar (`/self-heal`) | — |
| 14 | **Deploy** — SLO healthy + canary 5%→25%→100% + DR drill <35d | — |

### TypeScript / Lint
- **Strict mode** activo. Path alias `@/*` → root, `@buleje/design-system` → workspace.
- ESLint 9 (`eslint.config.mjs`) extiende `next/core-web-vitals` + `next/typescript` + `prettier`.
- A11y: `eslint-plugin-jsx-a11y` (warnings, meta WCAG 2.1 AA).
- Prettier 3 corre vía `lint-staged` antes de commit.

### Diseño / Tokens
- **Sin hex hardcodeados en UI** — usar tokens del DS (`@buleje/design-system`).
- `lint-staged` corre `lint-design-tokens.ts` en `components/{admin,store,ui-system,customer}/**` y `app/t/**`.
- ADRs 069–075 gobiernan tipografía, motion, sombras, iconografía y single source of truth.
- Verifier visual: `scripts/visual-verify-admin-focused.mjs` (9 tabs críticos, ~30s).

### Componentes
- `"use client"` solo si requiere interactividad. Imports siempre **después** del directive en scripts bulk.
- Naming: `camelCase` variables, `PascalCase` componentes.
- Máx ~300 líneas por componente; lógica compleja a hooks (`hooks/`).
- Animaciones: Framer Motion / GSAP. Iconos: Lucide React.

### Commits (Conventional Commits)
`feat | fix | docs | style | refactor | perf | test | chore | ci | build | revert` — subject ≤100 chars. Husky valida con commitlint. Hook `pre-commit` corre lint-staged + tsc con `NODE_OPTIONS=--max-old-space-size=8192`.

---

## 5. Fast-Path Routing (ADR-058)

| Tier | Criterio | Dispatch | Gates |
|---|---|---|---|
| **HOTFIX** | 1 archivo, <20 líneas | Subagente directo | lint + tsc |
| **FEATURE** | 2-5 archivos, 1 área | Team slim (2-3) | lint + tsc + test |
| **DANGER** | Zona peligrosa | Squad + security | Full pipeline |
| **INITIATIVE** | 5+ archivos, ≥2 áreas | Hub BUILD→QUALITY→OPS | Todos los gates |

Templates en `.claude/team-templates/`. Arquitectura completa en `AGENTS.md` (Hub & Spoke v2: Director + 18 agentes).

---

## 6. Zona de peligro

| Archivo | Razón |
|---|---|
| `components/checkout/**`, `components/CheckoutModal.tsx` | Pagos, idempotency, totales |
| `lib/db/orders.db.ts` | State machine de órdenes |
| `lib/auth/role-permissions.ts` | 26 recursos × 6 roles |
| `proxy.ts`, `lib/middleware/**` | Auth + CSP + rate limit + multi-tenant |
| `prisma/schema.prisma` | **177 modelos**, requiere DIRECT_URL |
| `contexts/cart-context.tsx` | BroadcastChannel multi-tab |
| `lib/db/marketplace.db.ts`, `commissions.ts` | Dinero cross-vendor |

Antes de tocar cualquiera: invocar skill `audit-first` y/o `migration-planner` si afecta schema.

---

## 7. Comandos

| Grupo | Comandos |
|---|---|
| **Dev** | `npm run dev` (turbopack, default) · `npm run dev:fast` (alias) · `npm run dev:clean` (kill+lock) · `npm run dev:nuke` (kill+wipe `.next`) · `npm run dev:health` |
| **Check** | `npm run lint` · `npx tsc --noEmit` · `npm run test` · `npm run build` · `npm run test:e2e` · `npm run test:load` |
| **DB** | `npm run db:seed` · `npm run db:migrate` (migrate dev; revisar `MEMORIA-PROYECTO.md` para flujo Supabase/pgBouncer) · `npm run db:sanity` |
| **Mobile** | `npm run cap:sync` · `npm run app:build:android` |
| **OpenAPI** | `npm run openapi:generate` |
| **Storybook** | `npm run storybook` · `npm run chromatic` |
| **Queues** | `npm run queue:workers` |

---

## 8. Env vars

Mínimas: `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_BASE_URL`.
Prod: + `STRIPE_*`, `CRON_SECRET`, `SENTRY_*`, `UPSTASH_REDIS_*`, `RESEND_API_KEY`, `TWILIO_*`, `MP_*`, `VAPID_*`, `NEXT_PUBLIC_SUPABASE_*`. `DIRECT_URL` puede ser necesaria para migraciones controladas según entorno.
Schema completo en `.env.example`. Valida en startup vía `lib/env.ts`.

---

## 9. Power rules para el agente (velocidad + potencia)

1. **Paralelismo máximo**: múltiples Agent/Bash/Read en UN mensaje cuando son independientes. Si hay 3+ tareas, invocar skill `turbo-parallel`.
2. **No matar `node.exe` ni wipear `.next`**: restarts de Turbopack son caros (30-90s). Solo `dev:clean` si hay lock corrupto; `dev:nuke` solo si caché realmente corrupto.
3. **Grep/Glob antes que `Explore` agent**: Explore es para preguntas open-ended. Target conocido = Grep directo (más rápido, menos tokens).
4. **Batch reads**: leer N screenshots o N archivos en una sola tanda paralela, no secuencial.
5. **Worktrees para `ultra-impact` >50 files**: `isolation: "worktree"` en Agent. Deja el dev server principal intacto.
6. **Scripts bulk**: antes de auto-inyectar imports a `.tsx`, detectar `"use client"` y poner imports DESPUÉS del directive.
7. **Pre-refactor primitive**: grep `function <X>|const <X> =` en todo el repo para evitar shadowing (ej. PrestamosModule tenía SparklineKPICard interno clonado). Skill `shadow-detector`.
8. **Visual verify focused**: no correr los 34 tabs cada vez. `scripts/visual-verify-admin-focused.mjs` cubre los 9 críticos (~30s).
9. **Respuestas tipo tabla**: máx 100 palabras prosa + tablas + snippets. No narrar deliberación.
10. **`HUSKY_SKIP_POSTCOMMIT=1`**: default. Vitest post-commit solo con `HUSKY_RUN_POSTCOMMIT_TESTS=1`. CI ya lo corre.
11. **`NODE_OPTIONS="--max-old-space-size=8192"`**: ya configurado en pre-commit. Evita SIGKILL en bulk.
12. **Credenciales QA admin** (Playwright visual verify): `qaadmin` / `Qa-admin-1234` en tenant `main`. Crear con `node -r dotenv/config scripts/create-qa-admin-raw.mjs`.
13. **Onboarding modal**: localStorage key real = `onboarding-completed-${tenantSlug}`. Setear a `"1"` en Playwright antes de screenshots.
14. **Prisma schema drift** (suppliers `ColumnNotFound`): requiere `prisma migrate deploy` con DIRECT_URL accesible. DNS de Supabase directo puede fallar en algunas redes — correr desde red con acceso o aplicar la migration sobrante manualmente.

---

## 10. Documentación complementaria

| Archivo | Para qué |
|---|---|
| `AGENTS.md` | Arquitectura Hub & Spoke v2 (18 agentes) y protocolos de handoff |
| `MEMORIA-PROYECTO.md` | Memoria viva del proyecto (decisiones, operación crítica, gaps) |
| `docs/HISTORY.md` | Snapshot histórico de tabs/fases/batches (archivo histórico) |
| `README.md` | Quick start, deployment Vercel, API endpoints |
| `docs/adr/` | Decisiones de arquitectura vivas |
| `SESSION_HANDOFF.md` | Estado de sesión anterior (si existe) |
| `.claude/hooks/` | 23 hooks (danger zone, lint, tsc, ADR injector, deploy gates) |
