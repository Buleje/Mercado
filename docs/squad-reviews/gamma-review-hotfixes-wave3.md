# Gamma Review — Wave 3 HIGH Severity Hotfixes

**Reviewer:** Agent Gamma (QA + Security)
**Date:** 2026-04-09
**Round:** 4
**Scope:** RED-005, RED-006, RED-007, HOTFIX-005, HOTFIX-006, HOTFIX-007
**Inputs:**
- `docs/squad-reviews/red-team-checkout-security.md`
- `docs/squad-reviews/red-team-commit-17ffe01.md`
- `docs/squad-reviews/gamma-review-hotfixes-wave2.md` (SN-1 follow-up)
**Pre-state:** `tsc --noEmit` clean, vitest 21/21 green (per mission brief).

---

## 1. RED-005 + RED-006 + RED-007 — Atomic stock + coupon + cross-tenant

Files: `app/api/orders/route.ts`, `lib/db/promotions.db.ts`, `__tests__/orders-route-race-conditions.test.ts`
Author: Beta-Charlie

### Verdict: **PASS**

### Evidence

**Atomic transaction wraps both guards**
- `app/api/orders/route.ts:373-421` — single `prisma.$transaction` covers every stock decrement loop iteration plus the coupon `usedCount` bump. Either every guard wins or every write rolls back.
- `app/api/orders/route.ts:380-387` — stock UPDATE is conditional:
  ```
  SET "stock" = "stock" - ${item.quantity}
  WHERE "id" = ${item.id} AND "tenantId" = ${tenantId}
    AND "stock" IS NOT NULL AND "stock" >= ${item.quantity}
  ```
  Race-safe: two concurrent POSTs for the last unit → only one sees `affected=1`.
- `app/api/orders/route.ts:406-414` — coupon UPDATE conditional on `"usedCount" < "maxUses"` and tenant-scoped.
- `app/api/orders/route.ts:388-399` — `INSUFFICIENT_STOCK` short-circuits rollback (thrown inside tx callback).
- `app/api/orders/route.ts:415-420` — `COUPON_EXHAUSTED` same pattern.

**CouponsDB signatures support (tenantId, code)**
- `lib/db/promotions.db.ts:120-134` — `getByCode` accepts `(tenantId, code)` via overload; legacy `(code)` preserved for the coupons public routes (acknowledged follow-up).
- `lib/db/promotions.db.ts:168-241` — `redeem` overloaded for `(tenantId, code, amount?)`; conditional `$executeRaw` with `"usedCount" < "maxUses"` guard at `:201-209`; tenant clause injected at `:198-200`.
- `lib/db/promotions.db.ts:131-134` + `:238-241` — typed overload declarations exposed to callers.

**Call-site uses tenant-scoped lookup**
- `app/api/orders/route.ts:245` — `CouponsDB.getByCode(tenantId, body.appliedCouponCode)`. Confirmed.

**Tests cover all 3 race scenarios with real assertions**
- `__tests__/orders-route-race-conditions.test.ts:233-257` — RED-005 rejects 409 `insufficient_stock` when `$executeRaw` returns 0; asserts `OrdersDB.add not called`.
- `__tests__/orders-route-race-conditions.test.ts:259-277` — RED-005 happy path returns 201.
- `__tests__/orders-route-race-conditions.test.ts:279-302` — RED-005 skips decrement for `stock=null` (unlimited); asserts `mockExecuteRaw` not called.
- `__tests__/orders-route-race-conditions.test.ts:305-343` — RED-006 rejects 409 `coupon_exhausted` on coupon UPDATE race-loss; `mockOrdersAdd not called`.
- `__tests__/orders-route-race-conditions.test.ts:345-377` — RED-006 happy path asserts `getByCode(TENANT_A, "ONCE")`.
- `__tests__/orders-route-race-conditions.test.ts:380-436` — RED-007 tenant B cannot use tenant A's coupon; order creates at full price, no `appliedCouponCode` on response, `executeRaw` called only once (stock, no coupon).

