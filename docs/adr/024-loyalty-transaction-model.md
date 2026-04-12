# ADR-024: Loyalty Transaction Model (TD-030)

## Status

Proposed — 2026-04-09
Author: Agent Alpha (Chief Software Architect)

> **Numbering note:** The mission originally requested slot `020`, but ADR-020 is already occupied by `020-ola1-migration-plan.md` (the umbrella Ola 1 plan, which itself references TD-030 as a child work item). This document therefore takes the next available number, **024**, and explicitly supersedes the TD-030 section of ADR-020 as the canonical design record for the loyalty ledger.

## Date

2026-04-09

## Context

The marketplace loyalty endpoint at `app/api/marketplace/loyalty/route.ts` currently references a `LoyaltyTransaction` model that **does not exist** in `prisma/schema.prisma`. TD-030 in `docs/TECH-DEBT.md` documents the gap:

> `LoyaltyTransaction` (modelo completo) — Referenciado por `app/api/marketplace/loyalty/route.ts` (3 uses) pero el modelo no existe en schema. El historial de puntos de fidelidad NO persiste — solo se guarda el balance actual en `Customer.loyaltyPoints`.

The current state of the domain:

- `Customer` (`prisma/schema.prisma:162`) stores only the aggregate balance: `loyaltyPoints Int @default(0)` and `loyaltyTier String @default("bronce")`.
- The Customer primary key is `phone String @id`, and every row is scoped by `tenantId String` with `@@index([tenantId])` and `@@index([tenantId, createdAt])`.
- As a workaround for the build, the POST handler mutates `customer.loyaltyPoints` directly and the GET handler returns an empty array for history.

This workaround has three real consequences that block the loyalty program from becoming a first-class feature of the marketplace:

1. **No audit trail.** There is no way to answer "why does this customer have 420 points?" — we cannot reconstruct whether points came from a purchase, a promotion, a manual grant, or a redemption.
2. **No idempotency.** Re-running a points-awarding job (cron, webhook retry, manual re-sync) double-credits the customer because the only source of truth is a mutable counter.
3. **No business reporting.** The `data-analyst` agency cannot build loyalty KPIs (points issued per week, redemption rate, tier transitions) without a transactional table to aggregate over.

TD-030 is classified 🟠 High in the tech-debt registry because the audit trail is outright broken, and the gap will widen as the loyalty program is exposed to more surfaces (POS, WhatsApp bot, referral program, marketplace checkout).

The Ola 1 umbrella plan (ADR-020) reserves the TD-030 migration as a child item without specifying the model shape, index strategy, or the read/write contract. This ADR fills that gap so that Beta (the Builder) can implement the Prisma migration, the DB class, and the route handler against a frozen contract.

## Decision

Create a new Prisma model `LoyaltyTransaction` as an append-only ledger of every change to `Customer.loyaltyPoints`. The existing `Customer.loyaltyPoints` column remains as a denormalized **materialized balance** for fast reads, but it becomes a derived value whose only legal mutation path is a matching ledger row written inside the same transaction.

### Model shape

```prisma
model LoyaltyTransaction {
  id         String   @id @default(cuid())
  customerId String   // FK to Customer.phone (Customer's @id is `phone`)
  tenantId   String
  amount     Int      // positive = credit, negative = debit; never 0
  reason     String   // enum-like discriminator: "purchase" | "promotion" | "redemption" | "manual" | "referral" | "expiry" | "adjustment"
  metadata   Json?    // free-form context: orderId, promoId, operator, notes
  createdAt  DateTime @default(now())

  customer Customer @relation(fields: [customerId], references: [phone], onDelete: Cascade)

  @@index([customerId, createdAt(sort: Desc)], map: "idx_loyalty_tx_customer_created_desc")
  @@index([tenantId, createdAt(sort: Desc)], map: "idx_loyalty_tx_tenant_created_desc")
  @@index([tenantId, reason])
}
```

Key shape decisions:

