# CLAUDE.md — Buleje (Bodega San Martín)

> **Última verificación:** 2026-06-17 · Fuente: `package.json`, `prisma/schema.prisma`, `MEMORIA-PROYECTO.md`, `AGENTS.md`

**Idioma:** español. **Estilo de respuesta:** Feynman + tablas, ≤100 palabras de prosa.

**Cierre proactivo (DEFAULT, Brandon 2026-06-29):** al terminar CASI SIEMPRE una tarea, cerrá ofreciendo **sugerencias con OPCIONES para elegir** — features nuevas, mejoras a páginas/módulos ya creados, mejoras de alto impacto, y "continuar con la siguiente ronda". Usá `AskUserQuestion` (multiSelect cuando aplique) con 2-4 opciones concretas + 1 recomendada. No cierres en seco salvo que Brandon diga "para acá" o sea un paso intermedio de una tarea en curso.

---

## 1. Contexto de negocio

| Item | Valor |
|---|---|
| Negocio real | Bodega/minimarket familiar en **Pucallpa, Perú** |
| Lanzamiento B2C | **Ciudad Constitución** (Pasco, Selva Central); Pucallpa = fase posterior. SaaS = nacional. `lib/geo.ts` = single source |
| Producto digital | **ERP + e-commerce + POS + Marketplace multi-tenant** SaaS |
| Tipos de usuario | vecino (cliente), admin (dueño/cajero/almacenero), repartidor, proveedor, superadmin, vendor (marketplace) |
| Tenancy | Multi-tenant por `slug` (subdominio) o `customDomain`. Aislamiento app-level vía `tenantId` + middleware (no RLS de Postgres) |
| Pagos PE | **Yape**, efectivo, tarjeta, Stripe (suscripciones SaaS), Mercado Pago |
| Mensajería | WhatsApp (Twilio) — AI-first webhook (ADR-058) |
| Tributación | SUNAT (facturación electrónica), IGV |
| Compliance | Ley 29733 PE — audit log, GDPR-equivalent export, derecho de acceso |
| Planes SaaS | `free | starter | pro | enterprise` (`lib/billing/wire-up/usage-tiers.ts`), programa Socio Buleje, Bodega al Mes |

**Ámbito funcional:** 133 tabs en panel admin, 14 fases ERP completadas (detalle histórico en `docs/HISTORY.md`) + Marketplace multi-vendor + POS móvil + Kiosk + Delivery app.

---

## 2. Stack tecnológico

### Core
| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | **16.2.6** |
| UI | React | **19.2.6** |
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

## 3. Mapa de módulos (resumen — el detalle se infiere del código)

- **`app/`** (38 segmentos): `(store)` tienda pública · `admin/` (133 tabs, `next/dynamic`) · `marketplace/` · `superadmin/` · `t/[tenantSlug]/` white-label · `api/` **~924 endpoints** · `checkout/`,`pedido/`,`tracking/`,`venta/` · `delivery/`,`supplier/`,`cms/`.
- **`lib/db/`** ≈203 clases `*.db.ts` = **única vía a Prisma** (cache+audit+`tenantId`). `lib/auth/` RBAC (26 recursos × 6 roles) · `proxy.ts`+`lib/middleware/` = auth/CSP/rate-limit/multi-tenant guard · `claude-router.ts` IA · `lib/{billing,commissions,credit,coupons}` dinero · `lib/env.ts` valida secrets.
- **`prisma/schema.prisma`** = **189 modelos** (Tenant/Product/Order/Sale/Supplier/Promotion/CashRegister/Fiado/Turno/SUNAT/CMS…). `contexts/` (19) · `components/` (30 subdirs, incl. `ui-system/` primitivos DS).
- **ADRs vivos** en `docs/adr/`: 057 hub-spoke · 058 whatsapp-ai-first · 059 marketplace · 069-075 design-system · 076-079.

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
| 13 | **Self-heal** — 3 intentos auto antes de escalar (agente `healer`) | — |
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

| Tier | Criterio | Dispatch | Modelo/effort subagentes | Gates |
|---|---|---|---|---|
| **HOTFIX** | 1 archivo, <20 líneas | Subagente directo | `haiku`/`sonnet` (mecánico = barato) | lint + tsc |
| **FEATURE** | 2-5 archivos, 1 área | Team slim (2-3) | default (heredar) | lint + tsc + test |
| **DANGER** | Zona peligrosa | Squad + security | `opus`/effort alto | Full pipeline |
| **INITIATIVE** | 5+ archivos, ≥2 áreas | Hub BUILD→QUALITY→OPS o **Workflow** (`audit-verificado` como template) | mixto por fase | Todos los gates |

Templates en `.claude/team-templates/`. Arquitectura completa en `AGENTS.md` (Hub & Spoke v2: Director + 14 agentes canónicos + 3 specialists (dark-mode-auditor, storefront-visual-qa, typography-enforcer) = **17 agent defs activos** en `.claude/agents/`. 36 defs legacy absorbidos → archivados en `.claude/_agents-archive/`, NO se cargan; los skills referencian solo nombres canónicos).

