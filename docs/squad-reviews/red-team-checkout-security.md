# Red Team — Checkout Security Audit

**Agent:** Red Team (offensive)
**Scope:** `components/checkout/**`, `lib/db/orders.db.ts`, `lib/db/promotions.db.ts` (CouponsDB), `app/api/orders/*`, `app/api/cart/*`, `lib/middleware/*`, `lib/require-admin.ts`, `lib/resolve-tenant.ts`
**Date:** 2026-04-09
**Branch:** feature/td018-float-to-decimal
**Mode:** report-only (no code modified)

---

## Executive Summary

The checkout path has **at least 8 exploitable flaws**, including **4 CRITICAL** issues that allow direct financial loss or cross-tenant data compromise. The most severe is **price manipulation** (RED-001): the server's "recompute" only sums the client-supplied per-item prices against no DB reference, so an attacker can buy any product for `0.01`. Three separate **cross-tenant IDOR / leak** vectors exist because `OrdersDB.getById`, `OrdersDB.update`, `OrdersDB.delete`, the idempotency-key lookup, and `CouponsDB.getByCode/redeem` all omit `tenantId` from their `where` clauses. The public tracking endpoint is self-admitted IDOR. Stock is decremented fire-and-forget *after* the order row is created, with no reservation — parallel orders can oversell the last unit and the failure to decrement is swallowed silently. Coupon redemption is a classic check-then-act race plus a fire-and-forget increment; unlimited reuse is trivial.

**CLAUDE.md rule violations observed:** #1 (Prisma direct in route.ts L145, L160, L173, L252, L363, L385, L425, L488 — bypassing `lib/db`), #3 (`tenantId` missing in multiple multi-tenant queries), #6 (server claims to recompute but actually trusts client prices).

| # | ID | Severity | Area | Title |
|---|-----|----------|------|-------|
| 1 | RED-001 | 🔴 CRITICAL | Price | Server trusts client-supplied item prices (`body.items[i].price`) |
| 2 | RED-002 | 🔴 CRITICAL | Multi-tenant | `GET/PATCH/DELETE /api/orders/[id]` omit `tenantId` filter |
| 3 | RED-003 | 🔴 CRITICAL | IDOR | `GET /api/orders/[id]/public` — self-documented IDOR, leaks PII |
| 4 | RED-004 | 🔴 CRITICAL | Idempotency | Idempotency key lookup is cross-tenant — returns foreign order |
| 5 | RED-005 | 🟠 HIGH | Reservation | Stock decrement is fire-and-forget after insert; no reservation |
| 6 | RED-006 | 🟠 HIGH | Coupon | Coupon check-then-act race + fire-and-forget `.redeem()` swallow |
| 7 | RED-007 | 🟠 HIGH | Multi-tenant | `CouponsDB.getByCode/redeem` ignore tenant — cross-tenant reuse |
| 8 | RED-008 | 🟡 MEDIUM | Auth | `requireAdmin` allows `role==="admin"` to override tenant via header |
| 9 | RED-009 | 🟡 MEDIUM | Privacy | `/api/cart/[phone]` — no auth/ownership check, read/write/delete any cart |
| 10 | RED-010 | 🟡 MEDIUM | Discount | Strategy/promo/coupon discounts all stack unconditionally |
| 11 | RED-011 | 🟢 LOW | Defense-in-depth | `normalizePhone` not applied to `customerPhone` count query |

---

## RED-001 — Price Manipulation (CRITICAL)

**File:** `app/api/orders/route.ts`
**Lines:** 24–33 (schema), 197 (sum), 290–298 (persisted items)

### Exploit path
The Zod schema `OrderItemSchema` defines `price: z.number().min(0)` — the client sends the price. The "server-side total recomputation" at L197 is just:

```ts
const itemsTotal = body.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
```

`i.price` is the **client-submitted** value. The route later fetches `prisma.product.findMany({ ..., select: { id, costPrice, price } })` at L282 — but **only to build `costMap` for COGS**. The persisted `orderItems` at L290 still reuses `i.price` from the body:

```ts
const orderItems = body.items.map(i => ({
  id: i.id, name: i.name, price: i.price,  // ← client price, unverified
  costPrice: costMap.get(i.id), quantity: i.quantity, ...
}));
```

### Malicious payload
```http
POST /api/orders HTTP/1.1
Content-Type: application/json

{
  "customer": { "name": "Attacker", "phone": "999999999" },
  "items": [
    { "id": 42, "name": "iPhone Whisky Premium 12 años", "price": 0.01, "quantity": 1 }
  ],
  "total": 0.01,
  "paymentMethod": "efectivo"
}
```
→ Order is accepted. `total = 0.01`. `totalCogs` still computed from real `p.costPrice`, so the ledger shows a **negative-margin sale** of the full-cost product. This violates CLAUDE.md rule #6 ("No calcular totales en cliente — el backend recompone") — the backend recomposes the **sum**, not the prices.

### Fix
Replace `i.price` in L197 and L290 with `priceMap.get(i.id) ?? 0` (from the `findMany` query). Reject the order if any `productId` in the body is missing from the DB or if `priceMap.get(i.id) !== i.price` by more than a tolerance (and log it as fraud). Remove `price` from `OrderItemSchema` entirely — the client should only send `{ id, quantity }`.

---

## RED-002 — Cross-tenant Order Access via `/api/orders/[id]` (CRITICAL)

**File:** `app/api/orders/[id]/route.ts`
**Lines:** 45 (GET), 77 (PATCH), 91 (update), 285 (DELETE)
**Also:** `lib/db/orders.db.ts` L204–207 (`OrdersDB.getById`), L375–394 (`update`), L395–397 (`delete`)

### Exploit path
`GET` handler:
```ts
const auth = await requireAdmin(req);  // returns auth.tenantId
...
const order = await OrdersDB.getById(id);   // ← no tenant filter
```
`OrdersDB.getById` in `orders.db.ts:204`:
```ts
const row = await prisma.order.findUnique({ where: { id }, include: { items: true } });
```
The primary-key lookup has no `tenantId` predicate. `PATCH` handler at L77 calls the same `getById`, then `OrdersDB.update(id, ...)` at L91/375 — `update` also lacks `tenantId`. `DELETE` at L285 calls `OrdersDB.delete(id)` which is a plain `prisma.order.delete({ where: { id } })` with no tenant.

### Attack
1. `acme` admin authenticates, obtains valid session cookie.
2. Enumerates an order ID from tenant `zcorp` (leaked via support channel, logs, or the public endpoint RED-003 which exposes raw IDs).
3. `GET /api/orders/ord-<zcorp-id>` → returns the **full foreign order** (customer name, phone, location, items, total, yape op number).
4. `PATCH /api/orders/ord-<zcorp-id>` with `{ "status": "cancelado" }` → cancels a competitor's order.
5. `DELETE /api/orders/ord-<zcorp-id>` → soft-wipes it.

