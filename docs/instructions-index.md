# Instructions Index — `.github/instructions/`

> Índice maestro de las **34 skills declarativas** del repo "agencia" raíz. Cada archivo `*.instructions.md` define cómo trabajar en una zona específica del código. Los agentes Claude deben leerlos automáticamente vía `applyTo` globs, pero este índice ayuda a saber qué existe sin abrir 34 archivos.
>
> **Ubicación real:** `Prueba 2/.github/instructions/*.instructions.md`
> **Cómo se activan:** por glob `applyTo` del frontmatter — se aplican a los archivos que matchean.
> **Última revisión del índice:** 2026-04-08

---

## 🔐 Seguridad + Auth + RBAC

| Skill | Se aplica a | Qué cubre |
|---|---|---|
| `security-auth` | `auth/**`, `middleware*`, `login*`, `role*`, `permission*`, `requireAdmin*` | RBAC 26×6, JWT sessions, `requireAdmin()` guard, roles, permisos |
| `error-prevention` | `api/**`, `lib/db/**`, `lib/auth/**`, `prisma/**`, `middleware*` | Patrones para evitar bugs clásicos de auth, DB y validación |
| `rate-limiting` | `app/api/**` | Cómo aplicar `applyRateLimit()` en nuevos handlers |
| `zod-validation` | `api/**`, `schemas/**`, `*.schema.ts` | Patrón `safeParse()`, schemas reutilizables, error shape |

---

## 🏗️ Arquitectura y patrones core

| Skill | Se aplica a | Qué cubre |
|---|---|---|
| `api-patterns` | `app/api/**` | Estructura estándar del route handler (auth → Zod → DB → logActivity) |
| `db-classes` | `lib/db/**/*.db.ts` | Cómo escribir una DB class con cache + audit trail + tenantId obligatorio |
| `prisma-database` | `prisma/**`, `schema.prisma`, `*.db.ts` | Patrones Prisma: include vs select, transacciones, relaciones |
| `prisma-schema` | `prisma/**`, `schema.prisma` | Reglas del schema: índices, relaciones, naming, multi-tenant |
| `database-migrations` | `prisma/**`, `*.db.ts`, `db/**` | Migraciones seguras, rollback, DIRECT_URL vs DATABASE_URL |
| `caching-strategy` | `lib/cache*`, `**/*cache*` | `getOrSet()`, `invalidateByPrefix()`, TTLs recomendados |
| `multi-tenant` | `lib/db/**`, `api/**`, `tenant*`, `lib/tenant*` | Aislamiento por tenantId en cada query, dual tenant resolution |
| `fire-and-forget` | `api/**`, `lib/db/**`, `lib/notifications*` | Cuándo usar `.catch(()=>{})` vs `enqueueX()` de BullMQ |
| `error-handling` | `error.tsx`, `loading.tsx`, `error-boundary*`, `toast*` | Error boundaries, toasts, loading states |
| `server-actions` | `actions/**`, `*-action.ts`, `*-actions.ts` | Server Actions de Next.js 16 — cuándo sí y cuándo no |
| `state-management` | `contexts/**`, `hooks/use*`, `*context*` | Context patterns, `useReducer`, BroadcastChannel multi-tab |

---

## 🛒 Dominio de negocio (ERP + e-commerce)

| Skill | Se aplica a | Qué cubre |
|---|---|---|
| `checkout-flow` | `CheckoutModal*`, `CartSidebar*`, `checkout*` | Pagos Yape/Stripe, cupones, reservas, state machine — **zona de peligro** |
| `pos-cashier-flow` | `POSCaja*`, `pos*`, `cashier*`, `CajaModule*` | Flujo POS cajero: turnos, caja, arqueo, ticket |
| `fefo-inventory` | `batch*`, `inventory*`, `stock*`, `warehouse*` | FEFO (first expired first out), expiryDate vs expiresAt, lotes |
| `erp-admin-panel-expert` | `components/admin/**` | Cómo agregar/editar tabs, convenciones del dashboard |
| `erp-saas-architect` | `components/admin/**`, `app/admin/**`, `lib/db/**` | Vista sistémica del ERP multi-tenant |