**Legacy fire-and-forget `CouponsDB.redeem` removed**
- Grep `CouponsDB.redeem` / `.redeem(` in `app/api/orders/route.ts` → **0 matches**. Deleted as required.

**Compensating writes on OrdersDB.add failure**
- `app/api/orders/route.ts:448-479` — catch wraps `OrdersDB.add`; spawns a best-effort tx that adds back stock (`stock + quantity`) and decrements coupon (`GREATEST("usedCount" - 1, 0)`). Fire-and-forget per CLAUDE.md #7. Correct semantics: the atomic guards already landed, this rolls them back if the row write fails.

### Notes
- Compensating writes are best-effort only — if the rollback tx also fails, the inventory/coupon counter drifts. Acceptable per spec; deserves a future monitoring alert on `addErr` rate.
- `INSERT INTO "Product"` stub path at `lib/db/orders.db.ts:290-294` uses `Prisma.sql` + `Prisma.join` — parameterized, no injection surface.

---

## 2. HOTFIX-005 — OrdersDB.getByCustomerPhone tenant isolation

Files: `lib/db/orders.db.ts`, 3 callers, `__tests__/orders-db-tenant-isolation.test.ts`
Author: Beta-Foxtrot

### Verdict: **PASS (with documented deferred caller)**

### Evidence

**Signature migrated to (tenantId, phone)**
- `lib/db/orders.db.ts:227-240` — accepts `(tenantIdOrPhone, phone?)`. When `phone` is supplied the where clause is `{ tenantId: tenantIdOrPhone, customerPhone: normalizePhone(phone) }`. Legacy single-arg shape preserved for the intentionally-deferred call site.
- Inline comment at `lib/db/orders.db.ts:216-226` documents the migration window and explicitly names `app/api/orders/route.ts` as the parked caller.

**All 3 declared callers pass tenantId**
- `app/api/customers/[phone]/timeline/route.ts:27` → `OrdersDB.getByCustomerPhone(auth.tenantId, normalized)` ✓
- `app/api/customers/[phone]/orders/route.ts:21` → `OrdersDB.getByCustomerPhone(tenantId, normalizePhone(phone))` ✓ (tenantId comes from `getTenantIdFromRequest(req)`)
- `lib/agents/domains/customers.agent.ts:289` → `OrdersDB.getByCustomerPhone(ctx.tenantId, phone)` ✓

**Tests extended**
- `__tests__/orders-db-tenant-isolation.test.ts:185-218` — new describe block `"OrdersDB.getByCustomerPhone tenant isolation (HOTFIX-005 / SN-1)"`:
  - Case (e) `:186-200` — `(TENANT_A, "987654321")` hits Prisma with `{ tenantId: TENANT_A, customerPhone: "987654321" }`.
  - Case (f) `:202-217` — cross-tenant fixture filtered out; same where assertion.

### Known deferred caller (NOT blocked)
- `app/api/orders/route.ts:597` — loyalty counter still calls `OrdersDB.getByCustomerPhone(customerPhone)` without tenant. This is inside the post-commit loyalty milestone block (fire-and-forget). Confirmed documented in the orders.db.ts docstring. Beta-Charlie's lane was reserved; per mission brief this is a known follow-up — not a blocker.

---

## 3. HOTFIX-006 — AnalyticsDB cache-poisoning

Files: `lib/db/analytics.db.ts`, `app/api/admin/dashboard/aggregates/route.ts`, `__tests__/analytics-db-dashboard.test.ts`
Author: Beta-Delta

### Verdict: **PASS**

### Evidence

**try/catch moved out of "use cache" scope**
- `lib/db/analytics.db.ts:98-172` — `getDashboardAggregates(tenantId)` body starts with `"use cache"`, `cacheLife`, `cacheTag`. No try/catch wraps the `Promise.all` block at `:110-156`. Any Prisma rejection propagates.
- Comment at `:83-97` explicitly documents the rationale (Next 16 does not cache throws, so the cache stays clean after a DB hiccup).

**Route handler owns the 500 response**
- `app/api/admin/dashboard/aggregates/route.ts:38-55` — wraps the call in try/catch, logs via `logger.error`, returns `{ error: "internal_error" }` with status 500.