### Fix
Every `OrdersDB.getById/update/delete` must take `tenantId` as its **first argument** (per CLAUDE.md rule #3). Enforce in the Prisma `where`: `{ id, tenantId }`. Return 404 when the row exists but the tenant doesn't match — do not distinguish 404 from 403 to avoid oracle attacks. Then have the route handlers pass `auth.tenantId`.

---

## RED-003 — IDOR on Public Order Tracking (CRITICAL — self-admitted)

**File:** `app/api/orders/[id]/public/route.ts`
**Lines:** 6–18 (warning comment), 28 (lookup)

### Exploit path
The file header literally says:
> SECURITY WARNING: This endpoint is VULNERABLE to IDOR attacks. Any user can fetch any order by guessing its ID.

The handler pulls `id` from the URL with no auth, no signed token, no tenant scoping, and returns:
- Customer first name
- Items (name, quantity, unit)
- Total, payment method
- Notes (may contain address/DNI)
- Delivery slot
- Coupon / discount amount

The ID format is `ord-${Date.now()}-${Math.random().toString(36).slice(2,6)}` (L302 of orders POST). `Date.now()` is enumerable within a ~1s window; the suffix is only 4 base-36 chars (`36^4 ≈ 1.68M`). With a `MODERATE` rate limit (20 req / 5 min / IP) per the file, but a botnet or rotating IPs can brute-force a known-timestamp window. Much easier: any attacker who sniffs a WhatsApp link, email, or push URL (`/pedido/${id}`) gets the ID in plaintext and can scrape all order data for the corresponding customer chain.

### Malicious action
```bash
for ts in $(seq 1712674000000 1712674003000); do
  for suffix in aaaa aaab aaac ...; do
    curl https://acme.bodega.pe/api/orders/ord-$ts-$suffix/public
  done
done
```

### Fix
Option B from the file TODO: mint a signed `accessToken` (HMAC-SHA256 of `id|customerPhone|createdAt`) at order creation, store it on the row, and require `?token=...` on the public endpoint. Compare with constant-time equality. Return 404 on mismatch.

---

## RED-004 — Idempotency Key Cross-Tenant Leak (CRITICAL)

**File:** `app/api/orders/route.ts`
**Lines:** 143–151

### Exploit path
```ts
const idempotencyKey = req.headers.get("x-idempotency-key")?.slice(0,128) || undefined;
if (idempotencyKey) {
  const existing = await prisma.order.findFirst({
    where: { idempotencyKey },    // ← no tenantId
  }).catch(() => null);
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }
}
```
The lookup is global. Attacker flow:
1. Attacker submits a dummy order to tenant `evil` with `x-idempotency-key: abc123`.
2. Legitimate customer of tenant `acme` happens to use the same key (or attacker watches Sentry logs / guesses a common UUID).
3. Attacker sends a POST to any tenant with `x-idempotency-key: <victim-key>`; the route returns the victim's full `prisma.order` row **including everything that would normally require admin auth** — this endpoint is in the `PUBLIC_WRITE_ALLOWLIST` so it bypasses auth entirely (`lib/middleware/constants.ts:87`).

Worse: even without key collisions, attacker can replay their own idempotency key against a **different tenant** domain and receive their previously-created order from tenant `evil`, proving the cross-tenant join.

### Fix
```ts
where: { idempotencyKey, tenantId }
```
And add a compound unique index on `(tenantId, idempotencyKey)` at the schema level.

---

## RED-005 — Stock Oversell via Fire-and-Forget Decrement (HIGH)

**File:** `app/api/orders/route.ts`
**Lines:** 273 (insert), 337–341 (FEFO decrement)

### Exploit path
```ts
const saved = await withDbRetry(() => OrdersDB.add(order, tenantId));   // L334
// Order row is now persisted.

for (const item of body.items) {
  if (item.id > 0) {
    InventoryMovementsDB.decrementFEFO(item.id, item.quantity, saved.id, "venta_online")
      .catch(() => {});   // ← fire-and-forget, failure silently swallowed
  }
}
```

1. **No reservation before insert** — stock is checked (if at all) *after* the order is committed. Two parallel POSTs for the last unit both read `stock=1`, both insert orders, both attempt decrement. If the underlying `decrementFEFO` is not atomic (`UPDATE ... SET stock = stock - 1 WHERE stock >= 1`), stock can go negative silently.
2. **`.catch(() => {})`** means if the decrement hits a constraint (`CHECK stock >= 0`) or fails for any reason, the order still succeeds and the inventory stays wrong — **no compensation**.
3. The order row has no `status="reservado"` intermediate state. ADR 015 mandates reservations for checkout; this route does not honor it.

### Attack
Two parallel `curl` requests for the last unit of a scarce SKU → both succeed, customer A and customer B both receive confirmation. Vendor is short one unit.

### Fix
Wrap the `OrdersDB.add` and `decrementFEFO` in a single `prisma.$transaction([...])`. Use `UPDATE product SET stock = stock - :qty WHERE id = :id AND stock >= :qty RETURNING stock` (raw parameterized SQL) — abort the transaction if 0 rows affected. Return `409 Conflict — sin stock` to the client.

---

## RED-006 — Coupon Double-Use (Check-Then-Act + Silent Redeem) (HIGH)

**File:** `app/api/orders/route.ts`
**Lines:** 202–223 (validation), 345–347 (increment)
**Also:** `lib/db/promotions.db.ts:114–117` (`getByCode`), `146–151` (`redeem`)

### Exploit path
Validation step:
```ts
if (body.appliedCouponCode) {
  const coupon = await CouponsDB.getByCode(body.appliedCouponCode);    // read
  const valid = coupon && coupon.active
    && (!coupon.maxUses || coupon.usedCount < coupon.maxUses)
    && ...;
  if (valid) { serverCouponDiscount = ...; verifiedCouponCode = coupon.code; }
}
```
This is a **check-then-act** with no `SELECT ... FOR UPDATE`, no unique-constraint enforcement, no atomic `UPDATE ... WHERE used_count < max_uses`. Two parallel requests with `maxUses=1` both read `usedCount=0`, both pass the check, both apply the discount.

Then the increment:
```ts
if (verifiedCouponCode) {
  CouponsDB.redeem(verifiedCouponCode, serverCouponDiscount).catch(() => {});   // fire-and-forget
}
```
It is:
- Non-blocking (response returns before the increment completes)
- Error-swallowed (`.catch(() => {})`)

If `redeem()` itself fails (DB hiccup, giftcard balance underflow, network blip), the coupon counter is **never incremented** and the next request uses it again. Repeated bursts → unlimited discount.

`CouponsDB.redeem` in `promotions.db.ts:146–151` is also not atomic:
```ts
const row = await prisma.coupon.findFirst({ where: { code } });       // read
...
if (row.maxUses && row.usedCount >= row.maxUses) return null;
const data = { usedCount: row.usedCount + 1 };                        // classic lost-update
```

### Attack
```bash
for i in 1..10; do
  curl -X POST /api/orders -d '{..."appliedCouponCode":"HALF50"...}' &
done
```
All 10 succeed. `HALF50.maxUses=1`.

### Fix
Atomic conditional update:
```ts
const updated = await prisma.coupon.updateMany({
  where: { tenantId, code, active: true, OR: [{ maxUses: null }, { usedCount: { lt: maxUses } }] },
  data: { usedCount: { increment: 1 } },
});
if (updated.count === 0) throw new Error("Cupón no disponible");
```
Run this **inside the same transaction** as the order insert, not fire-and-forget.

---

## RED-007 — Cross-Tenant Coupon Reuse (HIGH)

**File:** `lib/db/promotions.db.ts`
**Lines:** 114–117 (getByCode), 146–151 (redeem)
**Caller:** `app/api/orders/route.ts:203`

### Exploit path
```ts
async getByCode(code: string): Promise<DbCoupon | null> {
  const row = await prisma.coupon.findFirst({ where: { code: code.toUpperCase().trim() } });
  // ← no tenantId in where clause
```
Tenant-scoped `prisma.coupon` rows share the global code namespace (e.g. `BIENVENIDA10` exists in both `acme` and `zcorp`). `findFirst` returns the *first* match in whichever order the DB scans. An attacker placing an order on tenant `zcorp` while passing `appliedCouponCode=BIENVENIDA10` may redeem `acme`'s coupon (and increment `acme`'s `usedCount`, corrupting their metrics), or vice versa. Gift-card type coupons leak balances across tenants.

