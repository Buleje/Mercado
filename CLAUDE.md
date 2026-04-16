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
| **Dev** | `npm run dev` · `npm run dev:clean` |
| **Check** | `npm run lint` · `npx tsc --noEmit` · `npm run test` · `npm run build` |
| **DB** | `npm run db:seed` · `npm run db:migrate` (DIRECT_URL) |

Commits: Conventional Commits via Husky (`feat|fix|docs|refactor|perf|test|chore`).

## Env vars

Minimas: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_BASE_URL`.
Prod: + `STRIPE_*`, `CRON_SECRET`. Completo en `.env.example`.