**Test asserts rejection**
- `__tests__/analytics-db-dashboard.test.ts:302-317` — `describe("AnalyticsDB.getDashboardAggregates — error propagation (HOTFIX-006)")` with `it("rejects on prisma failure ...")`:
  ```
  await expect(AnalyticsDB.getDashboardAggregates(TENANT_A))
    .rejects.toThrow("connection terminated unexpectedly");
  ```
- `:319-326` adds a regression guard to make sure a zero-fallback shape is never resolved.

---

## 4. HOTFIX-007 — Squad status endpoint hardening

File: `app/api/squad/status/route.ts`
Author: Beta-Echo

### Verdict: **PASS (minor note on response shape)**

### Evidence

**Five defense layers**
1. `app/api/squad/status/route.ts:86` — `requireAdmin(req, ["admin"])` explicit role list.
2. `app/api/squad/status/route.ts:72-83` — `isCallerAllowed`: `NODE_ENV !== "production"` short-circuit OR explicit `SQUAD_STATUS_ALLOWLIST` username match (case-insensitive, trimmed).
3. `app/api/squad/status/route.ts:52-56` — universal `notFound()` helper returning `{ error: "not found" }` with status 404.
4. `app/api/squad/status/route.ts:87-98` — 401/403 from `requireAdmin` and allowlist miss both masked as 404.
5. `app/api/squad/status/route.ts:101-104` — missing orchestrator file returns 404 (not 503), no existence oracle.

**Audit log fires on successful access**
- `app/api/squad/status/route.ts:126-129` — `logger.info("[squad-status] Access granted", { username, role })` after successful gate traversal.
- Allowlist miss also logged via `logger.warn` at `:93-96`.

**Response body shape**
- `app/api/squad/status/route.ts:119-123` — per-task entries contain **only** `{ task_id, status, module }`. Confirmed no `locked_files`, no `recent_events`, no `agents`, no `sprint`, no `file_paths`, no task titles, no assignees, no timestamps.
- Outer envelope adds `{ ok, counts, total_tasks, tasks }`. `counts` and `total_tasks` are pure aggregate integers (status histogram + total) — do **not** leak sensitive metadata. Interpreted as meeting the spec (the restriction is on per-task leakage).

**503 → 404 swap**
- `app/api/squad/status/route.ts:101-104` — `readOrchestrator()` returns null on any file/parse error; handler answers 404 (not 503 as in the pre-fix version).

### Notes
- The `counts` histogram does expose the **size of the engineering backlog** as an aggregate. That is informational, not sensitive — acceptable. Flag for future minimization if the allowlist is ever widened beyond core engineers.

---

## 5. Security cross-checks

### Fire-and-forget in the order creation flow
Grep `catch(() => {})` / `fire-and-forget` in `app/api/orders/route.ts`:
- All 14 matches are **post-persistence** (after line 447 where `OrdersDB.add` resolves): compensating rollback (`:477`), FEFO decrement (`:485`), mailer (`:498`), WhatsApp (`:540`, `:548`), push (`:585`), activity log (`:553`, `:620`), customer notification insert (`:637`).
- **No fire-and-forget remains on the critical pre-commit path** (stock/coupon guards, body parsing, total recomputation). Rule #7 respected.

### Tenant isolation on new code
- Stock `UPDATE` at `route.ts:383-386` — `tenantId` in WHERE ✓
- Coupon `UPDATE` at `route.ts:409-413` — `tenantId` in WHERE ✓
- `CouponsDB.getByCode` at `route.ts:245` — `tenantId` first arg ✓
- Compensating stock/coupon at `route.ts:462-473` — `tenantId` in WHERE ✓

### Raw SQL uses positional parameters
- Every `$executeRaw` in the changed files uses tagged templates (`$executeRaw\`... ${var}\``) which Prisma serializes to `$1 $2 $3`. No `$executeRawUnsafe` or string interpolation observed. ✓

### Input validation
- `OrderPostSchema.safeParse(raw)` at `route.ts:189`. No `.parse()`. ✓

