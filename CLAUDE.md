# CLAUDE.md — Bodega San Martín

**Proyecto:** ERP/e-commerce multi-tenant, bodega familiar, Pucallpa, Perú.
**Idioma:** español. **Estilo:** Feynman + tablas.

---

## Reglas críticas

1. **Nunca Prisma directo** — usar `lib/db/*.db.ts`. Cache + audit + `tenantId` 1er param.
2. **`safeParse()` Zod** — nunca `.parse()`.
3. **`tenantId` en toda query** — aislamiento obligatorio.
4. **Next 16 sin segment configs** — usar `"use cache"` + `cacheLife()` + `cacheTag()`. Ver ADR-019.
5. **Invalidar caché tras writes** — `invalidate(key)` o `invalidateByPrefix(prefix)`.
6. **Totales en backend** — client-side solo preview.
7. **Fire-and-forget** — `.catch(() => {})` en tareas no-críticas.
8. **`tsc --noEmit`** = type-check real. `ignoreBuildErrors: false`.
9. **`requireAdmin(req, roles[])`** en routes protegidas.
10. **Sin secrets hardcodeados** — `.env*` + `lib/env.ts` valida startup.
11. **Raw SQL** — solo `$1 $2 $3`, nunca interpolation.
12. **ADR nuevo** para cambios de arquitectura → `/adr [título]`.
13. **Self-heal** — 3 intentos auto antes de escalar. `/self-heal`.
14. **Deploy** — SLO healthy + canary 5%→25%→100% + DR drill <35d.

## Fast-Path Routing (ADR-058)

| Tier | Criterio | Dispatch | Gates |
|---|---|---|---|
| **HOTFIX** | 1 archivo, <20 lineas | Subagente directo | lint + tsc |
| **FEATURE** | 2-5 archivos, 1 area | Team slim (2-3) | lint + tsc + test |
| **DANGER** | Zona peligrosa | Squad + security | Full pipeline |
| **INITIATIVE** | 5+ archivos, 2+ areas | Hub BUILD→QUALITY→OPS | Todos los gates |

Templates: `.claude/team-templates/`. HOTFIX/FEATURE sin Director.

## Zona de peligro

| Archivo | Reason |
|---|---|
| `components/checkout/**`, `CheckoutModal.tsx` | Pagos, idempotency |
| `lib/db/orders.db.ts` | State machine |
| `lib/auth/role-permissions.ts` | 26 recursos × 6 roles |
| `proxy.ts`, `lib/middleware/**` | Auth + CSP + rate limit |
| `prisma/schema.prisma` | 131 modelos, requiere DIRECT_URL |
| `contexts/cart-context.tsx` | BroadcastChannel multi-tab |

## Comandos

| Grupo | Comandos |
|---|---|
| **Dev** | `npm run dev` (turbopack, default) · `npm run dev:fast` (alias) · `npm run dev:clean` (kill+lock) · `npm run dev:nuke` (kill+wipe `.next`) |
| **Check** | `npm run lint` · `npx tsc --noEmit` · `npm run test` · `npm run build` |
| **DB** | `npm run db:seed` · `npm run db:migrate` (DIRECT_URL) |

Commits: Conventional Commits via Husky (`feat|fix|docs|refactor|perf|test|chore`).

## Env vars

Minimas: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_BASE_URL`.
Prod: + `STRIPE_*`, `CRON_SECRET`. Completo en `.env.example`.

---

## Power rules para el agente (velocidad + potencia)

Reglas para que Claude trabaje rapido y eficaz:

1. **Paralelismo maximo**: multiples Agent/Bash/Read en UN mensaje cuando son independientes. Si hay 3+ tareas, invocar `turbo-parallel` skill.
2. **No matar `node.exe` ni wipear `.next`**: restarts de Turbopack son caros (30-90s). Solo `dev:clean` si hay lock corrupto; `dev:nuke` solo si el cache realmente esta corrupto.
3. **Grep/Glob antes que `Explore` agent**: Explore es para preguntas open-ended. Target conocido = Grep directo (mas rapido, menos tokens).
4. **Batch reads**: leer N screenshots o N archivos en una sola tanda paralela, no secuencial.
5. **Worktrees para `ultra-impact` >50 files**: `isolation: "worktree"` en Agent. Deja el dev server principal intacto.
6. **Scripts bulk**: antes de auto-inyectar imports a `.tsx`, detectar `"use client"` y poner imports DESPUES del directive (no antes).
7. **Pre-refactor primitive**: grep `function <X>|const <X> =` en todo el repo para evitar shadowing (ej. PrestamosModule tenia SparklineKPICard interno clonado).
8. **Visual verify focused**: no correr los 34 tabs cada vez. Script `scripts/visual-verify-admin-focused.mjs` cubre los 9 criticos (~30s).
9. **Respuestas tipo tabla**: max 100 palabras prosa + tablas + snippets. No narrar deliberacion.
10. **`HUSKY_SKIP_POSTCOMMIT=1`**: default. Vitest post-commit solo con `HUSKY_RUN_POSTCOMMIT_TESTS=1`. CI ya lo corre.
11. **`NODE_OPTIONS="--max-old-space-size=8192"`**: ya configurado en pre-commit. Evita SIGKILL en bulk.
12. **Credenciales QA admin** (para Playwright visual verify): `qaadmin` / `Qa-admin-1234` en tenant `main`. Crear con `node -r dotenv/config scripts/create-qa-admin-raw.mjs`.
13. **Onboarding modal**: localStorage key real = `onboarding-completed-${tenantSlug}`. Setear a `"1"` en Playwright antes de screenshots.
14. **Prisma schema drift** (suppliers `ColumnNotFound`): requiere `prisma migrate deploy` con DIRECT_URL accesible. DNS de Supabase directo puede fallar en algunas redes — correr desde red con acceso o aplicar la migration sobrante manualmente.