- **`amount: Int`**, not Decimal. Loyalty points are discrete counters, never fractional. Using `Int` keeps the math identical to `Customer.loyaltyPoints` and avoids the TD-018 conversion overhead.
- **`reason: String`** (not a Prisma enum). The set of reasons will evolve (seasonal campaigns, referral variants, partner integrations). A `String` with application-layer validation via Zod keeps migrations free; a Prisma enum would force a schema migration for every new reason. This is consistent with how `Order.status` and `NotificationLog.channel` are modeled elsewhere in this schema.
- **`metadata: Json?`** to carry per-reason context without exploding columns. Zod schemas in `lib/db/loyalty.db.ts` will define the shape per reason (e.g. `{ orderId: string }` for `"purchase"`, `{ promoId: string }` for `"promotion"`).
- **Compound index `(customerId, createdAt DESC)`** is the primary read path: "show this customer's history, newest first, paginated". The `DESC` direction on `createdAt` makes cursor pagination on the newest page free.
- **`(tenantId, createdAt DESC)`** supports tenant-wide reporting ("points issued this week") without scanning.
- **`(tenantId, reason)`** supports "how many points came from referrals this month" aggregations.
- **`onDelete: Cascade`** so that deleting a customer physically removes their ledger (we keep GDPR / Peruvian Ley 29733 "right to erasure" in mind — the denormalized `Customer.loyaltyPoints` disappears along with the rows).
- **No unique idempotency key column in v1.** Callers that need idempotency (cron retries, webhook re-deliveries) must include an idempotency key inside `metadata` and the DB class must `findFirst` before inserting. A future iteration can promote that to a partial unique index if usage warrants it.

### Write contract (POST)

Every write goes through `lib/db/loyalty.db.ts#addTransaction(tenantId, customerId, amount, reason, metadata)` and **must** execute inside a single `prisma.$transaction([...])` block:

1. `prisma.loyaltyTransaction.create({ data: { ... } })` — append the ledger row.
2. `prisma.customer.update({ where: { phone: customerId }, data: { loyaltyPoints: { increment: amount } } })` — move the materialized balance by the same delta.

The transaction wraps both operations so that a crash between (1) and (2) leaves the database consistent. Prisma's `increment` is atomic inside the transaction — we never read-modify-write the balance in application code, which eliminates the last-write-wins race that the current workaround has.

Additional write-path rules (enforced by `lib/db/loyalty.db.ts`):

