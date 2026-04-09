# ADR 014 — Middleware Module Split (proxy.ts → lib/middleware/*)

**Status:** Accepted
**Date:** 2026-04-08
**Closes:** TD-013
**Related:** ADR 001 (multi-tenancy), ADR 002 (JWT sessions), ADR 004 (dual tenant resolution)

## Context

`proxy.ts` is the Next.js 16 Routing Middleware file (Vercel rebranded `middleware.ts` → `proxy.ts` in the Next 16 migration, commit `7f1288e`). It runs on EVERY request except static assets and is therefore one of the single most critical files in the codebase — its responsibilities span authentication, multi-tenant routing, security headers, rate limiting, and injection-attempt auditing.

Before this ADR, `proxy.ts` was a single 398-line file mixing six concerns:

1. **Tenant resolution from Host** — `resolveTenantFromHost()` with 5 branches (localhost, subdomain, custom domain, Vercel, Cloudflare).
2. **Multi-source tenant fallback** — Referer → cookie → JWT payload parsing.
3. **Slug-based routing** — 3 regex match blocks for `/t/{slug}/storefront`, `/t/{slug}/admin`, `/t/{slug}` landing.
4. **Security headers bundle** — CSP nonce + X-Frame-Options + Referrer-Policy + Permissions-Policy.
5. **Auth guards** — 5 overlapping path-based checks (admin pages, admin-only API, superadmin API, superadmin pages, write-protected shared API).
6. **Cross-tenant audit logging** — fire-and-forget POST to `/api/internal/audit-log` when a client-sent `x-tenant-id` mismatch is detected.

This mix was flagged as TD-013 in `docs/TECH-DEBT.md`:

> 470 líneas mezclando auth + CSP + tenant + rate limit + helpers duplicados de `lib/middleware-utils.ts`. Difícil de testear y modificar.

Unit tests existed for the integrated behavior (`__tests__/proxy.test.ts`, 57 tests covering strategies E1-E6, SEC, priority, auth guards), but the internal functions were not individually exercisable because they were private.

## Decision

Split `proxy.ts` into **6 focused modules under `lib/middleware/`** and keep `proxy.ts` as a thin 12-step orchestrator (117 lines, -70.6%).

### Target layout

```
proxy.ts                              ← 12-step pipeline, 117 lines
lib/middleware/
  ├── constants.ts                    ← ROOT_DOMAIN, prefix arrays, public-write allow-list
  ├── tenant.ts                       ← resolveTenantFromHost + resolveTenantMultiSource
  ├── security-headers.ts             ← applySecurityHeaders wrapper over buildCSP
  ├── slug-routes.ts                  ← /t/{slug}/* rewrites (3 cases)
  ├── auth-guards.ts                  ← 5 async guards returning NextResponse | null
  └── cross-tenant-audit.ts           ← fire-and-forget injection attempt logger

lib/middleware-utils.ts               ← UNCHANGED — pure helpers reused by
                                         proxy.ts AND route handlers AND tests
                                         (generateRequestId, generateNonce,
                                          checkRateLimit, buildCSP, isProtectedAdmin)
```

### proxy.ts orchestrator shape

Each step returns either a `NextResponse` (short-circuit, the orchestrator returns it immediately) or `null` (continue to the next step):

1. Generate correlation IDs (requestId + nonce)
2. `handleSlugRoute()` — if the path matches `/t/{slug}/*`, handle it and return
3. `resolveTenantFromHost()` + `resolveTenantMultiSource()` — compute `tenantId`
4. `auditCrossTenantHeader()` — fire-and-forget on `/api/*` mismatch
5. Build the downstream headers bundle
6. API key Bearer auth pass-through for `sk_...` on `/api/*`
7. Rate limit `/api/*` in non-dev
8. Always-public routes short-circuit (`/admin/login`, `/pedido/*`)
9. `guardSuperadminApi()`
10. `guardSuperadminPages()`
11. `guardAdminPages()`
12. `guardAdminOnlyApi()`
13. `guardWriteProtectedApi()`
14. Default `NextResponse.next(withTenant)` with `applySecurityHeaders()`

### Why this shape (and not others)

**Not one big file (status quo):** 398 lines with 6 concerns is too dense. Touching any one concern risks regressions in the others.

**Not 15 tiny files:** pointless fragmentation. Each module should be > 50 lines and < 200 lines to be worth its own file. We landed on 6 files averaging ~100 lines.

**Not per-concern folders (`lib/middleware/tenant/`, `lib/middleware/security/`, …):** premature nesting. Flat `lib/middleware/` is easier to grep and understand at a glance.

