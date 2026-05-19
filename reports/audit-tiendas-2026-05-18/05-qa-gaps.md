# QA & Tests Audit — flujo /tiendas → checkout
> Rama: `feat/checkout-payment-proof` | Fecha: 2026-05-18 | Auditor: QA-Reliability-Engineer

---

## Cobertura actual (lista tests existentes por área)

### Unit (Vitest) — 198 archivos

| Área | Archivos de test relevantes | Alcance actual |
|---|---|---|
| CheckoutPaymentSection | `__tests__/checkout-payment-section.test.tsx` | 27 casos: tabs yape/efectivo, tips, cupón, totales, submit, errores |
| useCheckoutSubmit | `__tests__/checkout/useCheckoutSubmit.test.ts` | 9 casos: efectivo, yape+opNumber, cupón, tip, doble-submit, validaciones, error 4xx, sanitize data-uri |
| useCoupon | `__tests__/checkout/useCoupon.test.ts` | Aplica cupón válido, cupón inválido, expirado, monto mínimo |
| useCheckoutState | `__tests__/checkout/useCheckoutState.test.ts` | Máquina de estados local del checkout |
| StepConfirmar | `__tests__/checkout/StepConfirmar.test.tsx` | Render del resumen antes de confirmar |
| Geolocalización | `__tests__/checkout/useGeolocation.test.ts`, `geo-utils.test.ts` | Permiso, error, fallback manual |
| Teléfono/DNI | `__tests__/checkout/usePhoneSearch.test.ts`, `phone-validation.test.ts`, `useDniLookup.test.ts` | Formato PE, lookup real |
| Loyalty | `__tests__/checkout/useLoyalty.test.ts` | Earn + redimir puntos en checkout |
| Cart context | `__tests__/cart-context.test.tsx`, `__tests__/contexts/cart-context.test.tsx`, `__tests__/contexts/cart-broadcast-multitab.test.tsx`, `__tests__/contexts/cart-context-multi-store.test.tsx` | Add/remove/clear, BroadcastChannel 5 casos, multi-store |
| Ordenes DB | `__tests__/orders-db-tenant-isolation.test.ts`, `orders-route-race-conditions.test.ts`, `orders-route-hotfix-001-004.test.ts` | Aislamiento tenant, race conditions idempotency |
| Commissions | `__tests__/commissions-business-logic.test.ts`, `commissions-tier-refund.test.ts`, `marketplace-commission-formula.test.ts` | Calculo %, recordCommission, tier refund |
| Marketplace orders | `__tests__/marketplace/orders-coupon-loyalty.test.ts`, `orders-status-transitions.test.ts`, `orders-stock-decrement.test.ts` | Transiciones de estado, stock, cupón+loyalty combinados |
| Cupones | `__tests__/coupon-validate.test.ts`, `coupons-store-isolation.test.ts`, `marketplace-coupon-validity.test.ts` | Validar, aislar por tenant, invalidar expirado |
| Whatsapp Yape | `__tests__/whatsapp/yape-capture.route.test.ts`, `yape-vision.test.ts`, `payment-approval.db.test.ts` | Captura Yape vía WhatsApp (distinto flujo) |

### E2E (Playwright) — 44 specs

| Spec | Qué cubre |
|---|---|
| `e2e/marketplace-checkout.spec.ts` | Flujo completo marketplace (5 tests, mock del POST final) |
| `e2e/checkout-flow.spec.ts` | Flujo store /checkout/datos → entrega → confirmar |
| `e2e/checkout-full-flow.spec.ts` | Happy path con usuario registrado |
| `e2e/checkout-multistep.spec.ts` | Navegación multi-paso |
| `e2e/checkout-fraud-protection.spec.ts` | Total manipulado, order sin items |
| `e2e/checkout-signed-in.spec.ts` | Flujo autenticado |
| `e2e/checkout.spec.ts` | Smoke del modal checkout |
| `e2e/checkout-confirmar-step.spec.ts` | Step confirmar aislado |
| `e2e/cart.spec.ts` | Add/remove/empty carrito |
| `e2e/marketplace-cart-persist.spec.ts` | Persistencia localStorage multi-navegación |
| `e2e/out-of-stock.spec.ts` | Producto sin stock bloqueado |

### Load (k6) — 3 scripts

| Script | Alcance |
|---|---|
| `k6/checkout-load.js` | 50 VUs, /api/orders, idempotency bajo carga, p95 < 2s |
| `k6/storefront-multitenant.js` | Carga del storefront por tenant |
| `k6/superadmin.js` | Panel superadmin |

---

## Gaps criticos (P0 — debe haber test antes de merge)