---

## 🎨 UI / Frontend

| Skill | Se aplica a | Qué cubre |
|---|---|---|
| `ui-ux-design` | `components/**/*.tsx`, `globals.css`, `tailwind.config*` | Tokens, colores brand, jerarquía visual, premium sin overload |
| `responsive-mobile` | `app/**/*.tsx`, `layout.tsx`, `capacitor*` | Breakpoints, touch targets, safe areas, Android gama baja |
| `performance-web` | `layout.tsx`, `page.tsx`, `Image*`, `next.config*` | LCP, CLS, Image optimization, lazy loading, bundle splitting |
| `seo-metadata` | `metadata*`, `layout.tsx`, `sitemap*`, `robots*` | Open Graph, JSON-LD, metadata dinámica por tenant |

---

## 🧪 Testing

| Skill | Se aplica a | Qué cubre |
|---|---|---|
| `testing-strategy` | `__tests__/**`, `e2e/**`, `*.test.*`, `*.spec.*` | Pirámide de tests, mocking `server-only`, coverage thresholds |
| `e2e-patterns` | `e2e/**` | Playwright: selectors, auth patterns, assertions, retries |

---

## 📡 Integraciones externas

| Skill | Se aplica a | Qué cubre |
|---|---|---|
| `whatsapp-integration` | `whatsapp*`, `webhook*`, `notification*` | Templates, API key, idempotency por minuteBucket |
| `notifications-push` | `push*`, `subscription*`, `notification*`, `sw*` | Web Push, VAPID keys, service worker |
| `supabase-integration` | `supabase*`, `prisma.ts`, `lib/prisma*` | Supabase pooler workaround, Prisma adapter-pg |
| `capacitor-mobile` | `capacitor*`, `android/**`, `ios/**` | Build Capacitor, plugins nativos, deep links |

---

## 🔄 DevOps + Release

| Skill | Se aplica a | Qué cubre |
|---|---|---|
| `deployment-vercel` | `vercel.json`, `next.config*`, `.env*` | Deploy preview, prod promotion, env vars, rolling releases |
| `git-workflow` | `.git*`, `.husky/**`, `.lintstagedrc*` | Conventional Commits, pre-commit gates, branching |

---

## 🤖 Meta / Agent

| Skill | Se aplica a | Qué cubre |
|---|---|---|
| `agent-team-workflow` | `CLAUDE.md`, `.claude/commands/**` | Cómo despachar Agent Teams paralelos, roles, gates |
| `post-task-advisor` | `**` (todo) | Formato del closing después de cada tarea (tabla de mejoras) |

---

## 🎯 Cómo usar este índice

1. **Antes de tocar un archivo**, mirá en qué fila cae por su ruta.
2. Leé la skill correspondiente — **son skills cortas** (< 200 líneas cada una).
3. Si no hay skill para lo que estás haciendo, eso es una señal: probablemente estás entrando en terreno sin convención → creá una instrucción nueva o abrí un ADR.
4. Si una skill contradice a otra, priorizá la más específica (`checkout-flow` gana a `api-patterns` para archivos del checkout).

## 🧭 Gaps del índice (cosas que NO tienen skill propio aún)

- **`lib/queue/**` (BullMQ workers)** — hoy cae bajo `fire-and-forget` pero merece skill propio
- **`lib/feature-flags.ts`** — solo documentado en ADR 005, sin instrucción operativa
- **`lib/llm-router/**`** — ADR 010 pero sin skill
- **`lib/domain-events/**`** — ADR 007 pero sin skill
- **`app/superadmin/**`** — sin skill específico (usa `erp-saas-architect` genérico)
- **`docs/plans/**`** — este flujo nuevo, sin skill aún (TODO)

---

**Fuente de verdad:** el código + los frontmatters de cada `.instructions.md`. Si este índice queda desincronizado, regenerar con el comando documentado en `AGENTS.md`.
