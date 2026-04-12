# Gamma Review — TASK-005 (LoyaltyTransaction / TD-030 / ADR-024)

**Reviewer:** Agent Gamma (QA & Security)
**Date:** 2026-04-09
**Blueprint:** `docs/adr/024-loyalty-transaction-model.md`
**Mode:** Static review only. No migrations run, no test suite executed, no orchestrator.json touched.

---

## Status

**PASS — with 3 non-blocking follow-ups.**

Beta's delivery implements the frozen ADR-024 contract. The shape of the model, the atomic `$transaction([insert, increment])` write path, the cross-tenant guard, the idempotent backfill and the six unit tests are all present and evidence-based. Two small deviations from the ADR (pagination style, admin role list) are documented below and accepted for v1. One pre-existing invariant leak (two sites still writing to `Customer.loyaltyPoints` directly) is flagged as a follow-up — it is not caused by this PR but this PR sets up the invariant that will eventually need to be enforced.

---

## Per-file checklist

### 1. `prisma/schema.prisma` — LoyaltyTransaction model + Customer reverse relation

| Item | Expected (ADR-024 §Model shape) | Found | Verdict |
|---|---|---|---|
| `id String @id @default(cuid())` | ✅ | `prisma/schema.prisma:244` | PASS |
| `customerId String` (FK to Customer.phone) | ✅ | `prisma/schema.prisma:245` | PASS |
| `tenantId String` | ✅ | `prisma/schema.prisma:246` | PASS |
| `amount Int` (not Decimal) | ✅ | `prisma/schema.prisma:247` | PASS |
| `reason String` (application-layer enum) | ✅ | `prisma/schema.prisma:248` | PASS |
| `metadata Json?` | ✅ | `prisma/schema.prisma:249` | PASS |
| `createdAt DateTime @default(now())` | ✅ | `prisma/schema.prisma:250` | PASS |
| Relation `customer Customer @relation(... onDelete: Cascade)` | ✅ | `prisma/schema.prisma:252` | PASS |
| Index `(customerId, createdAt DESC)` with `map:"idx_loyalty_tx_customer_created_desc"` | ✅ | `prisma/schema.prisma:254` | PASS |
| Index `(tenantId, createdAt DESC)` with `map:"idx_loyalty_tx_tenant_created_desc"` | ✅ | `prisma/schema.prisma:255` | PASS |
| Index `(tenantId, reason)` | ✅ | `prisma/schema.prisma:256` | PASS |
| Reverse relation `Customer.loyaltyTransactions LoyaltyTransaction[]` | ✅ | `prisma/schema.prisma:231` | PASS |
| `Customer.loyaltyPoints` **untouched** (still `Int @default(0)`) | ✅ | `prisma/schema.prisma:171` | PASS |

### 2. `prisma/migrations/20260409230000_add_loyalty_transaction/migration.sql`

| Item | Found | Verdict |
|---|---|---|
| Hand-written DDL, header comment explaining ADR/TD ref and rollback | `migration.sql:1-8` | PASS |
| `CREATE TABLE "LoyaltyTransaction"` with correct columns and types (`TEXT`, `INTEGER`, `JSONB`, `TIMESTAMP(3)`) | `migration.sql:11-21` | PASS |
| PK on `id` | `migration.sql:20` | PASS |
| Index `idx_loyalty_tx_customer_created_desc` on `(customerId, createdAt DESC)` | `migration.sql:24-25` | PASS |
| Index `idx_loyalty_tx_tenant_created_desc` on `(tenantId, createdAt DESC)` | `migration.sql:28-29` | PASS |
| Index `LoyaltyTransaction_tenantId_reason_idx` on `(tenantId, reason)` | `migration.sql:32-33` | PASS (Prisma-default name; matches the un-mapped `@@index` on schema.prisma:256) |
| FK `customerId → Customer(phone) ON DELETE CASCADE` | `migration.sql:36-41` | PASS |
| Style matches repo convention (column-aligned, comment sections) | compare `migrations/20260404240000_add_supplier_portal_models/migration.sql:1-19` | PASS |
| **Non-blocking:** no evidence that `prisma migrate deploy` was executed | migration file present but no state advance visible in review scope | PASS (as instructed — Brandon gates step 3) |

### 3. `lib/db/interfaces/ILoyaltyDB.ts`