### Fix
`getByCode(code, tenantId)` → `findFirst({ where: { code, tenantId } })`. Same for `redeem`. Pass `tenantId` at every call site.

---

## RED-008 — `requireAdmin` Allows Tenant Override via Header (MEDIUM)

**File:** `lib/require-admin.ts`
**Lines:** 49–65

### Exploit path
```ts
const headerTenantId = req.headers.get("x-tenant-id");
const effectiveTenantId = headerTenantId || payload.tenantId;

if (headerTenantId && headerTenantId !== payload.tenantId) {
  if (payload.role === "admin") {
    logger.info("[AUTH] Tenant override", ...);
    return { ...payload, tenantId: headerTenantId };        // ← accepted
  }
  ...
}
```
The comment at `lib/middleware/tenant.ts:15` explicitly states:
> SECURITY: never trust client-sent `x-tenant-id`

But `requireAdmin.ts` **does trust it** for any user with `role === "admin"`. The intent is to allow superadmins (`role === "superadmin"` — which isn't even the check — it's `role === "admin"`) to manage multiple stores. In practice, a tenant-admin of `acme` can set `x-tenant-id: zcorp` and the auth function hands back `{ tenantId: "zcorp" }`. Combined with RED-002 / RED-007, this turns every admin into a cross-tenant actor.

