# Checkout Module — Clean Code Review

**Reviewer:** Squad agent (Reviewer role)
**Date:** 2026-04-09
**Scope:** `components/checkout/**` (37 files, ~4,200 LoC counting hooks/parts/steps)
**Reference:** ADR-015 (confirmar-step footer slot), CLAUDE.md danger-zone rules #2, #4, #6, #8, #11
**Mode:** READ-ONLY — no source code modified.

---

## 1. Module overview

| Layer | Files | Role |
|---|---|---|
| Orchestrator | `CheckoutModal.tsx` | Wires contexts + hooks + steps, 263 LoC |
| Wizard steps | `CheckoutAccountStep`, `steps/StepDatos`, `steps/StepPago`, `steps/StepConfirmar`, `CheckoutSuccessStep` | One per wizard stage |
| Presentational panels | `CheckoutOrderReview`, `CheckoutPaymentSection`, `YapePaymentPanel`, `PlinPaymentPanel`, `CashChangeCalculator`, `CheckoutDeliverySchedule`, `CheckoutNotesField`, `FreeDeliveryBanner`, `StepBar` | UI-only |
| Parts | `parts/*` (Shell, Header, MiniCartSummary, AddressInput, SavedAddressList, CustomerFormFields, CustomerVerifiedCard, phone-validation) | Reusable building blocks |
| Hooks | `hooks/useCheckoutState`, `useCheckoutSubmit`, `useCheckoutHandlers`, `useCheckoutInit`, `useCoupon`, `useLoyalty`, `useDniLookup`, `useGeolocation`, `usePhoneSearch`, `useStockCheck`, `usePendingOrders`, `checkout-submit-helpers` | Side effects + reducer + submit pipeline |
| Types | `types.ts` | Discriminated unions |

Architecture is healthy after the 1333→263 LoC refactor. Most findings are local and fixable without disturbing the wizard contract.

---

## 2. Per-file scorecard