| Item | Found | Verdict |
|---|---|---|
| `tenantId` is the **first** parameter on every method | `earn` `ILoyaltyDB.ts:47`, `redeem` `:66`, `getHistory` `:82`, `getBalance` `:93` | PASS |
| All methods return `Promise<...>` | `ILoyaltyDB.ts:47-93` | PASS |
| `LoyaltyReason` union covers ADR set + `"backfill"` | `ILoyaltyDB.ts:12-20` | PASS |
| JSDoc documents thrown error classes | `ILoyaltyDB.ts:44-46, 60-65` | PASS |
| **Divergence:** ADR §Write/Read contract names the methods `addTransaction` / `listTransactions`; interface exposes `earn` / `redeem` / `getHistory` / `getBalance`. Semantically equivalent (sign-flipping is moved into `redeem`), arguably **better** because the caller cannot accidentally submit a negative `earn`. Accepted. | `ILoyaltyDB.ts:47-93` | ACCEPT |

### 4. `lib/db/loyalty.db.ts`

| Item | Found | Verdict |
|---|---|---|
| `tenantId` first on every public method | `earn :202`, `redeem :215`, `getHistory :228`, `getBalance :292` | PASS |
| Atomic `$transaction([create, update])` for **earn** path | `loyalty.db.ts:155-171` via `writeTransaction` | PASS |
| Atomic `$transaction([create, update])` for **redeem** path (same helper, sign flipped) | `loyalty.db.ts:224` → `writeTransaction(... -amount ...)` | PASS |
| Cross-tenant guard on write (read customer, compare tenantId) | `loyalty.db.ts:136-145` | PASS |
| Cross-tenant guard on read | `loyalty.db.ts:241-250` | PASS |
| Cache invalidation `invalidateByPrefix(loyalty:${tenant}:${customer})` after every write | `loyalty.db.ts:174` | PASS |
| `amount === 0` rejected (CLAUDE.md / ADR invariant) | `loyalty.db.ts:130-132` | PASS |
| Non-integer amounts rejected | `loyalty.db.ts:130, 208, 221` | PASS |
| Negative-balance guard **before** the atomic write | `loyalty.db.ts:148-150` | PASS |
| Fire-and-forget `logActivity(...).catch(() => {})` | `loyalty.db.ts:177-185` | PASS |
| Error classes **thrown**, not silenced — `LoyaltyInvalidAmountError`, `LoyaltyInsufficientBalanceError`, `LoyaltyCrossTenantError`, `NotFoundError` | `loyalty.db.ts:32-62, 131, 141, 144, 149` | PASS |
| `getHistory`'s catch block rethrows `ApiError` (cross-tenant does not get swallowed) | `loyalty.db.ts:281-282` | PASS |
| No Prisma import outside `lib/db/` — this file lives inside `lib/db/` and uses `@/lib/prisma` | `loyalty.db.ts:2` | PASS |
| **Divergence:** ADR §Read contract spec'd cursor pagination on `(createdAt, id)`; implementation uses `skip`/`take` offset pagination with stable `orderBy [createdAt desc, id desc]`. Semantically fine for expected volume and matches the `LoyaltyHistoryPage` `{transactions, balance, total}` shape. Cursor can be added later without API break. | `loyalty.db.ts:233-263` | ACCEPT (follow-up F2) |
| **Note:** Zod `safeParse` is not used inside the DB class itself; the route layer validates inputs with Zod before calling the DB class. Domain invariants (amount sign, integer, balance) are enforced inline inside the DB class. This is consistent with how other `lib/db/*.db.ts` classes in this repo work. | `loyalty.db.ts:130, 208, 221` | ACCEPT |

### 5. `app/api/marketplace/loyalty/route.ts`

| Item | Found | Verdict |
|---|---|---|
| GET returns **real history** via `LoyaltyDB.getHistory` (not hardcoded `[]`) | `route.ts:90` | PASS |
| POST delegates to `LoyaltyDB.earn` / `LoyaltyDB.redeem` (no direct mutation of `loyaltyPoints`) | `route.ts:138-141` | PASS |
| Zod `safeParse` on query string | `route.ts:76-86` | PASS |
| Zod `safeParse` on body, discriminated union on `action` | `route.ts:41, 127-133` | PASS |
| `requireAdmin` with explicit role list | `route.ts:73, 119` — `["admin", "manager", "cajero"]` | PASS |
| No business math in route — route only maps points→tier for UI | `route.ts:45-49` | PASS (`tierFromPoints` is a presentation helper, not a total recompute) |
| Errors bubble through `toErrorPayload` / `ApiError.toPayload` with trace id | `route.ts:101-104, 150-156` | PASS |
| No secrets, no raw SQL, no `dangerouslySetInnerHTML` | — | PASS |
| **Divergence:** ADR §Migration Plan step 6 lists roles `["admin", "cajero", "owner", "manager"]`; handler uses `["admin", "manager", "cajero"]` (missing `"owner"`). Risk: an `owner`-role user cannot award/redeem loyalty from this endpoint. Non-blocking but should be aligned — see follow-up F1. | `route.ts:73, 119` | FOLLOW-UP |
| **Note:** no rate-limit wrapper around POST. POST is admin-gated, so abuse surface is small, but CLAUDE.md lists "admin writes" as a rate-limit candidate. Non-blocking. | `route.ts:116` | ACCEPT |