Additionally, the edge middleware is supposed to rewrite `x-tenant-id` per-request from the Host/Referer. But the POST /api/orders route at L156 also reads `x-tenant-id` directly — and because POST /api/orders is in the `PUBLIC_WRITE_ALLOWLIST` (`lib/middleware/constants.ts:87`), anonymous attackers can spoof it from any origin before the middleware rewrite lands (and if middleware is ever misconfigured to not mutate headers, the raw attacker value wins).

### Fix
- In `requireAdmin`: only allow tenant override when `payload.role === "superadmin"`, not `"admin"`.
- In POST /api/orders L156: derive the tenant **from the middleware-injected header only after confirming the middleware set it** (use a different header name, e.g. `x-bsm-tenant`, set by middleware and stripped from inbound requests).
- Audit every usage of `req.headers.get("x-tenant-id")` and strip untrusted inbound copies at the edge.

---

## RED-009 — Cart Endpoint Has No Auth / Ownership Check (MEDIUM)

**File:** `app/api/cart/[phone]/route.ts`
**Lines:** 10–75

### Exploit path
`GET /api/cart/999999999` → returns the current cart JSON for phone `999999999`. No auth, no rate limit, no ownership proof. Exposes SKUs, quantities, and implicitly the tenant (via `active-tenant` cookie-derived write path).
`PUT /api/cart/999999999` → overwrites victim's cart with attacker content (shop-lifting via UI confusion).
`DELETE /api/cart/999999999` → wipes victim's cart.

Write path at L57:
```ts
const tenantId = req.cookies.get("active-tenant")?.value ?? "main";
```
Attacker can set any `active-tenant` cookie client-side and poison carts in arbitrary tenants. `prisma.savedCart.upsert` has no tenant guard, so an existing cart under another tenant gets its `itemsJson` rewritten.

### Fix
- Require either an admin session or a customer-magic-link token (signed HMAC bound to phone).
- Use `upsert` with `where: { customerPhone_tenantId: { customerPhone: clean, tenantId } }` (composite key) so cross-tenant writes can't collide.
- Add rate limit (STRICT).

---

## RED-010 — Discount Stacking (MEDIUM)

**File:** `app/api/orders/route.ts`
**Lines:** 272

```ts
const computedTotal = Math.max(0, itemsTotal - serverCouponDiscount - promoDiscount - engineDiscount);
```
A single order can subtract **all three** discount sources: manual coupon code, promo ID, and the automatic strategy engine (volume + loyalty + first purchase). Nothing in the code enforces "highest wins" or "one per order". Business impact: 10% coupon + 10% first-purchase + 5% loyalty + a 15% promo = `1.0 - 0.4 = 0.6×` on a single line — 40% off. If `engineDiscount` itself stacks (`bestDiscount` may be the sum of all applicable strategies depending on the engine implementation — see `lib/pricing/discount-strategies.ts`), it's even worse.