| File | LoC | ★ | Notes |
|---|---:|:-:|---|
| `CheckoutModal.tsx` | 263 | ★★★★ | Clean orchestrator; deep prop drilling; client-side total preview (ok per comment but risky) |
| `types.ts` | 116 | ★★★★★ | Discriminated-union done right |
| `index.ts` | 19 | ★★★ | Barrel file — triggers `bundle-barrel-imports` smell, and re-exports dead `PlinPaymentPanel` |
| `StepBar.tsx` | 80 | ★★★★★ | Minimal, memoisable |
| `steps/StepDatos.tsx` | 261 | ★★★ | `CheckoutNotesField` rendered in two branches; `updateDetailedLocation` is business logic in UI |
| `steps/StepPago.tsx` | 121 | ★★★★ | Thin wrapper; inherits god-props from `CheckoutPaymentSection` |
| `steps/StepConfirmar.tsx` | 325 | ★★★★ | Clean; `fmt()` helper duplicated with other files; address card duplicates `CheckoutOrderReview` markup |
| `CheckoutAccountStep.tsx` | 137 | ★★★★ | `PhoneValidation` interface re-declared locally |
| `CheckoutSuccessStep.tsx` | 168 | ★★★★ | 12-dot confetti could be memoised; inline colours array |
| `CheckoutDeliverySchedule.tsx` | 148 | ★★ | **UTC-date bug**, IIFE with inline slot config, hard-coded store hours, Spanish tildes missing |
| `CheckoutOrderReview.tsx` | 217 | ★★★ | Local `CartItem` interface drifts from cart-context; client-side subtotal recompute (l.182); `<img onError mutates DOM>` |
| `CheckoutPaymentSection.tsx` | 515 | ★★ | **LARGEST**; 30+ props god-bag; ETA computed in JSX IIFE; client-side points math (l.472); 200 LoC of duplicated Yape/cash buttons |
| `CheckoutNotesField.tsx` | 61 | ★★★★ | Magic numbers 200/180 |
| `CashChangeCalculator.tsx` | 59 | ★★ | **Bill filter bug** for `finalTotal > 200`; floating-point change calc |
| `YapePaymentPanel.tsx` | 167 | ★★★ | **Fake resettable countdown (dark pattern smell)**; inline yape type duplicated |
| `PlinPaymentPanel.tsx` | 119 | ★ | **Dead code** — exported but no consumer; near-clone of `YapePaymentPanel` |
| `FreeDeliveryBanner.tsx` | 55 | ★★★★ | Clean; delivery thresholds hard-coded |
| `parts/CheckoutModalShell.tsx` | 112 | ★★★ | Magic z-index `2147483645`; no Esc handler, no focus trap beyond `aria-modal` |
| `parts/CheckoutModalHeader.tsx` | 57 | ★★★★ | Uses `<img>` not `next/image` |
| `parts/MiniCartSummary.tsx` | 57 | ★★★★★ | — |
| `parts/AddressInput.tsx` | 225 | ★★★★ | 15-prop god-bag; mixes HTML `required` with controlled state |
| `parts/CustomerFormFields.tsx` | 138 | ★★★★★ | — |
| `parts/CustomerVerifiedCard.tsx` | 158 | ★★★★★ | — |
| `parts/SavedAddressList.tsx` | 82 | ★★★★★ | — |
| `parts/phone-validation.ts` | 28 | ★★★★★ | Pure, testable |
| `hooks/useCheckoutState.ts` | 147 | ★★★★★ | Exhaustiveness check present |
| `hooks/useCheckoutSubmit.ts` | 208 | ★★★ | Validation block duplicated with `useCheckoutHandlers`; whole-`state` dep; `res!` assertion |
| `hooks/useCheckoutHandlers.ts` | 263 | ★★★ | Same validation duplicated a third time (l.156-203) |
| `hooks/checkout-submit-helpers.ts` | 211 | ★★★★ | `postWithRetry` has no idempotency key (ADR-015 gap); magic `.slice(-9)` phone truncation |
| `hooks/useCheckoutInit.ts` | 92 | ★★★ | `eslint-disable react-hooks/exhaustive-deps` on purpose — fragile |
| `hooks/useCoupon.ts` | 77 | ★★★★ | No Zod `safeParse` on response (rule #2 spirit) |
| `hooks/useLoyalty.ts` | 51 | ★★★★ | Hard-coded `TIER_DISCOUNT`; no `safeParse` |
| `hooks/useDniLookup.ts` | 103 | ★★★★ | Good abort handling; no `safeParse` |
| `hooks/useGeolocation.ts` | 174 | ★★★★ | Nominatim URL hard-coded; Spanish landmarks inline |
| `hooks/usePhoneSearch.ts` | 65 | ★★★★★ | — |
| `hooks/useStockCheck.ts` | 52 | ★★★★ | No `safeParse`; inline type cast |
| `hooks/usePendingOrders.ts` | 40 | ★★★★ | Untyped `const data = await res.json()` |

**Average:** 3.9/5 — solid post-refactor baseline with a handful of sharp, revenue-touching defects.

---

## 3. TOP 5 findings (ranked by revenue risk)

### #1 — CashChangeCalculator hides bill options when total > S/200

`components/checkout/CashChangeCalculator.tsx:23`

```ts
{bills.filter(b => b >= finalTotal).map(bill => ( … ))}
```

`bills = [10, 20, 50, 100, 200]`. If `finalTotal = 210`, the filter returns `[]` and the user sees **only** the "Monto exacto" button. High-value cash orders (a common case for bodega deliveries) lose the change-preparation UX with no fallback. Silent revenue pressure.

**Fix:**
- Show bills unconditionally; disable (`opacity-50`) any bill `< finalTotal` with tooltip "insuficiente".
- Add a custom-amount input when `finalTotal > max(bills)`.
- Emit the selected bill to the parent so the backend gets a `cashPaidWith` hint (currently this state is local and lost).

---

### #2 — Client-side business math violates CLAUDE.md rule #6

`components/checkout/CheckoutModal.tsx:91-99` (tier discount + final total preview)
`components/checkout/CheckoutPaymentSection.tsx:472` (`Math.floor(finalTotal / 10) * 5` loyalty points)

```ts
// CheckoutModal.tsx:92-99
const tierDiscountPct = getTierDiscountPct(state.loyalty.tier);
const tierDiscount = cartTotal * (tierDiscountPct / 100);
const finalTotal = Math.max(
  0,
  cartTotal - discount - state.coupon.discount - tierDiscount + state.payment.tip
);
```

The comment says "el backend recompone — esto solo es UI/preview", which is true for the total. But the **tier discount rate table** (`TIER_DISCOUNT = {plata:2, oro:4, diamante:7}`) lives in `useLoyalty.ts:9-13`, duplicated from the server. If the business raises `oro` to 5% server-side and forgets the client, the user is shown S/X in the modal and charged S/X+0.something on confirmation → trust hit.

Same issue with points: displayed as an immutable fact ("+{points} puntos") but computed locally.

**Fix:**
- New endpoint `POST /api/checkout/preview` returning `{ subtotal, promoDiscount, couponDiscount, tierDiscount, tip, finalTotal, estimatedPoints }` from authoritative server logic.
- `CheckoutModal` calls it on cart/coupon/customer change (SWR key), client just displays.
- Delete `TIER_DISCOUNT` table and `getTierDiscountPct` from the client bundle.

---

### #3 — Delivery-date minimum uses UTC, not America/Lima

`components/checkout/CheckoutDeliverySchedule.tsx:44`

```ts
min={new Date().toISOString().split("T")[0]}
```

`toISOString()` always serialises in UTC. Peru is `UTC-5`: on any date after 19:00 Lima time, this returns **tomorrow's** date, so the `<input type="date">` blocks the user from selecting today. Before 00:00 UTC, the two dates agree; between 19:00 Lima and 00:00 Lima (when it's still today locally but already tomorrow UTC) it silently breaks same-day delivery.