### 6. `scripts/backfill-loyalty-transactions.ts`

| Item | Found | Verdict |
|---|---|---|
| Idempotent: `findFirst({ reason: "backfill", customerId, tenantId })` before insert | `backfill:67-79` | PASS |
| Paginated scan (`PAGE = 200`, cursor on `phone`) | `backfill:39-56, 100-102` | PASS |
| Skips customers with `loyaltyPoints <= 0` | `backfill:61-64` | PASS |
| Uses `customer.createdAt` (not `now()`) for the synthetic row | `backfill:93` | PASS |
| Metadata carries `{ source: "ADR-024", backfilledAt }` | `backfill:87-90` | PASS |
| **No side effects on import** — execution path is wrapped in `if (require.main === module)` | `backfill:108-118` | PASS |
| Exports `backfillLoyaltyTransactions` for test reuse | `backfill:30` | PASS |
| **Note:** `require.main === module` is CJS idiomatic. The repo compiles via `tsx` which produces CJS at runtime, so this check works today. Worth leaving a TODO if the repo ever flips to pure ESM. | `backfill:108` | ACCEPT |

### 7. `__tests__/loyalty-db.test.ts`

| Case | Expected | Found | Verdict |
|---|---|---|---|
| 1. `earn` happy path — atomic `$transaction`, cache invalidation, returned row | asserts `$transaction` called once with 2 ops, `invalidateByPrefix` called with the correct prefix, row fields round-trip | `test:67-114` | PASS |
| 2. `redeem` happy path — decrement when sufficient | asserts `amount === -40`, `$transaction` called once, `invalidateByPrefix` called | `test:120-148` | PASS |
| 3. `redeem` insufficient — throws `LoyaltyInsufficientBalanceError` **before** the write | asserts `rejects.toBeInstanceOf(...)` and `$transaction NOT called` and `invalidateByPrefix NOT called` | `test:150-164` | PASS (strong — proves the guard runs before the atomic write) |
| 4. `getHistory` cross-tenant guard | throws `LoyaltyCrossTenantError`, no DB read | `test:171-186` | PASS |
| 5. `getHistory` pagination happy path | returns `LoyaltyHistoryPage { transactions, balance, total }`, newest first | `test:188-226` | PASS |
| 6. Backfill idempotency | scanned=2, skipped=1, inserted=1; only the non-backfilled customer gets a `create` call | `test:232-270` | PASS |
| Prisma is mocked via `vi.hoisted` and `vi.mock("@/lib/prisma", ...)` | ✅ | `test:29-46` | PASS |
| `server-only`, `@/lib/logger`, `@/lib/cache`, `@/lib/activity-logger` all mocked | ✅ | `test:13-27` | PASS |
| All 6 tests contain **real assertions**, no placeholders | ✅ | — | PASS |

---

## Security notes

- **SQL injection.** N/A. All access goes through Prisma typed queries. No `$queryRawUnsafe` / `$executeRawUnsafe` anywhere in the scope of this PR.
- **Tenant isolation.**
  - Write path: cross-tenant guard at `loyalty.db.ts:143-145` (rejects before any write).
  - Read path: cross-tenant guard at `loyalty.db.ts:248-250`.
  - `getHistory`'s ledger query scopes `where: { tenantId, customerId }` — `loyalty.db.ts:254, 260`. No query in this module omits `tenantId`.