### Fix
Pick the best single discount:
```ts
const bestDiscount = Math.max(serverCouponDiscount, promoDiscount, engineDiscount);
const computedTotal = Math.max(0, itemsTotal - bestDiscount);
```
Or encode an explicit stacking policy per coupon/promo.

---

## RED-011 — Customer Phone Not Normalized Before Count Query (LOW)

**File:** `app/api/orders/route.ts`
**Lines:** 252–254

```ts
customerTotalPurchases = await prisma.order.count({
  where: { tenantId, customerPhone },    // ← raw customer.phone from body
}).catch(() => 0);
```
`body.customer.phone` is client-supplied. Elsewhere the codebase calls `normalizePhone(...)` before query (e.g. `orders.db.ts:217, 388`). Skipping it here means an attacker sending `"+51 999 999 999"` vs. `"999999999"` produces a **different** `customerTotalPurchases` count → always returns 0 → `isFirstPurchase = true` → unlimited "first purchase" discount from the strategy engine.

### Fix
```ts
import { normalizePhone } from "@/lib/db/misc.db";
customerTotalPurchases = await prisma.order.count({
  where: { tenantId, customerPhone: normalizePhone(customerPhone) },
});
```

---

## Additional Observations (non-exploit)

- **Raw SQL at `lib/db/orders.db.ts:264` uses `Prisma.sql` + `Prisma.join`** — parameters are tagged-template, no injection. Good.
- **Raw SQL at L270** (`setval(pg_get_serial_sequence('"Product"','id'), ...)`) is static, no user input.
- **Raw SQL at L301** (`UPDATE "Order" SET "idempotencyKey" = ${order.idempotencyKey}`) — tagged template, parameterized. No injection, but **not tenant-scoped** — an attacker controlling `idempotencyKey` can overwrite it on any row because `WHERE id = ${row.id}` only uses the just-created row ID. Low risk but add a `AND "tenantId" = ...` defensively.
- **Rate limit on POST /api/orders is STRICT (5 / 15min / IP)** — adequate for brute-force, but stock-oversell (RED-005) only needs **2** simultaneous requests, which is below the per-minute burst.
- **`emitAdminSSE` at L416** broadcasts to "admin clients" — verify downstream filter by `tenantId`, otherwise admins of tenant A see tenant B's new-order events. Not audited here.
- **CLAUDE.md rule #1 violation**: the route uses `prisma.*` directly 8+ times instead of `lib/db/*.db.ts` classes. Orchestration still works but loses the cache + audit trail + tenant guard promise of the DB layer.

---

## Verification performed

- Read in full: `app/api/orders/route.ts`, `app/api/orders/[id]/route.ts`, `app/api/orders/[id]/public/route.ts`, `app/api/cart/[phone]/route.ts`, `lib/db/orders.db.ts`, `lib/require-admin.ts`, `lib/resolve-tenant.ts`, `lib/middleware/tenant.ts`, `lib/middleware/auth-guards.ts`
- Read in part: `lib/db/promotions.db.ts` (CouponsDB section), `lib/middleware/constants.ts` (allowlist)
- Grep'd for `tenantId` in every where-clause in orders.db.ts and route.ts
- Confirmed schema: `OrderItemSchema.price` is client-supplied
- Confirmed the server never re-reads product price into the persisted `orderItems`

**Files not read** (out of scope / time): `components/checkout/CheckoutModal.tsx` and hooks (attacker-controlled client is not part of the attack surface for server-side flaws), `lib/pricing/discount-strategies.ts` (would refine RED-010), `proxy.ts` (would refine RED-008 header trust chain).

---

## Hotfix Tasks

