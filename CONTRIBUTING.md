# Contributing to Buleje

> SaaS multi-tenant (ERP + e-commerce + POS + Marketplace) para bodegas peruanas.
> Cliente cero: **Bodega San Martín** en Pucallpa.

## Stack rápido

```
Next.js 16.2.3 + React 19.2.3 + TypeScript 5 (strict)
Prisma 7.4.2 + Supabase PostgreSQL + Upstash Redis
Tailwind 4 + @buleje/design-system (workspace)
Stripe + Mercado Pago + Yape + Twilio WhatsApp + SUNAT
Sentry + PostHog + Vercel Analytics
```

## Setup local · 5 minutos

```bash
# 1. Clonar + instalar
git clone git@github.com:Buleje/Mercado.git
cd Mercado
npm install

# 2. Variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales (Supabase, Stripe test mode, etc.)

# 3. Base de datos (Supabase)
# DATABASE_URL = pgBouncer (runtime queries)
# DIRECT_URL   = directa para migrations (NUNCA usar DATABASE_URL para migrate)
npm run db:migrate

# 4. Seed (opcional)
npm run db:seed

# 5. Dev server (Turbopack)
npm run dev
# Abre http://localhost:3000

# 6. Credenciales QA admin (Playwright + manual)
# qaadmin / Qa-admin-1234 en tenant "main"
# Crear con: node -r dotenv/config scripts/create-qa-admin-raw.mjs
```

## Comandos diarios

| Tarea | Comando |
|---|---|
| Dev server (Turbopack) | `npm run dev` |
| Dev clean (kill + lock) | `npm run dev:clean` |
| Type check | `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit` |
| Lint | `npm run lint` |
| Tests unit | `npm run test` |
| Tests e2e | `npm run test:e2e` |
| Build | `npm run build` |
| DB sanity check | `npm run db:sanity` |
| Storybook | `npm run storybook` |
| Mobile (Capacitor) | `npm run cap:sync && npm run app:build:android` |

## Reglas críticas (NO negociables)

| # | Regla | Por qué |
|---|---|---|
| 1 | **Nunca `prisma.*` directo** — usar `lib/db/*.db.ts` | Cache + audit + tenantId obligatorio |
| 2 | **Zod `safeParse()`**, nunca `.parse()` | Errores controlados, no excepciones |
| 3 | **`tenantId` 1er argumento** en toda query | Aislamiento multi-tenant |
| 4 | **Totales en backend**, client solo preview | Anti-fraude checkout |
| 5 | **`requireAdmin(req, roles[])`** en routes protegidas | RBAC |
| 6 | **Sin secrets hardcodeados** — `.env*` + `lib/env.ts` valida | — |
| 7 | **Raw SQL**: solo `$1 $2 $3`, nunca interpolation | SQLi |
| 8 | **ADR nuevo** para arquitectura/contratos/schema | Trazabilidad |

## Estructura del proyecto

```
app/
  api/              158+ endpoints REST (route.ts)
  admin/            Panel ERP — 133 tabs lazy-loaded
  marketplace/      Cross-store catálogo
  t/[slug]/         Storefront por tenant (white-label)
  (store)/          Tienda pública
  (marketing)/      Landing + pricing

lib/
  db/               89 DB classes (lib/db/*.db.ts) — ÚNICA vía a Prisma
  auth/             Sesiones + RBAC + CSRF
  middleware/       Auth + CSP + rate limit + multi-tenant guard
  ai/               Features IA (chef, asistente, vision)

prisma/
  schema.prisma     172 modelos

components/
  admin/            85+ tabs admin
  store/            Storefront
  checkout/         Pagos (zona crítica)
  marketplace/      Multi-vendor
  cms/blocks/       CMS visual

docs/
  adr/              94+ ADRs (Architecture Decision Records)
  HISTORY.md        Snapshot histórico
```

## Zona de peligro (NO tocar sin audit-first)

```
components/checkout/**        Pagos, idempotency, totales
lib/db/orders.db.ts           State machine de órdenes
lib/auth/role-permissions.ts  26 recursos × 6 roles
proxy.ts + lib/middleware/    Auth + CSP + rate limit
prisma/schema.prisma          172 modelos, requiere DIRECT_URL
contexts/cart-context.tsx     BroadcastChannel multi-tab
lib/db/marketplace.db.ts      Dinero cross-vendor
lib/commissions.ts            Comisiones marketplace
```

## Workflow Git

1. Branch desde `prod` (no `master` — `prod` es producción activa)
2. Commits siguen [Conventional Commits](https://www.conventionalcommits.org/) — Husky valida
3. Pre-commit corre: lint-staged + tsc + vitest --changed + design-tokens
4. PR target: `prod` para hot features, `master` para releases mayores

```bash
git checkout -b feat/nombre-feature
# trabajo
git add path/to/file.ts
git commit -m "feat(area): descripcion corta"
gh pr create --base prod
```

## Testing

| Tipo | Framework | Comando |
|---|---|---|
| Unit | Vitest 4 | `npm run test` |
| E2E | Playwright 1.59 | `npm run test:e2e` |
| Visual regression | Chromatic + Storybook | `npm run chromatic` |
| Load | k6 | `npm run test:load` |
| A11y | `@axe-core/playwright` | (integrado en e2e) |

Tests críticos viven en `__tests__/`. **70+ tests recientes** cubren zonas de dinero:
- `fiados-db-business-logic.test.ts` (17)
- `turnos-db-business-logic.test.ts` (23)
- `prestamos-db-business-logic.test.ts` (16)
- `treasury-db-business-logic.test.ts` (14)
- `commissions-business-logic.test.ts` (24)
- `state-machines/order-machine-xstate.test.ts` (25)

## Deploy

```bash
# Pre-deploy gates (obligatorio)
npm run deploy:check

# Deploy canary 5%→25%→100%
# Vía Vercel dashboard o:
vercel --prod
```

DR drill obligatorio cada <35 días. SLO target 99.5%.

## Documentación

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | Instrucciones agente AI (tú lees primero) |
| `AGENTS.md` | Arquitectura Hub & Spoke v2 |
| `MEMORIA-PROYECTO.md` | Memoria viva del proyecto |
| `docs/HISTORY.md` | Snapshot histórico de tabs/fases |
| `docs/adr/` | 94+ ADRs vivos |
| `README.md` | Quick start usuarios finales |

## Skills + Agents disponibles (.claude/)

29 hooks + 17 agents + 47 skills configurados. Skills más usados:

| Skill | Para qué |
|---|---|
| `/audit-first` | Antes de tocar danger zone |
| `/health` | Smoke check dev server |
| `/auth` | Login admin + persistir cookies |
| `/verify` | Gate antes de "listo" (tsc + lint + tests) |
| `/deploy-check` | Pre-deploy completo |
| `/adr [titulo]` | Crear nuevo ADR |

## Contacto

**Brandon Buleje** · dueño + único developer · bulejebrandonluis7575@gmail.com

Para issues técnicas: GitHub Issues. Para temas comerciales: Brandon directo.

## Compliance

Buleje cumple **Ley 29733 PE** (protección datos personales) y SUNAT (facturación electrónica). El audit log tiene hash chain SHA-256 (ADR-099) para integridad.

## License

Propietario. Todos los derechos reservados a Brandon Buleje (Bodega San Martín, Pucallpa, Perú).