- `amount !== 0` (reject no-op transactions at the Zod layer).
- If the resulting balance would be negative, the transaction rolls back and the DB class throws `LoyaltyInsufficientBalanceError`. The route handler maps that to HTTP 409.
- `tenantId` is always the first parameter, per CLAUDE.md rule #3. The DB class refuses to insert a row whose `customer.tenantId` does not match the provided `tenantId` (cross-tenant write guard — verified with a preliminary `findFirst`).
- After a successful write, `invalidateByPrefix(\`loyalty:\${tenantId}:\${customerId}\`)` is called (CLAUDE.md rule #5).
- Activity log is fire-and-forget: `logActivity(...).catch(() => {})` (CLAUDE.md rule #7).

### Read contract (GET)

`lib/db/loyalty.db.ts#listTransactions(tenantId, customerId, { cursor, limit })` returns a paginated history ordered by `createdAt DESC`:

- Default `limit = 20`, hard cap `100`.
- Cursor pagination on `createdAt + id` (stable order across ties).
- Response shape: `{ transactions: LoyaltyTransaction[], nextCursor: string | null, balance: number }` — the balance is read from `Customer.loyaltyPoints` in the same query batch so that the client never has to reconcile two calls.
- Cached with `getOrSet(\`loyalty:\${tenantId}:\${customerId}:page:\${cursor}\`, ...)`. TTL 60 s, invalidated on any write via the prefix above.

The handler at `app/api/marketplace/loyalty/route.ts` becomes a thin Zod-validated wrapper around the DB class — no business math, no direct Prisma access, consistent with CLAUDE.md rules #1, #2 and #6.

## Alternatives Considered

### Option A — Keep only `Customer.loyaltyPoints` and give up on history

- ✅ Zero migration cost.
- ✅ Zero index cost.
- ❌ Audit trail stays broken (TD-030 remains open forever).
- ❌ Cannot build any loyalty KPI, cannot debug disputes, cannot detect drift between the balance and the real events.
- ❌ Any idempotent retry double-credits the customer.

Rejected: the entire reason TD-030 exists is that the balance-only model has already failed us.

### Option B — Ledger table with **no** denormalized balance on `Customer`

The balance becomes a `SUM(amount)` over the ledger, computed on demand.

- ✅ Single source of truth, no possibility of drift.
- ✅ Simpler write path (just append).
- ❌ Every read of a customer page now triggers an aggregation query. The Customer row is read in dozens of hot paths (checkout, CartSidebar, admin customer detail, WhatsApp replies, loyalty banner). Turning each of those into a `SUM` is an unacceptable regression — especially at the `pgbouncer connection_limit=1` tier Supabase gives us.
- ❌ Breaks backward compatibility: every current reader of `customer.loyaltyPoints` would need refactoring in the same PR.

Rejected: the operational cost of losing the fast-read column is higher than the risk of drift between the ledger and the materialized balance — and the drift risk is mitigated by writing both inside `$transaction`.

### Option C — Ledger table with a **generated column** for the running balance per row

Add `balanceAfter Int` to `LoyaltyTransaction` and maintain it in the write path.

- ✅ "Show me the balance at time T" queries become free.
- ❌ Requires serializable isolation or advisory locks to avoid concurrent writers computing the same `balanceAfter`. Prisma + pgBouncer transaction pooling does not support serializable reliably.
- ❌ Adds complexity (a second derived field in the hot write path) for a query shape we do not currently need.

Rejected: deferred. If historical balance queries become common, we can backfill `balanceAfter` later without a breaking migration.

### Option D — Event-sourced via BullMQ + projection table

Emit `LoyaltyPointsChanged` domain events and project them into the ledger asynchronously.

- ✅ Fits the direction of ADR-007 (domain events on BullMQ).
- ❌ Introduces eventual consistency on a counter that users see on the next page load. Customer confusion is worse than a slightly slower write.
- ❌ BullMQ is not yet wired to this module; adopting it here would mean solving the queue worker problem before the ledger problem.

Rejected for v1. A future ADR may split the ledger projection onto BullMQ once the queue infrastructure is in place.

## Consequences

### Positive

- TD-030 moves from 🟠 High open to ✅ Closed once the migration, the DB class and the route handler are shipped.
- Full audit trail for every single change to a customer's points, queryable per-customer and per-tenant.
- Idempotency becomes achievable at the DB-class layer (via `metadata.idempotencyKey` + `findFirst` gate).
- `data-analyst` agency can build loyalty dashboards against `LoyaltyTransaction` directly — no more reverse-engineering from balance snapshots.
- The workaround in `app/api/marketplace/loyalty/route.ts` (array-empty-on-GET, raw-balance-mutation-on-POST) disappears, removing a documented correctness hazard.
- Writes stay O(1) — one insert plus one update, both inside a single transaction.

### Negative

- Two indexes on `(customerId, createdAt DESC)` and `(tenantId, createdAt DESC)` add write amplification. At the expected volume (hundreds of transactions per tenant per day, not thousands per second), this is negligible.
- A new invariant — "every change to `Customer.loyaltyPoints` must go through `loyalty.db.ts#addTransaction`" — has to be enforced by code review. The risk is that a future PR bypasses the DB class and updates the counter directly, drifting the ledger from the balance. Mitigation: a Vitest guard test that greps the repo for direct writes to `loyaltyPoints` outside `lib/db/loyalty.db.ts` and fails CI if it finds any.
- The `metadata: Json?` column is unstructured; the Zod layer inside the DB class is the only thing preventing garbage from landing in it.

### Risks

- **Backfill drift.** The backfill creates one synthetic transaction per customer equal to the current `loyaltyPoints`. If a write lands between the backfill and the code deploy, that write would be counted twice (once in the balance when the backfill captured it, once as a fresh transaction from the new write path). Mitigated by running the backfill inside the same maintenance window that toggles the feature flag `loyalty.ledger.enabled`.
- **pgBouncer transaction pooling limits.** `$transaction` with two operations is well inside the pgBouncer transaction pooling envelope. No change needed.
- **Cross-tenant mismatch.** A bug that inserts a ledger row with `tenantId = A` pointing to a customer with `tenantId = B` would create a ghost. Mitigated by the cross-tenant guard `findFirst` in the DB class plus the existing cross-tenant audit middleware (ADR-014).

## Migration Plan

> **Ownership:** Beta (the Builder) executes every step. Alpha (this ADR) only writes the plan. Gamma (the Verifier) validates steps 4, 5 and 8.

**Step 0 — Contract freeze (Alpha, this document).**
This ADR is the frozen contract. No schema or DB-class work starts until this ADR is marked `Accepted` by Brandon.

**Step 1 — Interface first (Alpha).**
Before touching Prisma, Alpha creates `lib/db/interfaces/loyalty.db.interface.ts` exporting `ILoyaltyDB` with `addTransaction(...)` and `listTransactions(...)` method signatures. Beta implements against this interface. This closes the TD-010 "DB classes without formal interfaces" gap for at least this one module.

**Step 2 — Prisma schema update (Beta).**
Add the `LoyaltyTransaction` model to `prisma/schema.prisma` exactly as specified in the "Model shape" section above. Add the reverse relation to `Customer`: `loyaltyTransactions LoyaltyTransaction[]`.

Generate the migration with `DATABASE_URL="$DIRECT_URL" npx prisma migrate dev --name add_loyalty_transaction --create-only`. Review the SQL by hand before applying — verify that the two indexes are created as `CREATE INDEX CONCURRENTLY` compatible (they are, because it is a brand-new table with zero rows at creation time, so regular `CREATE INDEX` is fine).

**Step 3 — Apply the migration to production (Beta, gated by Brandon).**
Run `DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy` against the production database. The migration is additive and zero-downtime because the table is new.

**Step 4 — DB class implementation (Beta).**
Create `lib/db/loyalty.db.ts` implementing `ILoyaltyDB`:

- `addTransaction(tenantId, customerId, amount, reason, metadata)` — Zod validation, cross-tenant guard, `$transaction([insert, increment])`, cache invalidation, fire-and-forget activity log.
- `listTransactions(tenantId, customerId, { cursor, limit })` — Zod validation, `getOrSet` cache wrapper, cursor pagination on `(createdAt, id)`, returns `{ transactions, nextCursor, balance }`.
- Exports the error classes: `LoyaltyInsufficientBalanceError`, `LoyaltyCrossTenantError`, `LoyaltyInvalidAmountError`.

**Step 5 — Backfill script (Beta).**
Create `scripts/backfill-loyalty-transactions.ts`:

```ts
// Pseudocode
for each tenant:
  for each customer where loyaltyPoints > 0:
    insert LoyaltyTransaction {
      customerId: customer.phone,
      tenantId,
      amount: customer.loyaltyPoints,
      reason: "backfill",
      metadata: { source: "ADR-024", backfilledAt: <timestamp> },
      createdAt: customer.createdAt,  // use the customer's own creation date, not now()
    }
```

Run the script idempotently: before inserting, `findFirst` where `reason = "backfill"` for that customer. If it already exists, skip. This lets the script be re-run without doubling up.

Run the backfill inside the same maintenance window as step 6 so that no live write can slip between them.

**Step 6 — Route handler rewrite (Beta).**
Replace `app/api/marketplace/loyalty/route.ts`:

- GET delegates to `listTransactions`. Remove the hardcoded empty array.
- POST delegates to `addTransaction`. Remove the direct mutation of `customer.loyaltyPoints`.
- Wrap both behind `requireAdmin(req, ["admin", "cajero", "owner", "manager"])` — the marketplace client still calls a separate public endpoint for customer self-view, which is out of scope for this ADR.

**Step 7 — Guard test (Beta).**
Add a Vitest that greps `lib/` and `app/` for direct assignments to `loyaltyPoints` outside `lib/db/loyalty.db.ts` and `scripts/backfill-loyalty-transactions.ts`. The test fails CI if it finds any.

**Step 8 — Verification (Gamma).**

- `npm run lint && npx tsc --noEmit && npm run test && npm run build` all green.
- Manual smoke test: award points via POST, verify balance + history via GET, verify cache invalidation, verify cross-tenant guard by attempting to award points to another tenant's customer (must return 403).
- Measure query plans: `EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "LoyaltyTransaction" WHERE "customerId" = $1 ORDER BY "createdAt" DESC LIMIT 20` must use `idx_loyalty_tx_customer_created_desc`.
- Close TD-030 in `docs/TECH-DEBT.md` with a pointer to this ADR and to the merged PR.

**Rollback plan.** The migration is additive; rolling it back is a single `DROP TABLE "LoyaltyTransaction"`. The route handler rollback is a git revert. The `Customer.loyaltyPoints` column is untouched throughout, so no data is lost during a rollback.

## References

- `docs/TECH-DEBT.md` — TD-030 (🟠 High, audit loyalty broken)
- `app/api/marketplace/loyalty/route.ts` — current workaround (3 `LoyaltyTransaction` references against a non-existent model)
- `prisma/schema.prisma:162` — `Customer` model with `loyaltyPoints Int @default(0)` and `loyaltyTier String @default("bronce")`
- `lib/db/interfaces/` — destination for `ILoyaltyDB` (Step 1)
- ADR-001 — Multi-tenancy row-level (`tenantId` as first query parameter)
- ADR-007 — Domain events on BullMQ (future path for async projection, deferred in Option D)
- ADR-017 — Ola 1 index migration strategy (precedent for zero-downtime DDL in this repo)
- ADR-020 — Ola 1 unified migration plan (parent umbrella; TD-030 subsection is superseded by this ADR)
- `CLAUDE.md` — rules #1 (no direct Prisma), #2 (`safeParse` only), #3 (`tenantId` first), #5 (invalidate after writes), #6 (no client-side totals), #7 (fire-and-forget)