```yaml
- task_id: HOTFIX-001
  severity: CRITICAL
  title: "Price manipulation — server must reload item prices from DB"
  files:
    - app/api/orders/route.ts
  ref_finding: RED-001
  fix_summary: >
    Remove `price` from OrderItemSchema. Reload product prices from Prisma
    before computing `itemsTotal` and persist `priceMap.get(i.id)` in
    `orderItems[i].price`. Reject orders where any `productId` is missing
    from the DB. Keep the client-hint `total` only for logging a fraud
    delta, never for persistence.
  acceptance:
    - "Submitting an order with a per-item price != DB price uses the DB price."
    - "Test: POST /api/orders with `price: 0.01` for a 50 PEN product → order total is 50 PEN × qty."

- task_id: HOTFIX-002
  severity: CRITICAL
  title: "Add tenantId to all OrdersDB.getById/update/delete + idempotency lookup"
  files:
    - lib/db/orders.db.ts
    - app/api/orders/[id]/route.ts
    - app/api/orders/route.ts
  ref_finding: RED-002, RED-004
  fix_summary: >
    Change OrdersDB.getById/update/delete to take `tenantId` as first arg.
    Enforce `{ id, tenantId }` in Prisma `where`. Update all 15+ call sites
    to pass `auth.tenantId`. For the POST /api/orders idempotency lookup,
    add `tenantId` to the where clause and add a compound unique index
    `@@unique([tenantId, idempotencyKey])` in prisma/schema.prisma.
  acceptance:
    - "Admin of tenant A cannot GET/PATCH/DELETE an order of tenant B (404)."
    - "Reusing an idempotency key across tenants creates separate orders."

- task_id: HOTFIX-003
  severity: CRITICAL
  title: "Lock down /api/orders/[id]/public with signed access token"
  files:
    - app/api/orders/[id]/public/route.ts
    - lib/db/orders.db.ts
    - prisma/schema.prisma
  ref_finding: RED-003
  fix_summary: >
    Add `publicAccessToken` String column to Order. Generate
    `HMAC_SHA256(AUTH_SECRET, id|phone|createdAt)` at order creation.
    Require `?token=...` query param on the public endpoint and compare
    constant-time. Return 404 on mismatch (no oracle).
    Include the token in the tracking URL sent via WhatsApp/push.
  acceptance:
    - "GET /api/orders/<id>/public without ?token= → 404."
    - "GET with wrong token → 404."
    - "GET with correct token → returns redacted order."

- task_id: HOTFIX-004
  severity: HIGH
  title: "Atomic stock reservation inside order-insert transaction"
  files:
    - lib/db/orders.db.ts
    - app/api/orders/route.ts
  ref_finding: RED-005
  fix_summary: >
    Wrap OrdersDB.add and the FEFO stock decrement in a single
    prisma.$transaction. Use parameterized raw SQL
    `UPDATE Product SET stock = stock - $1 WHERE id = $2 AND stock >= $1`
    and abort the transaction if rowcount === 0 for any line item.
    Return 409 Conflict `{ error: "sin stock", productId }` to the client.
    Remove the fire-and-forget `.catch(() => {})`.
  acceptance:
    - "Two parallel POSTs for the last unit → exactly one succeeds, one returns 409."
    - "Failed decrement rolls back the order row."

- task_id: HOTFIX-005
  severity: HIGH
  title: "Atomic coupon redemption + tenant scoping"
  files:
    - lib/db/promotions.db.ts
    - app/api/orders/route.ts
  ref_finding: RED-006, RED-007
  fix_summary: >
    Change CouponsDB.getByCode(code) → getByCode(tenantId, code).
    Replace CouponsDB.redeem with an atomic
    `prisma.coupon.updateMany({ where: { tenantId, code, active: true,
    OR: [{ maxUses: null }, { usedCount: { lt: maxUses } }] },
    data: { usedCount: { increment: 1 } } })` — fail the order if
    `updated.count === 0`. Run inside the order transaction, NOT
    fire-and-forget. Add `@@unique([tenantId, code])` to Coupon.
  acceptance:
    - "Parallel orders using the same maxUses=1 coupon → only one succeeds."
    - "Tenant A coupon code cannot be redeemed on tenant B."
    - "If redeem fails, order is rolled back."
```

---

**End of report.** All findings are file:line-anchored and evidence-based. No source code was modified.
