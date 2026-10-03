# CLAUDE.md — Buleje (Bodega San Martín)

> **Última verificación:** 2026-10-02 (adelgazado para velocidad: el histórico vive en `git log -p CLAUDE.md`, `docs/HISTORY.md` y las memorias) · Fuente: `package.json`, `prisma/schema.prisma`, `MEMORIA-PROYECTO.md`, `AGENTS.md`

**Idioma:** español. **Estilo de respuesta:** Feynman + tablas, ≤100 palabras de prosa. No narrar deliberación.

**Quién pide y cómo (Brandon, 2026-09-11):** dueño-operador que prueba todo en el navegador; un mensaje trae 3-6 pedidos → hacer **todos**; «aplicarlo en general» → buscar las pantallas hermanas; elige **todas** las opciones y agrega texto libre (prioridad 1). Perfil: memoria `perfil-brandon-como-trabaja`.

**Velocidad primero (Brandon, 2026-10-02):** ningún paso que siempre dé el mismo resultado — gates repetidos, lint a mano, tests de algo que no tiene lógica, 4 capturas de un cambio de texto. Qué paso SÍ y cuál NO: tabla «Economía» en `.claude/rules/agentic-style.md`. Se autoajusta solo: el arranque mide la sesión anterior y cada cierre corrige lo que más tardó («Autoajuste», misma regla).

**Cierre proactivo (Brandon 2026-06-29 → 09-25 → 10-02):** al terminar una FEATURE o INITIATIVE, cerrá con `AskUserQuestion` (multiSelect) de 3-4 opciones **independientes** + 1 recomendada, cada una con evidencia **medida** (reusá lo medido en la tarea), escrita en su idioma (tabla «Opción | Qué ganas | Ejemplo» antes del menú; Hoy / Con esto / Ejemplo; sin nombres de código). Las **8 lentes** completas (skill `/ronda-de-mejoras`, memoria `propuestas-con-lentes`) cuando pide ideas/opciones o al cerrar una INITIATIVE. HOTFIX o paso intermedio: una línea con el siguiente paso. No cierres en seco salvo «para acá».

---

## 1. Contexto de negocio

| Item | Valor |
|---|---|
| Negocio real | Bodega/minimarket familiar en **Pucallpa, Perú** + aserradero forestal (tenant Blas) |
| Lanzamiento B2C | **Ciudad Constitución** (Pasco); Pucallpa después; SaaS nacional. `lib/geo.ts` = single source |
| Producto | **ERP + e-commerce + POS + Marketplace multi-tenant** SaaS |
| Usuarios | vecino, admin (dueño/cajero/almacenero), repartidor, proveedor, superadmin, vendor |
| Tenancy | `slug` (subdominio) o `customDomain`; aislamiento app-level por `tenantId` + middleware (no RLS) |
| Pagos / mensajería | Yape, efectivo, tarjeta, Stripe (SaaS), Mercado Pago · WhatsApp Twilio AI-first (ADR-058) |
| Tributación / compliance | SUNAT + IGV · Ley 29733 (audit log, export, derecho de acceso) |
| Planes | `free | starter | pro | enterprise` (`lib/billing/wire-up/usage-tiers.ts`) |

Panel: 62 tabs (`app/admin/_components/TabRouter.tsx`, todos `next/dynamic`); las ~133 «pestañas» del habla diaria son subvistas (`lib/admin/subvistas-modulos.ts`).

## 2. Stack

Next.js **16.2** (App Router, Turbopack) · React **19.2** · TypeScript 5.9 strict (**gate = tsc 7 nativo**, ADR-428) · Tailwind **4.3** (`@theme`) · Prisma **7.8** + `@prisma/adapter-pg` · Supabase Postgres · bcryptjs + JWT (`jose`) · Zod **4** (`safeParse`) · Context API (no Zustand, ADR-056) · XState 5 · design-system en `packages/*`.
Infra: Sentry, Vercel Analytics, OTel, PostHog · Upstash Redis + ratelimit · `"use cache"` + `cacheLife/Tag` · BullMQ · Vercel + Capacitor.
Integraciones: Stripe, Mercado Pago, Twilio, Resend, Web Push, Leaflet, `@ai-sdk/anthropic` + `openai` (router `lib/claude-router.ts`).
Testing: Vitest 4 · Playwright 1.59 · axe · k6 · Storybook 8 · ESLint 9 + Prettier 3 · Husky + lint-staged + commitlint.