### 1. Upload comprobante — ruta `/api/marketplace/checkout/payment-proof` sin ningun test

| Escenario | Archivo sugerido | Assertion clave |
|---|---|---|
| Happy path: imagen JPEG valida + datos correctos → 200 `{ proofUrl, proofToken }` | `__tests__/api/checkout/payment-proof.test.ts` | `expect(res.status).toBe(200); expect(body.proofToken).toMatch(/\.\w+\.\w+\.\w+\.\w+\.\w+/)` |
| Archivo no-imagen (PDF spoofed con content-type `image/jpeg` pero magic bytes PDF) → 400 `magic bytes invalidos` | idem | `expect(body.error).toMatch(/magic bytes/)` |
| Archivo > 5 MB → 400 `Captura muy grande` | idem | `expect(res.status).toBe(400)` |
| Sin sesion de customer (sin cookie) → 401 | idem | `expect(res.status).toBe(401)` |
| Campo `storeSlug` con caracteres invalidos (XSS attempt) → 400 Zod | idem | `expect(body.error).toBe("Datos incompletos")` |
| `amountPEN = 0` o negativo → 400 | idem | `expect(res.status).toBe(400)` |

### 2. `verifyProofToken` — funcion criptografica sin ningun test

| Escenario | Archivo sugerido | Assertion clave |
|---|---|---|
| Token valido → `{ ok: true }` | `__tests__/lib/payments/proof-token.test.ts` | `expect(result.ok).toBe(true)` |
| Token con sig corrupta → `{ ok: false, reason: "bad-sig" }` | idem | `expect(result.reason).toBe("bad-sig")` |
| Token de distinto customerId → `{ ok: false, reason: "mismatch" }` | idem | `expect(result.reason).toBe("mismatch")` |
| Token con format de 5 partes (no 6) → `{ ok: false, reason: "bad-format" }` | idem | verificar cada rama |
| amountCents distinto → mismatch | idem | tamper de centavos debe fallar |

### 3. `PaymentProofModal` — componente sin ningun test unitario

| Escenario | Archivo sugerido | Assertion clave |
|---|---|---|
| Archivo > 5 MB muestra error "La imagen no debe pesar mas de 5 MB" sin llamar fetch | `__tests__/checkout/PaymentProofModal.test.tsx` | `expect(screen.getByText(/5 MB/)).toBeInTheDocument(); expect(mockFetch).not.toHaveBeenCalled()` |
| Archivo con tipo no permitido (PDF) muestra "Formato no soportado" | idem | verificar `setError` con formato correcto |
| Confirmar sin haber subido imagen muestra "Sube la captura antes de continuar" | idem | `canConfirm === false` → boton deshabilitado |
| Upload exitoso → boton "Confirmar pago" se habilita y llama `onConfirm` | idem | `expect(onConfirm).toHaveBeenCalledWith({ proofUrl, proofToken, reference })` |
| Upload fallido (fetch 500) muestra error del server | idem | mensaje de error visible |
| Metodo `transfer` muestra campos banco/titular/cuenta; no muestra QR | idem | `expect(screen.queryByTestId("qr")).not.toBeInTheDocument()` |

### 4. E2E checkout con comprobante — flujo nuevo no tiene spec

| Escenario | Archivo sugerido | Assertion clave |
|---|---|---|
| Happy path Yape: tienda → carrito → comprobante → confirmar → success | `e2e/checkout-payment-proof.spec.ts` | orderId visible en success screen, POST /api/marketplace/orders recibe `proofToken` |
| Intento de confirmar sin subir comprobante → boton deshabilitado en modal | idem | `expect(btnConfirmar).toBeDisabled()` |
| Upload de comprobante en Plin → metodo `plin` se envia al API | idem | body.method === "plin" en el POST interceptado |
| Multi-vendor: 2 tiendas en carrito, cada una recibe su propio comprobante | idem | 2 proofTokens distintos en el body final |

---

## Gaps importantes (P1)

