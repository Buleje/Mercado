# Gamma Review — Hotfix Wave 2 (Round 3, Adversarial)

**Reviewer:** Agent Gamma (QA + Security)
**Date:** 2026-04-09
**Scope:** HOTFIX-001 / 002 / 003 / 004 landed in parallel by Beta-Alpha + Beta-Bravo.
**Method:** Read-only, file:line evidence, independent of meta-orchestrator output.

---

## TL;DR

| Hotfix | Exploit | Status | Blocker? |
|---|---|---|---|
| HOTFIX-001 | Client-supplied price manipulation on `POST /api/orders` | **PASS** | no |
| HOTFIX-002 | Cross-tenant read/update/delete via `OrdersDB.*(id)` | **PASS** | no |
| HOTFIX-003 | IDOR on `GET /api/orders/[id]/public` leaking PII | **PASS** | no |
| HOTFIX-004 | Cross-tenant idempotency-key replay on `POST /api/orders` | **PASS** | no |

Four non-blocking follow-up notes at the bottom. Recommend **marking all four hotfixes done and shipping**.

---

## HOTFIX-001 — Price manipulation → **PASS**

Exploit surface: `app/api/orders/route.ts` POST handler used `body.items[i].price` for `itemsTotal` and for the persisted `orderItems[].price`. Attacker sets `price: 0.01` and pays 1 cent for whisky.

### Evidence

- **Server-authoritative map built from DB, scoped by tenantId**
  `app/api/orders/route.ts:204-218` — `prisma.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id, price, costPrice } })`. Tenant scoping is present on the `where` clause — cannot leak prices from another tenant.
- **Unknown/cross-tenant/deleted productId rejected 400**
  `app/api/orders/route.ts:219-226` — rejects with `{ error: "invalid_product", productId }`, status 400, before any write.
- **`itemsTotal` uses the server map, not the body**
  `app/api/orders/route.ts:230-233` — `reduce((sum, i) => sum + (serverPriceMap.get(i.id) ?? 0) * i.quantity, 0)`.
- **Persisted `orderItems[].price` also uses the server map**
  `app/api/orders/route.ts:315-323` — `price: serverPriceMap.get(i.id) ?? 0`. `costPrice` likewise from `costMap` (same authoritative query).
- **No remaining `i.price` / `item.price` sites that touch client data**
  grep of `route.ts` finds three remaining matches:
  - L324 `totalCogs` reduce iterates `orderItems` (already server-stamped at L315-323). Safe.
  - L381 + L418 `saved.items.map(...)` iterates the row returned by `OrdersDB.add(order)` — these are the persisted server prices, not `body`. Safe.

### Test sanity

`__tests__/orders-route-hotfix-001-004.test.ts`
- **(a) L214** — DB returns `price: 50`, client sends `price: 0.01`. Asserts `savedOrder.total === 50`, `persistedItems[0].price === 50`, and that `prisma.product.findMany` was called with `{ tenantId: TENANT_A, id: { in: [42] } }`. Real assertions, not dummies.
- **(b) L253** — catalog empty, client sends `id: 99999`. Asserts `res.status === 400`, `body.error === "invalid_product"`, `body.productId === 99999`, **and** `mockOrdersAdd not called`. Real.

**Verdict:** Exploit closed. Tests lock the contract.

---

## HOTFIX-002 — Cross-tenant order access → **PASS**

Exploit surface: `OrdersDB.getById(id)` / `update(id, …)` / `delete(id)` omitted `tenantId` in their where clauses → any authenticated admin could read/mutate/destroy any tenant's order by guessing the ID.

### DB class

`lib/db/orders.db.ts`
- **`getById(tenantId, id)` L209-215** — `findFirst({ where: { id, tenantId }, include: { items: true } })`. Correct: returns null on cross-tenant hit, no distinction from "not found" (prevents ID oracle).
- **`update(tenantId, id, patch)` L387-407** — pre-check `findFirst({ where: { id, tenantId } })` at L389, returns null on miss. Real mutation at L405 uses `prisma.order.update({ where: { id } })`. See security note SN-2 below — not exploitable but a defense-in-depth improvement is advised.
- **`delete(tenantId, id)` L413-415** — `deleteMany({ where: { id, tenantId } }).catch(() => {})`. Silent no-op on cross-tenant, no throw → no ID oracle. Good.

### Caller audit (grep over repo)

I grep'd `OrdersDB\.(getById|update|delete)\(` across the entire repo. Every production callsite passes `tenantId` as the first arg:

| Callsite | Evidence | ✓ |
|---|---|---|
| `app/api/orders/[id]/route.ts:45` | `OrdersDB.getById(auth.tenantId, id)` | ✓ |
| `app/api/orders/[id]/route.ts:77` | `OrdersDB.getById(auth.tenantId, id)` | ✓ |
| `app/api/orders/[id]/route.ts:91` | `OrdersDB.update(auth.tenantId, id, parsed.data …)` | ✓ |
| `app/api/orders/[id]/route.ts:285` | `OrdersDB.delete(auth.tenantId, id)` | ✓ |
| `app/api/orders/[id]/public/route.ts:54` | `OrdersDB.getById(orderMeta.tenantId, id)` (tenant pulled from pre-fetched order meta after phone match — safe, see HOTFIX-003) | ✓ |
| `app/api/notifications/route.ts:20` | `OrdersDB.getById(auth.tenantId, body.orderId)` | ✓ |
| `app/api/invoices/emit/route.ts:93` | `OrdersDB.getById(auth.tenantId, orderId)` | ✓ |
| `app/api/ai-assistant/actions/route.ts:81` | `OrdersDB.update(tenantId, orderId, …)` | ✓ |
| `lib/agents/domains/notifications.agent.ts:41` | `OrdersDB.getById(task.tenantId, orderId)` | ✓ |
| `lib/agents/domains/orders.agent.ts:78` | `OrdersDB.getById(task.tenantId, slot.orderId)` | ✓ |

**No missed callers.** The 10 production sites (8 files) are all tenant-scoped. Test file sites are expected and verified.

### Test sanity

`__tests__/orders-db-tenant-isolation.test.ts` — 6 cases:
- **(a)** L122 `getById` happy, asserts where clause `{ id, tenantId }`.
- **(b)** L137 `getById` cross-tenant → null; asserts where clause still carried `tenantId`.
- **(c)** L154 `update` cross-tenant → null + **`prisma.order.update` MUST NOT be invoked** (strongest assertion in the file).
- L170 `update` happy path.
- **(d)** L186 `delete` cross-tenant → resolves undefined + `deleteMany` called with `{ id, tenantId }` + **`prisma.order.delete` MUST NOT be invoked**.
- L199 `delete` happy path.

All assertions exercise the real contract, not happy-path-only.

**Verdict:** Exploit closed. Caller audit clean. Tests tight.

---

## HOTFIX-003 — Public IDOR + PII leak → **PASS**

Exploit surface: `GET /api/orders/[id]/public` was unauthenticated and returned customer name, phone, items, address, total to anyone who guessed an order ID.

### Endpoint rewrite

`app/api/orders/[id]/public/route.ts`
- **Rate limit MODERATE (20/5min/IP)** — L24.
- **Step 1: lightweight meta fetch, no PII** — L32-35: `prisma.order.findUnique({ where: { id }, select: { tenantId, customerPhone } })`.
- **Caller-supplied phone normalized** — L38-39: `normalizePhone(providedPhone)` (same helper checkout uses on write — normalization parity).
- **Single collapsed 404 for every failure mode** — L43-50: missing order, stored phone null, no query phone, mismatch → all collapse into one 404 `"Pedido no encontrado"`. No oracle distinguishing "wrong phone" from "does not exist".
- **Tenant-scoped full fetch** — L54: `OrdersDB.getById(orderMeta.tenantId, id)` (HOTFIX-002 guard).
- **Response trims PII** — L59-72 returns first name only, no phone, no address, no `customerPhone`. Correct minimization.

### Frontend cascade (6 touch points)

| File | Behavior | ✓ |
|---|---|---|
| `components/checkout/hooks/useCheckoutSubmit.ts:128` | `saveLastOrder(data.id, items, finalTotal, effective.phone)` — passes phone forward. | ✓ |
| `components/checkout/hooks/checkout-submit-helpers.ts:163-189` | `saveLastOrder` persists `customerPhone` into `bsm-last-order` localStorage. | ✓ |
| `components/OrderStatusModal.tsx:111-121, 123-128` | `getStoredPhone()` reads from `bsm-last-order`; `fetchLiveStatus` appends `?phone=…` when available. Falls through to phone-less call only if nothing stored — server 404s, UI treats as "gone". Safe. | ✓ |
| `app/pedido/[id]/page.tsx:121-123` | Reads phone from `searchParams` first, then `bsm-last-order`; appends `?phone=` when available. | ✓ |
| `app/pedido/[id]/recibo/page.tsx:59-61` | Same pattern. | ✓ |
| `app/(store)/tracking/TrackingForm.tsx:207-223` | `<input type="tel" required>`, rejects empty with inline error, builds `?phone=` URL. | ✓ |

### Test sanity