## 3. Mapa

- `app/`: `(store)` · `admin/` · `marketplace/` · `superadmin/` · `t/[tenantSlug]/` white-label · `api/` (~1.230 endpoints) · `checkout/`,`pedido/`,`tracking/`,`venta/` · `delivery/`,`supplier/`,`cms/`.
- `lib/db/*.db.ts` (~279 clases) = **única vía a Prisma** (cache + audit + `tenantId`). `lib/auth/` RBAC (26 recursos × 6 roles) · `proxy.ts` + `lib/middleware/` = auth/CSP/rate-limit/tenant guard · `lib/env.ts` valida secrets.
- `prisma/schema.prisma` (~254 modelos) · `contexts/` · `components/` (`ui-system/` = primitivos DS) · ADRs en `docs/adr/`.

## 4. Reglas críticas (NO negociables)

| # | Regla | Razón |
|---|---|---|
| 1 | Nunca `prisma.*` directo → `lib/db/*.db.ts` | cache + audit + tenantId |
| 2 | Zod `safeParse()`, nunca `.parse()` | errores controlados |
| 3 | `tenantId` 1er argumento, sin fallback `"main"` | aislamiento |
| 4 | Next 16 sin segment configs: `"use cache"` + `cacheLife()` + `cacheTag()` | ADR-019 |
| 5 | Invalidar caché tras writes (`invalidate` / `invalidateByPrefix`) | consistencia |
| 6 | Totales en backend; cliente solo preview | anti-fraude |
| 7 | Fire-and-forget con `.catch(err => logger…)` (el pre-commit bloquea `.catch(() => {})` nuevo) | background no rompe UX |
| 8 | Gate de tipos = `npm run typecheck` (tsc 7, 4-8 s caliente). `npx tsc` = 195 s: no. `next.config.ts` tiene `ignoreBuildErrors` a propósito | OOM en Vercel |
| 9 | `requireAdmin(req, roles[])` en rutas protegidas | RBAC |
| 10 | Sin secrets hardcodeados (`.env*` + `lib/env.ts`) | — |
| 11 | Raw SQL solo con `$1 $2`, nunca interpolación | SQLi |
| 12 | ADR nuevo para arquitectura/contratos/schema → `/adr [título]` | — |
| 13 | Self-heal: 3 intentos y escalar (`healer`) | — |
| 14 | Deploy: SLO healthy + canary 5→25→100 % + DR drill <35 d | — |

Código: strict, alias `@/*` y `@buleje/design-system`; sin hex en UI (tokens DS; `lint-design-tokens.ts` en lint-staged); ADRs 069-075 = tipografía/motion/sombras/iconos; `"use client"` solo con interactividad (imports DESPUÉS del directive en scripts bulk); ≤300 líneas por componente; Framer Motion (`m` bajo `LazyMotion`) / Lucide; commits Conventional (subject ≤100). Reglas por capa en `.claude/rules/` (cargan solo al tocar esos paths).

## 5. Ruteo por tamaño (gates proporcionales)

| Tier | Criterio | Dispatch | Gates |
|---|---|---|---|
| **HOTFIX** | 1 archivo, <20 líneas | inline (o `healer` sonnet si es gate rojo) | `typecheck` si es TS; el commit hace el resto |
| **FEATURE** | 2-5 archivos, 1 área | 1-2 subagentes con `name` (modelo según tabla de `agentic-style`) | typecheck + test del área si hay lógica + 1 captura si cambia lo que se dibuja; `reviewer` solo si la tabla «Economía» lo pide |
| **DANGER** | zona de peligro (§6) | subagente de dominio + `security` antes del merge | full pipeline |
| **INITIATIVE** | 5+ archivos, ≥2 áreas | Workflow por fases (construir → verificar con refutador) | todos |