---

## 6. Zona de peligro

| Archivo | Razón |
|---|---|
| `components/checkout/**`, `components/CheckoutModal.tsx` | Pagos, idempotency, totales |
| `lib/db/orders.db.ts` | State machine de órdenes |
| `lib/auth/role-permissions.ts` | 26 recursos × 6 roles |
| `proxy.ts`, `lib/middleware/**` | Auth + CSP + rate limit + multi-tenant |
| `prisma/schema.prisma` | **189 modelos**, requiere DIRECT_URL |
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
15. **Claude Code 2026** (v2.1.220, verificado changelog 2026-08-03): `/goal` = condición de completitud con evaluador externo (corridas autónomas); `/btw` = preguntas laterales sin gastar contexto; `/rewind` restaura incluso pre-`/clear`; `/clear` entre tareas no relacionadas; tras 2 correcciones fallidas → replantear. **Subagentes corren en background por DEFAULT** (fan-out no bloquea) y **anidan hasta profundidad 3** (2.1.219 — un builder spawnea su propio verifier; NO 5 como decía antes). **`/verify` y `/code-review` ya NO se auto-invocan** (2.1.215) — dispararlos explícitos; `/code-review` corre como subagente background (2.1.218). `/fork` = copiar la conversación a una sesión background conservando el trabajo (2.1.212). MCP calls >2 min se van a background solas (2.1.212). Límites por sesión: 200 subagentes / 200 WebSearch (2.1.212). `/doctor` = checkup con auto-fix + poda de CLAUDE.md (correr quincenal). Permisos por parámetro: `Tool(param:valor)`. **Context resets + estado en archivos > compaction** en corridas largas.
16. **Reglas path-scoped en `.claude/rules/`** — cargan solo al tocar archivos que matchean (db-classes, ui-components, danger-zone, agentic-style, **code-quality** = estándar enterprise fijo: tipos/DS/errores/refactor/verificación/commits). Gotchas nuevos de capa → ahí, NO inflar este archivo.
17. **Workflow `audit-verificado`** — auditorías con verificación adversarial integrada (cada hallazgo pasa por un refutador). Usar para "auditá X" en vez de N agentes sueltos.

---

## 10. Documentación complementaria

| Archivo | Para qué |
|---|---|
| `AGENTS.md` | Arquitectura Hub & Spoke v2 (14 agentes canónicos) y protocolos de handoff |
| `MEMORIA-PROYECTO.md` | Memoria viva del proyecto (decisiones, operación crítica, gaps) |
| `docs/HISTORY.md` | Snapshot histórico de tabs/fases/batches (archivo histórico) |
| `README.md` | Quick start, deployment Vercel, API endpoints |
| `docs/adr/` | Decisiones de arquitectura vivas |
| `SESSION_HANDOFF.md` | Estado de sesión anterior (si existe) |
| `.claude/hooks/` | Hooks (wiring real en `settings.json`): mem-guard, danger-zone, pre-bash-guard (Pre); `post-edit-dispatcher` async (Post — gatea y spawnea hex/auto-learn/typography/screenshot/rubric solo si el path matchea); deploy-gates solo en Skill(deploy); Stop = gate agente de evidencia |
| `.claude/rules/` | Reglas path-scoped 2026 — cargan SOLO al tocar archivos que matchean (db, ui, danger-zone, agentic-style, code-quality) |
| `.claude/workflows/` | Workflows guardados — `audit-verificado` (auditoría + refutación adversarial) |
| `.claude/rubrics/` | Rubrics bash-verificables por capa (api, db, migration, ui) — usa `outcome-evaluator` |
| `.claude/skills/` | Skills v2 (`allowed-tools`+`model`+`argument-hint`); el harness los surface por descripción — niche/dead en `_archive/` |

---

## 11. Power assets (auto-descubribles — no re-listar aquí, se desincronizan)

> Regla: skills, hooks y rubrics se descubren solos (harness + `settings.json` + `.claude/rubrics/`). Listarlos en este archivo los deja stale. Sólo se documentan aquí los **triggers no obvios**:

| Asset | Cuándo importa |
|---|---|
| `outcome-evaluator` | "evaluá/self-grade" → Generator+Evaluator con rubric, max 3 iters |
| `dreaming` | "consolidá memoria" / MEMORY.md >50 → dedupe en **dry-run**, apply explícito (nunca borra a ciegas) |
| `turbo-parallel` · `ultra-impact` | tareas >1h, ≥3 capas, o 3+ sub-tareas paralelas |
| Rubrics (`api-endpoint`/`db-class`/`prisma-migration`/`ui-component`) | corren auto vía `post-edit-rubric-check.mjs` (warning no-bloqueante) |
| Hooks Pre (mem-guard/danger-zone/pre-bash-guard) | bloquean RAM crítica / archivos críticos / `rm -rf`. Post (hex/typography/rubric/screenshot) = async no-bloqueante. Deploy-gates SÓLO en `Skill(deploy)` |