The same file uses the correct Lima-TZ trick on l.101-103 for slot enable/disable — inconsistent with the `min=` above.

**Fix:**

```ts
min={new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date())}
// Swedish locale → "YYYY-MM-DD"
```

Add a unit test with `vi.setSystemTime(new Date("2026-04-09T23:30:00-05:00"))` that asserts min is `2026-04-09`, not `2026-04-10`.

---

### #4 — Fake, resettable Yape countdown is a dark-pattern smell

`components/checkout/YapePaymentPanel.tsx:20-23,52-63`

A prominent 10-minute countdown (`Tiempo expirado` red pulsing banner) with a button that simply calls `setCountdown(600)`. There is no server-side reservation, no stock hold, no order pre-commit — the "deadline" is purely UI decoration. This is the textbook definition of a false-urgency dark pattern, and Peruvian consumer-protection law (Indecopi, Cod. de Protección al Consumidor art. 13) prohibits artificial purchase pressure.

**Fix:** either
- (a) remove the timer entirely (safest) — keep only the "Esperando tu pago…" indicator; or
- (b) tie the timer to a real `POST /api/checkout/reservations` that holds stock for 10 minutes and releases it on expiry — then the countdown has meaning.

---

### #5 — Duplicated validation across three layers → silent drift risk

1. `hooks/useCheckoutHandlers.ts:156-203` (pre-nav in `handleDataSubmit`)
2. `hooks/useCheckoutSubmit.ts:77-107` (re-validate in `submit`)
3. `hooks/checkout-submit-helpers.ts:23-37` (`resolveEffectiveValues` normalises a third time)

All three implement variations of "name trim, DNI 8-digit, location non-empty" with copy-pasted error strings in Spanish. When the rules change (e.g. phone becomes required), the odds of updating all three are low. The `handleDataSubmit` path also mutates `state.ui.dataError` while `submit` mutates `state.ui.submitError` — the user sees different messages depending on path.

**Fix:** Extract:

```ts
// hooks/checkout-validation.ts
export type ValidationResult =
  | { ok: true; effective: EffectiveValues }
  | { ok: false; field: "name"|"dni"|"location"; message: string };
export function validateCheckoutForm(state: CheckoutState, customer: Customer | null): ValidationResult { … }
```

Both paths call this, both dispatch into the same `ui.submitError` slot.

---

## 4. Other notable findings (#6 — #15)

| # | File:Line | Type | 1-line |
|---|---|---|---|
| 6 | `PlinPaymentPanel.tsx` (entire), `index.ts:6` | dead code | Exported, never imported — delete or wire into `CheckoutPaymentSection` |
| 7 | `CheckoutPaymentSection.tsx:61-90` | god-props | 30+ props; split into `TipSelector`/`CouponInput`/`TotalsSummary`/`PaymentMethodSelector` |
| 8 | `CheckoutOrderReview.tsx:6-14` | type drift | Local `interface CartItem` duplicated from `cart-context`; l.182 recomputes subtotal client-side |
| 9 | `CheckoutPaymentSection.tsx:94-156` + `CheckoutDeliverySchedule.tsx:101-115` | business logic in JSX IIFE | Store hours (8-21 vs 8-20) hard-coded **and inconsistent** |
| 10 | `StepDatos.tsx:189-195,201-209` | duplication | Same `CheckoutNotesField` rendered in both branches with different `rows` |
| 11 | `checkout-submit-helpers.ts:189-211` | idempotency gap | `postWithRetry` retries `POST /api/orders` with no `Idempotency-Key` header — network timeout after server-commit → duplicate order (ADR-015 explicitly mentions idempotency) |
| 12 | `useCheckoutInit.ts:89` | effect dep smell | `eslint-disable react-hooks/exhaustive-deps` on `[open]` — customer context changes while modal open are ignored |
| 13 | all fetch hooks | rule #2 spirit | No `safeParse`; every response cast with `as` — adds a runtime trust boundary |
| 14 | `CheckoutModalShell.tsx:70-82` | a11y | role=dialog + aria-modal but no Esc handler, no focus trap, no initial-focus target |
| 15 | `YapePaymentPanel.tsx:109`, `CheckoutModalHeader.tsx:31` | rendering | `yape.phone!` non-null assertion; raw `<img>` instead of `next/image` |