Detalle de agentes y frontmatter: `AGENTS.md`. 8 defs en `.claude/agents/` (`architect` · `backend` · `frontend` · `database` · `healer` · `reviewer` · `security` · `tester`); el router es el hilo principal; todo subagente recibe contexto y reglas de economía por el hook `SubagentStart`. Agent teams OFF.

## 6. Zona de peligro

`components/checkout/**`, `components/CheckoutModal.tsx` (pagos, idempotencia) · `lib/db/orders.db.ts` (state machine) · `lib/auth/role-permissions.ts` · `proxy.ts`, `lib/middleware/**` · `prisma/schema.prisma` (DIRECT_URL) · `contexts/cart-context.tsx` (BroadcastChannel) · `lib/db/marketplace.db.ts`, `commissions.ts` (dinero cross-vendor). Antes de tocar: skill `audit-first` y/o `migration-planner` si afecta schema.

## 7. Comandos

| Grupo | Comandos |
|---|---|
| Dev | `npm run dev` · `dev:clean` (kill+lock) · `dev:nuke` (wipe `.next`, solo con caché corrupto) · `dev:health` |
| Check | **`npm run typecheck`** · `npm run test` · `npm run lint` (lo corre el commit) · `npm run build` · `test:e2e` · `test:load` |
| DB | `db:seed` · `db:migrate` (flujo Supabase/pgBouncer en `MEMORIA-PROYECTO.md`) · `db:sanity` |
| Otros | `cap:sync` · `app:build:android` · `openapi:generate` · `storybook` · `queue:workers` |

Env mínimas: `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_BASE_URL` (schema completo en `.env.example`, validado por `lib/env.ts`).

## 8. Reglas de operación del agente

1. **Paralelismo**: lo independiente en UN mensaje; wall-clock ≈ nº de tandas (meta ≥1,5 llamadas/mensaje).
2. **No matar `node` ni wipear `.next`**: reiniciar Turbopack cuesta 30-90 s.
3. **Grep/Glob antes que Explore**; `grep -n` → `Read` con rango.
4. **Nunca `isolation: "worktree"`** (rama larga, base vieja → se pierde lógica).
5. **Pre-refactor**: grep `function <X>|const <X> =` en todo el repo para evitar shadowing.
6. **QA**: `qaadmin` / `Qa-admin-1234` en `main` (forestal: `inversiones-agroforestales-blas-sociedad-op-qa-ui`). Recorrido conocido → `node scripts/qa-capturas.mjs` (1 llamada, ya resuelve onboarding y oscuro); el MCP de Playwright, para explorar. En localhost el panel es siempre el tenant `main`.
7. **Prisma drift** (`ColumnNotFound`/P2022): `prisma migrate deploy` con DIRECT_URL accesible; ver hub `hub-next-dev-cache`.
8. **Commits**: `HUSKY_SKIP_POSTCOMMIT=1` es default; el pre-commit corre lint-staged + tsc 7 + vitest related + tokens + anidado en paralelo.
9. **CLI**: subagentes en background, anidados hasta 3; `/verify` y `/code-review` no se auto-invocan; no existe `/gates`. Novedades: memoria `claude-code-novedades-2026-07`.
10. **Auditorías** → workflow `audit-verificado` (cada hallazgo pasa por un refutador).

## 9. Documentación

| Archivo | Para qué |
|---|---|
| `AGENTS.md` | cómo se despacha, defs y frontmatter, hook `SubagentStart` |
| `MEMORIA-PROYECTO.md` | decisiones, operación crítica, gaps |
| `SESSION_HANDOFF.md` | estado de la sesión anterior (solo la 1.ª entrada vigente) |
| `docs/adr/` · `docs/HISTORY.md` | decisiones vivas · histórico de tabs/fases |
| `.claude/hooks/` | wiring en `settings.json`: Pre = `pre-tool-guard` (mem + danger-zone + bash + deploy-gates en 1 proceso); Post = `post-edit-dispatcher` (solo `auto-learn`); Stop = checkpoint + aviso |
| `.claude/rules/` · `.claude/skills/` · `.claude/workflows/` | reglas path-scoped · skills (se descubren solas) · `audit-verificado` |