The 401/404 case is covered in the hotfix-001-004 test file indirectly via tenant-scoped lookup tests; a direct public-endpoint test for the 404 collapse path is NOT in the committed test file (the meta-orchestrator said there's one, but I only see the 4 cases a/b/c/d for 001+004). **Not a blocker** — the server logic is small and obviously correct — but see recommendation FR-1.

**Verdict:** Exploit closed. Cascade wiring clean. One follow-up test recommended.

---

## HOTFIX-004 — Cross-tenant idempotency replay → **PASS**

Exploit surface: `app/api/orders/route.ts` looked up idempotency keys by `{ idempotencyKey }` alone. Tenant B could send tenant A's key and receive tenant A's order back.

### Evidence

- **Tenant resolved BEFORE idempotency check** — `app/api/orders/route.ts:142-146`. `rawTenantId` from `x-tenant-id` header, resolved via `resolveTenantSlug`, falls back to `"main"`. Ordering is correct.
- **Where clause scopes by tenant** — L152-154: `prisma.order.findFirst({ where: { idempotencyKey, tenantId } })`. Both predicates present.
- **Comment documents the fix at the callsite** — L143-149 ties the reorder and the scoping together; future readers will not accidentally revert.

### Test sanity

`__tests__/orders-route-hotfix-001-004.test.ts`
- **(c) L275** — same tenant replays `KEY-REPLAY`, returns existing `ord-existing-abc` with status 200, **does not** call `OrdersDB.add`, and the lookup where clause contained both `{ idempotencyKey: "KEY-REPLAY", tenantId: TENANT_A }`.
- **(d) L325** — cross-tenant: `mockOrderFindFirst` only returns tenant A's row when queried with `tenantId === TENANT_A`. Tenant B sends the same key; asserts:
  - `res.status === 201` (NEW order created, **not** the replay path)
  - `body.id !== "ord-tenant-a-secret"` (no leakage)
  - `body.total === 10` (tenant B's server-computed total)
  - `mockOrdersAdd.mock.calls[0]?.[1] === TENANT_B` (persisted under tenant B)
  - `findFirst` lookup carried `tenantId: TENANT_B`

Case (d) is the one that matters and its assertions are tight.

**Verdict:** Exploit closed. Test (d) is a proper adversarial regression lock.

---

## Security notes (non-blocking)

- **SN-1 — `OrdersDB.getByCustomerPhone(phone)` at `lib/db/orders.db.ts:216-222` is NOT tenant-scoped.** It is invoked from `app/api/orders/route.ts:482` for the loyalty-milestone counter. If the same phone shops at two tenants, the counter cross-pollinates and a loyalty coupon could be issued against the wrong tenant's threshold. **Out of scope** for Wave 2 but should be on the backlog as HOTFIX-005.
- **SN-2 — `OrdersDB.update` at `lib/db/orders.db.ts:405` uses `prisma.order.update({ where: { id } })` after the tenant pre-check at L389.** Not exploitable in practice: order IDs are globally unique and `tenantId` is immutable, so the row the pre-check found is the row the update hits. Still, for atomicity + defense-in-depth the cleaner shape is `updateMany({ where: { id, tenantId }, data })` returning count. Recommend tightening but not blocking ship.
- **SN-3 — `app/api/ai-assistant/actions/route.ts:81` (`update_order_status`) bypasses the `VALID_TRANSITIONS` guard** from `app/api/orders/[id]/route.ts:80-89`. An AI action can push an order from `entregado` → `pendiente`. Minor policy gap, not a security issue — the caller is already admin-scoped — but worth flagging to Alpha for the next sprint.
- **SN-4 — HOTFIX-003 public endpoint rate limit is MODERATE (20/5min/IP).** Distributed phone+id enumeration is still possible across IPs. Given that the attacker needs BOTH the order id AND the exact phone, the practical risk is low, but a per-order attempt counter (5 failed phones → lock the id for 1h) would close the last crack. Not urgent.

## Follow-up recommendations

- **FR-1** — Add a direct unit test for `GET /api/orders/[id]/public`:
  - 404 when no phone query param
  - 404 when phone does not match stored `customerPhone`
  - 200 when phone matches (and response does NOT include `customer.phone` / `customer.location`)
- **FR-2** — Fix SN-2 by swapping to `updateMany` atomically.
- **FR-3** — Tenant-scope `getByCustomerPhone` (SN-1) as HOTFIX-005.

---

## Final recommendation

```yaml
wave: 2
reviewer: gamma
reviewed_at: 2026-04-09
hotfixes:
  HOTFIX-001:
    recommended_status: done
    verdict: pass
    blockers: []
    evidence: app/api/orders/route.ts:204-233, 315-323
  HOTFIX-002:
    recommended_status: done
    verdict: pass
    blockers: []
    evidence: lib/db/orders.db.ts:209-215, 387-407, 413-415
    callers_audited: 10
    missed_callers: 0
    notes:
      - SN-2 update() atomicity (non-blocking)
  HOTFIX-003:
    recommended_status: done
    verdict: pass
    blockers: []
    evidence: app/api/orders/[id]/public/route.ts:32-72
    cascade_touch_points_verified: 6
    follow_up_tests:
      - FR-1 direct public-endpoint unit test
  HOTFIX-004:
    recommended_status: done
    verdict: pass
    blockers: []
    evidence: app/api/orders/route.ts:142-159
non_blocking_backlog:
  - SN-1 tenant-scope OrdersDB.getByCustomerPhone (HOTFIX-005 candidate)
  - SN-2 OrdersDB.update → updateMany for atomicity
  - SN-3 ai-assistant update_order_status bypasses state machine
  - SN-4 harden public-endpoint rate limit + per-order attempt counter
  - FR-1 direct unit test for /api/orders/[id]/public
ship_decision: SHIP
```