---

## 5. Three suggested refactors

### R1 — Extract `validateCheckoutForm` pure helper
**Effort:** small (~4 h, 1 PR)
**Scope:** new `hooks/checkout-validation.ts` + callers in `useCheckoutHandlers` and `useCheckoutSubmit`; one unit-test file with table-driven cases.
**Pays for:** Finding #5, the second half of #2, future rule changes.

### R2 — Split `CheckoutPaymentSection` into 5 subcomponents
**Effort:** medium (~1-2 days, 1 PR + test regeneration)
**Scope:** new files `components/checkout/payment/{DeliveryEtaCard,TipSelector,CouponInput,TotalsSummary,PaymentMethodSelector}.tsx`; delete the 515-line monolith; keep one `CheckoutPaymentSection` as a composition shell.
**Pays for:** Finding #7, makes Finding #4 trivial to remove, enables memoisation (`rerender-memo`).

### R3 — Server-side checkout preview endpoint + money helper
**Effort:** medium-large (~3-5 days, 2 PRs: backend + client)
**Scope:** new `POST /api/checkout/preview` with Zod-validated request/response; client switches to SWR with the cart digest as key; delete client-side `getTierDiscountPct`, `Math.floor(finalTotal / 10) * 5`, `cartTotal * promo.discountPercent / 100`. Pair with a `lib/money.ts` wrapping `currency.js` (keep integer cents).
**Pays for:** Findings #2 and the underlying float risk (aligns naturally with the in-flight `feature/td018-float-to-decimal` branch). Kills the last rule-#6 violations in the checkout surface.

---

## 6. Quick wins (< 30 min each, no refactor risk)

1. Delete `PlinPaymentPanel.tsx` + remove from `index.ts` (finding #6).
2. Change `CheckoutDeliverySchedule.tsx:44` to the `sv-SE` / `America/Lima` formatter (finding #3).
3. Remove `setCountdown(600)` button from `YapePaymentPanel.tsx:58` (cheapest version of finding #4).
4. Import `CartItem` from `@/contexts/cart-context` in `CheckoutOrderReview.tsx` (finding #8, part 1).
5. Fix missing Spanish accents across `CheckoutPaymentSection` ("Método", "Cupón", "Número", "Mañana") — pure text edits.

---

## 7. Action block for orchestrator

```yaml
# Top findings to promote to orchestrator tasks for next Alpha/Beta sprint.
# IDs follow CHECKOUT-<AREA>-<NN> naming.

new_tasks:
  - id: CHECKOUT-CASH-01
    title: Fix CashChangeCalculator bill filter and propagate cash-paid amount
    severity: high
    impact: revenue
    file: components/checkout/CashChangeCalculator.tsx
    evidence: "line 23 — bills.filter(b => b >= finalTotal) hides all options when total > 200"
    finding_ref: "#1"
    owner_hint: frontend + backend (add cashPaidWith to payload)
    estimated_effort: small

  - id: CHECKOUT-PREVIEW-02
    title: Move loyalty points, tier discount and finalTotal preview to server endpoint
    severity: high
    impact: rule_6_compliance + trust
    files:
      - components/checkout/CheckoutModal.tsx:91-99
      - components/checkout/CheckoutPaymentSection.tsx:472
      - components/checkout/hooks/useLoyalty.ts:9-21
    evidence: "client computes tierDiscount = cartTotal * tierPct/100 and points = floor(total/10)*5; CLAUDE.md rule #6 forbids"
    finding_ref: "#2"
    owner_hint: backend-platform-engineer + frontend-engineer
    estimated_effort: medium
    depends_on: none

  - id: CHECKOUT-TZ-03
    title: Fix delivery-date minimum to use America/Lima timezone
    severity: high
    impact: revenue (same-day delivery blocked after 19:00 Lima)
    file: components/checkout/CheckoutDeliverySchedule.tsx:44
    evidence: "new Date().toISOString().split('T')[0] returns UTC date; Peru is UTC-5"
    finding_ref: "#3"
    owner_hint: frontend-engineer
    estimated_effort: tiny
    needs_test: "vi.setSystemTime @ 23:30 UTC-5 should accept today"
```

---

*End of review. No source code was modified. All evidence is grounded in file:line references above.*