| Escenario | Archivo sugerido | Razon |
|---|---|---|
| Carrito vacio → checkout bloqueado (redirige o muestra mensaje, no 500) | `e2e/checkout-flow.spec.ts` (ampliar) | Ruta directa a `/checkout/datos` con localStorage vacio |
| Cambio de tenant durante checkout invalida carrito | `__tests__/contexts/cart-context-multi-store.test.tsx` (ampliar) | Race condition multi-tenant |
| Cupón expirado devuelve error legible (no excepcion Zod cruda) | `__tests__/coupon-validate.test.ts` (ampliar) | `.safeParse()` confirmado, pero borde de expiración |
| Stripe falla en medio de checkout → orden queda en `PAYMENT_FAILED` no `CONFIRMED` | `__tests__/state-machines/order-machine-xstate.test.ts` (ampliar) | State machine debe tener transicion explicita |
| commissions.ts con vendor que tiene 0 productos → no divide-by-zero | `__tests__/commissions-business-logic.test.ts` (ampliar) | Calculo comision base 0 |
| Descuento que lleva total a exactamente 0 → checkout no envia orden con `total: 0` | `__tests__/checkout/useCheckoutSubmit.test.ts` (ampliar) | Guard de total minimo |
| `k6/checkout-load.js` no ejerce el endpoint de payment-proof bajo carga | `k6/checkout-load.js` (ampliar) | El upload es el cuello de botella mas lento del flujo nuevo |
| Visual regression del modal PaymentProofModal (Yape/Plin/Transfer) | Storybook + Chromatic | Cambios de marca romperian UX silenciosamente |

---

## Gaps deseables (P2)

| Escenario | Razon |
|---|---|
| A11y del modal PaymentProofModal (role=dialog, focus-trap, escape cierra) | Audit Round 28 detecto 1304 violaciones; el modal nuevo no fue auditado |
| Test de `capture="environment"` en input file → no rompible por SSR (atributo solo cliente) | Cambio UX de 2026-05-17 |
| `PaymentProofsDB.create` con tenantSlug ya existente → no duplica | Aislamiento multi-tenant para el flujo PRE-tenant (ruta diferente) |
| Signed URL fallback a publicUrl en test de integracion | Rama `signed url failed` solo tiene log, sin test |
| k6: escenario de upload de comprobante bajo 50 VUs concurrentes | Sharp + Supabase storage son costosos, latencia desconocida |
| Test de MercadoPago webhook con comprobante asociado a orden | `__tests__/api/marketplace/payment/mercadopago-webhook.test.ts` ya existe — extender con proofToken |

---

## Plan de tests sugerido (estimacion tiempo)

### Unit (Vitest): 22 tests nuevos, ~3.5h

| Grupo | Tests | Tiempo |
|---|---|---|
| `proof-token.test.ts` (verifyProofToken — 5 casos) | 5 | 45 min |
| `PaymentProofModal.test.tsx` (6 casos: validaciones file, upload, confirm) | 6 | 1h |
| `api/checkout/payment-proof.test.ts` (6 casos: happy path + 5 errores) | 6 | 1h |
| Ampliar `commissions-business-logic.test.ts` (total=0, vendor sin productos) | 2 | 20 min |
| Ampliar `useCheckoutSubmit.test.ts` (total=0 guard) | 1 | 15 min |
| Ampliar `order-machine-xstate.test.ts` (Stripe falla → PAYMENT_FAILED) | 2 | 30 min |

### E2E (Playwright): 6 tests nuevos, ~3h

| Spec | Tests | Tiempo |
|---|---|---|
| `checkout-payment-proof.spec.ts` (Yape happy path, sin comprobante, Plin, multi-vendor) | 4 | 2h |
| Ampliar `checkout-flow.spec.ts` (carrito vacio → bloqueado) | 1 | 30 min |
| Ampliar `marketplace-checkout.spec.ts` (cupón expirado real, no mock) | 1 | 30 min |

### Load (k6): 1 escenario nuevo, ~1h

| Script | Escenario | Tiempo |
|---|---|---|
| Ampliar `checkout-load.js` con etapa de upload payment-proof (multipart, 50 VUs) | 1 | 1h |

**Total estimado: ~7.5h de trabajo de testing**

---

## Top-5 tests criticos a escribir YA

| Prioridad | Test | Por que es bloqueante para merge |
|---|---|---|
| 1 | `verifyProofToken` — token tampering (bad-sig, mismatch, bad-format) | Es la criptografia que impide fraude: cliente envia proofToken falso y crea orden sin pagar |
| 2 | `api/checkout/payment-proof` — archivo no-imagen con content-type spoofed | Magic bytes guard existe en codigo pero no hay test; si falla, suben PDFs o scripts al bucket |
| 3 | `PaymentProofModal` — confirmar sin subir imagen → boton deshabilitado | `canConfirm = Boolean(uploadedUrl && uploadedToken)` correcto, pero sin test podria regresionar |
| 4 | `PaymentProofModal` — archivo > 5 MB rechazado client-side antes de fetch | Validacion duplicada (cliente + servidor); si la del cliente desaparece, el usuario espera upload para recibir error |
| 5 | E2E `checkout-payment-proof.spec.ts` — happy path Yape con mock del POST final | Unico test que verifica que el `proofToken` llegue al endpoint de Orders y el success screen aparezca |