- **Input validation.** Zod `safeParse` on both `GET` query and `POST` body in `route.ts:76, 127`. The POST body is a discriminated union so an unknown `action` is rejected structurally.
- **Output escaping.** JSON only, no HTML rendering. No `dangerouslySetInnerHTML`.
- **Audit log fire-and-forget.** `logActivity(...).catch(() => {})` at `loyalty.db.ts:177-185`.
- **Secrets.** None hardcoded.
- **Negative-balance race.** The negative-balance check at `loyalty.db.ts:148` reads the balance **outside** the `$transaction`, so two concurrent redemptions for the same customer could both pass the guard and together push the balance negative. The denormalized `loyaltyPoints` update is atomic inside the transaction, but Prisma's `increment` will happily go negative — Postgres does not enforce a `CHECK (loyaltyPoints >= 0)`. This is a **real but low-severity** race under the current traffic profile (single cashier per tenant at a time). **Follow-up F3**: move the guard into a raw `UPDATE ... WHERE loyaltyPoints + $1 >= 0 RETURNING ...` pattern inside the transaction, or add a `CHECK` constraint on `Customer.loyaltyPoints`. Out of scope for this review.
- **Pre-existing invariant leak.** The ADR sets up the rule "every change to `Customer.loyaltyPoints` must go through `loyalty.db.ts`". Grep shows two sites still writing `loyaltyPoints` directly:
  - `lib/db/customers.db.ts:216` — referral bonus (`increment: 50`)
  - `app/api/marketplace/orders/route.ts:204` — points earned on checkout
  Neither is introduced by this PR, but both will now drift the ledger from the balance. ADR-024 §Migration Plan step 7 explicitly calls for a Vitest guard test that greps for this pattern. **Follow-up F4.**
- **Non-blocking check — migration not deployed.** The migration file is staged at `prisma/migrations/20260409230000_add_loyalty_transaction/migration.sql` but there is no evidence in the review scope that `prisma migrate deploy` was executed. Per ADR-024 §Step 3, Brandon gates production rollout. ✅ Beta respected the instruction.

---

## Follow-ups (non-blocking)

| ID | Severity | Owner | Action |
|---|---|---|---|
| F1 | low | Beta | Align the admin role list in `app/api/marketplace/loyalty/route.ts:73, 119` with ADR-024 §Step 6 — add `"owner"` so that an owner-role user can call GET/POST. |
| F2 | low | Beta (future) | If the loyalty history ever exceeds ~1k rows per customer, promote offset→cursor pagination on `(createdAt, id)` as specified in ADR-024 §Read contract. Current impl is fine for v1. |
| F3 | medium | Beta + DB | Close the concurrent-redeem race by moving the negative-balance check inside the transaction (either raw `UPDATE ... WHERE loyaltyPoints + $1 >= 0` or a Postgres `CHECK` constraint). Out of TASK-005 scope. |
| F4 | medium | Beta | Implement ADR-024 §Step 7 guard test — Vitest that greps `lib/` and `app/` for direct writes to `loyaltyPoints` outside `lib/db/loyalty.db.ts` and `scripts/backfill-loyalty-transactions.ts`. This will immediately flag `lib/db/customers.db.ts:216` and `app/api/marketplace/orders/route.ts:204` so the invariant can be enforced. |

---

## Final recommendation

**Accept TASK-005.** Beta delivered the ADR-024 contract faithfully. The model shape, indexes, atomic write path, cross-tenant guards, idempotent backfill and six unit tests are all evidence-correct. Divergences are small, documented and accepted. The follow-ups are tracked and do not block merge.

Before marking TASK-005 `done` in the orchestrator, the meta-orchestrator should run:

```
npm run lint
npx tsc --noEmit
npm run test -- loyalty-db
npm run build
```

Gamma did **not** execute these in this review (static-only pass, per mission scope). They are the standard CLAUDE.md DoD gate and should be green before flipping `status: "done"`.

---

## Action block (for the meta-orchestrator)

```yaml
review: gamma-review-task-005
task: TASK-005
status: pass
blocking: false
deviations:
  - id: role-list
    file: app/api/marketplace/loyalty/route.ts
    lines: [73, 119]
    detail: 'role list missing "owner" vs ADR-024 §Step 6'
    severity: low
  - id: pagination-style
    file: lib/db/loyalty.db.ts
    lines: [233, 263]
    detail: 'offset pagination instead of ADR-spec cursor on (createdAt, id)'
    severity: low
follow_ups:
  - id: F1
    severity: low
    action: 'add "owner" role to requireAdmin list in loyalty route'
  - id: F2
    severity: low
    action: 'promote offset→cursor pagination when volume warrants'
  - id: F3
    severity: medium
    action: 'move negative-balance guard inside $transaction or add CHECK constraint on Customer.loyaltyPoints'
  - id: F4
    severity: medium
    action: 'add ADR-024 §Step 7 guard test; migrate the two existing direct loyaltyPoints writes (customers.db.ts:216, orders/route.ts:204) into LoyaltyDB'
required_gates_before_done:
  - npm run lint
  - npx tsc --noEmit
  - npm run test -- loyalty-db
  - npm run build
non_blocking_notes:
  - migration file present, migrate deploy NOT executed (as instructed)
  - no orchestrator.json mutation made by gamma in this review
recommendation: mark_done_after_gates_green
```
