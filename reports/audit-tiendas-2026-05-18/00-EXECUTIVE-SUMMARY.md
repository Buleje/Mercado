# Auditoría completa flujo /tiendas → checkout → pago

> **Fecha:** 2026-05-18 · **Branch:** `feat/checkout-payment-proof` · **Para:** Brandon
> **5 agentes auditaron en paralelo:** seguridad, performance, visual QA, code review, QA/tests
> **Reportes detallados:** `01-security-pentest.md` · `02-performance.md` · `03-visual-qa.md` · `04-code-review.md` · `05-qa-gaps.md`

---

## TL;DR (1 párrafo)

El flujo está **bien blindado en lo viejo** (pentests previos cerrados, IDOR + idempotency + totales server-authoritative + multi-tenant guard funcionan). **La zona nueva (comprobante Yape/Plin/Transfer multi-vendor) es el agujero**: 3 hallazgos cross-eje convergen en `app/api/marketplace/orders/route.ts` y `app/api/marketplace/checkout/payment-proof/route.ts`. Severidad máxima real: **P0 (lógico/calidad)**, **P1 (seguridad)**. **Branch NO debe mergear a master sin Sprint 1** (~6-8h de fix). Performance: 3 P0 con quick-wins masivos (5 min de fix → 882ms → 60ms en /tiendas). Visual: el tour bloqueante en todas las rutas marketplace es el peor UX del día.

---

## Severidad consolidada cross-eje

| Eje | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Seguridad (pentest) | 0 | 2 | 3 | 3 |
| Performance | 3 | 6 | 5 | — |
| Visual QA | 5 | 11 | 6 | — |
| Code review | 3 | 5 | 2 | — |
| QA / tests | 4 (gaps) | 8 (gaps) | 6 (gaps) | — |
| **TOTAL** | **15** | **32** | **22** | **3** |

---

## Top-15 hallazgos cruzados (orden de prioridad real)