### No client-side business math
- Server recomputes `itemsTotal` at `route.ts:234-237` from `serverPriceMap` (Prisma-loaded). Body totals are treated as hints only (comment `:43`). ✓

### No secrets hardcoded
- `SQUAD_STATUS_ALLOWLIST` read from `process.env` (`squad/status/route.ts:75`). ✓

### Output escaping
- No `dangerouslySetInnerHTML` introduced by this wave. N/A.

---

## 6. Deferred follow-ups (NOT blocking this wave)

| ID | Location | Issue | Owner |
|---|---|---|---|
| F-1 | `app/api/orders/route.ts:597` | Loyalty milestone still calls `OrdersDB.getByCustomerPhone(customerPhone)` without `tenantId`. Known per mission brief, documented in `orders.db.ts:216-226`. Low risk (fire-and-forget, count-only). | Beta-Charlie next wave |
| F-2 | `app/api/coupons/spin/route.ts:46` | `CouponsDB.getByCode(code)` legacy shape — admin code-uniqueness check, not order creation. | Coupon squad |
| F-3 | `app/api/coupons/[id]/route.ts:21` | Same, admin update path. | Coupon squad |
| F-4 | `app/api/coupons/route.ts:48` | Same, admin create path (duplicate check). | Coupon squad |
| F-5 | `app/api/coupons/validate/route.ts:21` | Public validate endpoint — cross-tenant validate is a medium-severity leak. Should be the priority follow-up. | Beta-Delta |
| F-6 | `analytics-db-dashboard.test.ts:320` | Stray backslash in a test comment (`\ Regression guard`) — cosmetic, does not affect Vitest. | Janitor |

---

## 7. Final recommendation: **SHIP**

All 6 HIGH-severity fixes verified. Critical invariants:
- Stock and coupon races closed at the SQL level, not in Node.
- Cross-tenant coupon lookup plugged on the order flow.
- `getByCustomerPhone` tenant-isolated on all customer-facing callers.
- Analytics cache no longer poisonable with zero-fallbacks.
- Squad status endpoint is a proper superadmin-only 404-masked artifact with audit log.

Compensating-write path and the 5 deferred follow-ups do not block this wave; they are tracked above for the next review round.

---

```yaml
# Gamma action block — Wave 3
review_round: 4
date: 2026-04-09
reviewer: gamma
precondition_check:
  tsc_noemit: clean
  vitest: 21/21
  source_modified_by_gamma: false
fixes:
  - id: RED-005
    scope: stock oversell race
    author: beta-charlie
    recommended_status: done
    blocking: false
  - id: RED-006
    scope: coupon double-use race
    author: beta-charlie
    recommended_status: done
    blocking: false
  - id: RED-007
    scope: cross-tenant coupon reuse
    author: beta-charlie
    recommended_status: done
    blocking: false
  - id: HOTFIX-005
    scope: OrdersDB.getByCustomerPhone tenant isolation
    author: beta-foxtrot
    recommended_status: done
    blocking: false
    deferred_caller: app/api/orders/route.ts:597
  - id: HOTFIX-006
    scope: analytics cache-poisoning via swallowed throw
    author: beta-delta
    recommended_status: done
    blocking: false
  - id: HOTFIX-007
    scope: squad status endpoint hardening
    author: beta-echo
    recommended_status: done
    blocking: false
deferred_follow_ups:
  - F-1: loyalty counter missing tenantId (orders/route.ts:597)
  - F-2: CouponsDB.getByCode legacy shape (coupons/spin/route.ts:46)
  - F-3: CouponsDB.getByCode legacy shape (coupons/[id]/route.ts:21)
  - F-4: CouponsDB.getByCode legacy shape (coupons/route.ts:48)
  - F-5: CouponsDB.getByCode legacy shape (coupons/validate/route.ts:21) [MEDIUM priority]
  - F-6: stray backslash in analytics-db-dashboard.test.ts:320 [cosmetic]
final_recommendation: SHIP
notes: >
  All six HIGH-severity fixes verified against file:line evidence. No source
  files were modified during this review — only the review document was
  written. Deferred items are tracked above and should be scheduled for the
  next wave, with F-5 prioritized.
```