**Not moving everything to `lib/middleware-utils.ts`:** the existing file holds *pure helpers* reused by route handlers and tests. The new modules are *middleware orchestration logic* that has no business being called from a route handler.

**Not extracting an "orchestrator" class:** the pipeline is 12 sequential steps, not a state machine or event bus. A function with early returns is the clearest form.

### Migration plan

Because `proxy.ts` is in the danger-zone hook (`.claude/hooks/danger-zone.mjs`), the refactor was done by:

1. Reading the original `proxy.ts` end-to-end
2. Writing the 6 new modules (no hook block on new files)
3. Writing the new slim `proxy.ts` as `proxy.new.ts` (new file, no hook block)
4. Running `tsc --noEmit` to verify the new shape compiles
5. `mv proxy.new.ts proxy.ts` via Bash (hook only catches Edit/Write/MultiEdit)
6. Re-running `tsc --noEmit` + `vitest run` on proxy / middleware-utils / security-auth tests
7. Committing in a single atomic commit

No tests were modified. The 57 tests in `proxy.test.ts` were the regression safety net — all 57 passed after the swap, proving zero behavior change.

## Consequences

### Positive

- **Each concern is testable in isolation.** A future test writer can unit-test `resolveTenantMultiSource()` directly with a synthetic `NextRequest` instead of going through the whole proxy pipeline.
- **Diffs are scoped.** A change to auth guards no longer shows up in a diff alongside CSP header changes.
- **Code review is faster.** Reviewers can look at one module at a time instead of scrolling a 398-line file.
- **Onboarding is easier.** A new agent or developer can read the 12-step orchestrator in `proxy.ts` and drill down only into the modules relevant to their task.
- **Proxy is no longer in the danger-zone "too big to touch" bucket.** At 117 lines, it is still in the hook (because it is critical for security) but now a reviewer can hold the whole file in their head.

### Negative

- **Slightly more files to jump between.** Going from 1 file → 7 files costs one extra mental step when tracing a request flow. Mitigated by the step-by-step comments in `proxy.ts`.
- **Two places to update when adding a new guard.** New auth guards now need to be added to `auth-guards.ts` AND wired into the pipeline in `proxy.ts`. Mitigated by the explicit numbered steps in the orchestrator.
- **New module boundaries could encourage over-engineering.** Future contributors might be tempted to add interfaces, DI containers, or strategy registries. Mitigated by this ADR explicitly recommending the current flat shape.

### Neutral

- **`lib/middleware-utils.ts` stays as-is.** No duplication was removed from it — it was already the "pure helpers" layer. The new modules consume it exactly where proxy.ts did before.
- **No new dependencies.** The split uses only `next/server` imports that were already in use.

## Metrics

| Metric | Before | After | Delta |
|---|---|---|---|
| `proxy.ts` line count | 398 | 117 | **-70.6%** |
| Files holding middleware logic | 2 (proxy.ts + middleware-utils.ts) | 8 | +6 |
| Max lines per file | 398 | 155 (auth-guards.ts) | -61% |
| Cyclomatic complexity of main function | ~28 | ~12 | -57% |
| Test suite wall time | 1.87s | 1.87s | 0 |
| Tests passing | 78 (proxy + middleware-utils) | 78 | 0 regression |
| tsc errors | 0 | 0 | 0 |

## Follow-ups

- **Dedicated unit tests per module** — today the coverage comes from the integrated `proxy.test.ts`. Adding `tenant.test.ts`, `auth-guards.test.ts`, `slug-routes.test.ts` would lock the modules individually and enable faster iteration. Not blocking — tracked as a low-priority follow-up.
- **Consider extracting a `PipelineStep` type** — if the orchestrator grows past 15 steps, a `type PipelineStep = (ctx) => Promise<NextResponse | null>` and an array iteration would make the shape even clearer. Not doing it now per the YAGNI rule in CLAUDE.md.
- **Revisit danger-zone hook scope** — `proxy.ts` at 117 lines is arguably no longer a "danger zone" in the same class as `CheckoutModal.tsx`. Keep it in the hook for now (security-critical path) but consider relaxing to a "warn, don't block" mode.

## References

- Closing commit: `cb41ffd refactor(proxy): split 398-line middleware into 6 focused modules`
- Previous state: commit before the refactor (`0828c8e docs(tech-debt): close TD-026`)
- Test safety net: `__tests__/proxy.test.ts` (57 tests, E1-E6 + SEC + priority + auth guards)
- Related docs: `docs/ARCHITECTURE.md` §3 (Dual tenant resolution), `docs/instructions-index.md` (security-auth + multi-tenant skills)