| # | ID | Eje | Sev | Archivo:línea | Hallazgo | Fix esfuerzo |
|---|---|---|---|---|---|---|
| 1 | PENTEST-001 | SEC | P1 | `app/api/marketplace/orders/route.ts:213` | **Amount tampering del proof** — token verifica `amountPEN` contra sí mismo, no contra `order.total`. Cliente paga S/2 y orden queda como S/200 esperando aprobación. PoC funcional. | 1h |
| 2 | CR-2.1 | COD | P0 | `app/api/marketplace/checkout/payment-proof/route.ts:260` | **`storagePath` interno expuesto en JSON response** — debilita opacidad del HMAC, no se usa en cliente | 5 min |
| 3 | CR-2.2 | COD | P0 | `app/api/marketplace/orders/route.ts:341-370` | **`paymentApproval.create` + `order.update` fuera de transacción** — race condition deja PaymentApproval huérfana si update falla | 1h |
| 4 | VQA-S1/M1/CP1 | UX | P0 | `MarketplaceFirstVisitTour.tsx` | **Tour bloquea TODAS las rutas `/marketplace/*`** en primer acceso. Cliente nuevo NO puede agregar al carrito en /marketplace, /marketplace/[slug], /marketplace/como-pagar | 1h |
| 5 | QA-P0-1/2/3 | QA | P0 | (no existen tests) | **0% cobertura del feature comprobante** — `verifyProofToken()`, `/api/marketplace/checkout/payment-proof`, `PaymentProofModal.tsx` sin un solo test | 3-4h |
| 6 | PERF-P0-1 | PERF | P0 | `lib/db/marketplace/orders.db.ts:256-295` | **N+1 `tx.product.findFirst` dentro de `for` loop en `$transaction`** — 5 queries seriales por carrito de 5 items, +150ms y riesgo de timeout | 30 min |
| 7 | PERF-P0-2 | PERF | P0 | `/api/marketplace/catalog` | **TTFB cold 4.9s, payload 899KB** — bloquea LCP de /marketplace/explorar | 1h |
| 8 | VQA-S2 | UX | P0 | `StoreCatalog.tsx:391` | **Emoji 🔥 hardcodeado** — viola regla blindada `feedback_no_generic_emojis`. Reemplazar con `<Flame />` Lucide | 5 min |
| 9 | VQA-S3 | UX | P0 | `StoreDetailClient.tsx:207` | **`bg-white dark:bg-gray-950` token raw** — rompe theming dark si tenant personaliza | 5 min |
| 10 | CR-1.1 | COD | P0 | `app/api/marketplace/orders/route.ts` + 3 más | **27 llamadas `prisma.*` directas** fuera de `lib/db` (Regla #1 CLAUDE.md). Sin cache, sin audit trail | 4h |
| 11 | PENTEST-002 | SEC | P1 | `app/api/marketplace/checkout/payment-proof/route.ts:184-230` | **Capturas Yape con PII en bucket público** — único defensa: 24 bytes random + fallback graceful a `getPublicUrl` (riesgo compliance Ley 29733) | 2h |
| 12 | PERF-P1-2 | PERF | P1 | `app/api/marketplace/stores/route.ts` | **`Cache-Control` ausente** — 882ms por request, lo paga cada visita a /tiendas. Fix: 5 min de header, 99% requests → ~60ms | 5 min |
| 13 | CR-2.3 | COD | P1 | `CheckoutPaymentSection.tsx:495` vs `orders.db.ts:163` | **Constante loyalty inconsistente** — UI dice 50 pts/sol, backend usa 100. Confusión al usuario | 15 min |
| 14 | PERF-P0-3 | PERF | P0 | `YapePaymentPanel.tsx:101` + `PlinPaymentPanel.tsx:55` | **QR de pago sin `next/image priority`** — CLS en paso final del pago, LCP +200ms | 15 min |
| 15 | PENTEST-003 | SEC | P2 | `lib/db/marketplace/orders.db.ts:165-194` | **Per-customer coupon limit NO aplica en marketplace path** — mismo phone agota `maxUses` global | 30 min |

---

## Patrón emergente cross-eje

Los 5 agentes coincidieron en que **3 archivos concentran la deuda**:

| Archivo | Hallazgos cruzados | LOC |
|---|---|---|
| `app/api/marketplace/orders/route.ts` | PENTEST-001, CR-1.1×13, CR-1.2, CR-2.2, CR-2.4, CR-2.5, CR-3.2, PERF-P1-5 | 638 |
| `app/api/marketplace/checkout/payment-proof/route.ts` | PENTEST-002, CR-2.1, QA-P0×3 | 263 |
| `StoreDetailClient.tsx` | VQA-S3/S7/S10, CR-4.1, PERF-P1-1/P1-3/P1-6 | 1,299 |

→ **Conclusión:** una sola refactorización guiada de estos 3 archivos cierra el ~60% de los hallazgos.

---

## Roadmap propuesto (3 sprints)

### Sprint 1 — HOTFIX (bloquea merge a master) ~6-8h

| Tarea | Esfuerzo | Eje |
|---|---|---|
| Fix amount tampering proof vs order.total (#1) | 1h | SEC |
| Remove `storagePath` del JSON response (#2) | 5 min | COD |
| Envolver paymentApproval.create + order.update en `$transaction` (#3) | 1h | COD |
| Arreglar tour bloqueante — setear key onboarding o `pointer-events-none` (#4) | 1h | UX |
| Tests `verifyProofToken` + magic-bytes guard + canConfirm gate (#5) | 3-4h | QA |
| Reemplazar emoji 🔥 → `<Flame />` (#8) | 5 min | UX |
| `bg-white dark:bg-gray-950` → `bg-[var(--surface-canvas)]` (#9) | 5 min | UX |

**Salida:** branch listo para merge sin landmines de seguridad/calidad.

### Sprint 2 — P1 (esta semana) ~10-12h

| Tarea | Esfuerzo |
|---|---|
| Bucket privado `order-proofs` + remove fallback graceful (#11) | 2h |
| Per-customer coupon limit en marketplace path (#15) | 30 min |
| Migrar 27 `prisma.*` directos a `lib/db/marketplace/` (#10) | 4h |
| `Cache-Control` en /api/marketplace/stores (#12) | 5 min |
| Batch stock queries en `createFromCart` (#6) | 30 min |
| `next/image` + priority en QR Yape/Plin (#14) | 15 min |
| Unificar `PTS_PER_SOL = 100` en `lib/loyalty-constants.ts` (#13) | 15 min |
| Reducir TTFB /api/marketplace/catalog (#7) | 1h |
| E2E `checkout-payment-proof.spec.ts` (QA P1) | 2h |
| `applyRateLimit` con `await` consistente | 5 min |

### Sprint 3 — P2 polish (próximo sprint) ~8-10h

- CSP nonce-based en fallback de `next.config.ts` (PENTEST-004)
- orderId con `randomBytes(8)` en legacy `/api/orders` (PENTEST-005)
- Cachear filesystem reads en `/api/marketplace/stores`
- Dynamic imports en `TiendasClient.tsx` y `StoreBannerArea`
- Tipografía `text-xs` → `text-sm` en `YapePaymentPanel` (VQA C-4)
- `border-2` + tokens DS en cards tienda y producto (VQA T-6, S-4)
- Split `StoreDetailClient.tsx` 1,299 LOC en 4 componentes
- A11y `aria-label` en PaymentProofModal drag/drop (CR-5.1)
- Dark variant del `GuidedTour` modal (VQA C-2)
- humanizeCategory fix "AcompañAmientos" (VQA S-9)
- Test `k6` upload payment-proof bajo 50 VUs

---

## Lo que está bien blindado (no tocar)

| Validado por pentest | Estado |
|---|---|
| IDOR en `/api/orders/[id]/public` y `/tracking` | ✅ Cerrado |
| Idempotency cross-tenant en `/api/orders` y `/api/marketplace/orders` | ✅ Cerrado |
| Totales server-authoritative (rechaza si delta > 1 centavo) | ✅ Funciona |
| Cupón % > 100 cap aplicado | ✅ |
| Stock race condition con `$transaction` atómica | ✅ |
| `paymentProof.proofToken` HMAC bloquea reuse cross-customer | ✅ |
| Magic bytes guard JPEG/PNG/WebP + sharp re-encode | ✅ |
| SVG XSS via upload | ✅ Removido |
| CSRF double-submit constant-time | ✅ |
| Multi-tenant guard checkout admin cross-tenant | ✅ |
| Cart abandoned leak cross-customer | ✅ |
| Hardcoded secrets en bundle / NEXT_PUBLIC_ keys | ✅ 0 matches |
| Rate limit STRICT en proof-upload + marketplace-orders | ✅ |

---

## Métricas actuales (baseline)

| Endpoint | TTFB actual | Objetivo |
|---|---|---|
| /tiendas | 803ms | <300ms |
| /marketplace/[slug] | 1,635ms | <600ms |
| /checkout | 164ms ✅ | <200ms |
| /api/marketplace/catalog cold | 4,920ms / 899KB | <500ms / <100KB |
| /api/marketplace/stores | 882ms | <100ms (con cache) |
| /api/marketplace/orders | 751ms | <400ms |

**Cobertura tests actual:** ~60-65% del flujo base · **Cobertura del feature nuevo (comprobante):** 0%

---

## Siguiente acción recomendada

**Opción A (recomendada):** Atacar Sprint 1 ya. 6-8h y el branch queda mergeable a master con seguridad cerrada y feature nuevo testeado.

**Opción B:** Mergear ahora con Sprint 1 hallazgos documentados como TDs y trabajar en sprints separados. Riesgo: amount tampering es explotable hoy mismo en producción.

**Opción C:** Cerrar solo los P0 críticos de fix instantáneo (#2, #8, #9 — total 15 minutos) + el tour bloqueante (#4 — 1h) y dejar el resto para sprint dedicado. Riesgo: amount tampering queda abierto.

Mi recomendación: **A**. El amount tampering es el bug más caro del año si alguien lo descubre.
