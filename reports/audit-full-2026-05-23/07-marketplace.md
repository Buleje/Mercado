# Auditoría Marketplace Multi-Vendor — 2026-05-23

> Fuentes leídas: `components/marketplace/**`, `app/marketplace/**`, `app/api/marketplace/**`, `lib/db/marketplace/*`, `lib/db/commissions.db.ts`, `lib/db/vendor-applications.db.ts`, `lib/db/vendor-grace.db.ts`, `lib/commissions.ts`, `lib/stripe-connect.ts`, `lib/integrations/{reniec,sunat-ruc}.ts`, `app/api/cron/settle-commissions/route.ts`, `app/superadmin/{vendor-health,vendor-applications}/**`, ADR-079, ADR-112.

---

## 1. Resumen ejecutivo

| Bloque | Estado | Nota |
|---|---|---|
| Catálogo + storefront `/marketplace` | OK | Rappi-style mobile (2026-05-15) persiste + SEO ItemList JSON-LD en place |
| Cálculo de comisiones | **DIVERGENTE** | 2 motores paralelos: `MarketplaceOrdersDB.createFromCart` (legacy `store.commission`) vs `CommissionsDB.computeVendorTier` (tier bronze/silver/gold/platinum). Resultado: comisión cobrada a la tienda ≠ comisión calculada en stats |
| Aislamiento `tenantId` cross-vendor | OK con un agujero | `recordCommission` falla-loud ahora (audit 2026-05-17), pero `_pathHash` del proofToken no se valida (ver P0-3) |
| Audit trail comisiones | OK | `CommissionLedger` + reversal entries con monto negativo |
| ADR-079 (vendor approval) | OK | Estado de máquina + audit `VendorApplicationReview`; ADR-080 (provisión tenant real) sigue **STUB** |
| TD-058 (8 capas RENIEC/SUNAT) | PARCIAL | onboarding bloqueante + grace funcionan; **cron diario `vendor-reverify` NO EXISTE** en `app/api/cron/` |
| Stripe Connect | INFRA EXISTE, NO ENGANCHADA | `lib/stripe-connect.ts` + onboard/status endpoints listos, pero `createSplitPayment` no se invoca en el checkout |
| Mercado Pago split | NO | `/api/marketplace/payment/mercadopago` existe; sin split por vendor |
| Vendor health dashboard | OK | KPIs + grace + alerts; depende del cron faltante |
| Onboarding `/vender → aprobación → primera venta` | PARCIAL | Solicitud pública OK; aprobación crea `stub-*` tenant (ADR-080 pendiente) |

---

## 2. Hallazgos por severidad

### P0 — puede romper dinero o aislamiento

| # | Archivo | Hallazgo | Detalle |
|---|---|---|---|
| P0-1 | `lib/db/marketplace/orders.db.ts:234` | **Doble motor de comisión incompatible** | `createFromCart` usa `store.commission` (legacy %); `CommissionsDB.recordMarketplaceCommissions` aplica tier dinámico (2/3/4/5%). La fila escrita en checkout NO pasa por `CommissionsDB`. Resultado: dashboards de tier muestran 3% pero ledger cobró 5%. **Riesgo: reclamos de vendors + diferencia financiera por orden** |
| P0-2 | `lib/db/marketplace/orders.db.ts:380-392` | **Comisión escrita con `type:"sale"` (string libre)** | El enum oficial es `marketplace_fee|delivery_fee|platform_fee|refund_reversal`. La fila creada en checkout escapa de los queries de `payoutSummaryByVendor` (filtran por `type:{not:"refund_reversal"}` pero no incluyen `"sale"` en agregados por tipo) → **payouts subreportados** |
| P0-3 | `app/api/marketplace/checkout/payment-proof/route.ts:106` | **proofToken no verifica `_pathHash`** | El campo se firma y deserializa pero **nunca se valida** contra el storagePath original. Un atacante con un proofToken válido puede mover `_pathHash` a otra captura del mismo bucket si conoce la convención. Mitigación parcial: el token incluye `customerId+slug+method+amount`, pero el path queda libre |
| P0-4 | `app/api/cron/` (faltante) | **Cron `vendor-reverify` NO existe** | TD-058 capa 4 (cron diario que re-verifica RUC/DNI) declarada pero no implementada como endpoint en `app/api/cron/`. `VendorHealthDashboard` muestra `summary.lastRunAt` que nunca se setea → dashboard `neverRun=true` permanente en prod si nadie lo dispara |
| P0-5 | `app/api/marketplace/stores/route.ts:34-53` | **`ensureTenant` auto-crea tenant en lookup público** | El GET público dispara `tenant.create` si el slug no existe. Eso permite a un atacante crear filas Tenant masivas con slugs arbitrarios via `GET /api/marketplace/stores?tenantSlug=xyz`. Aunque la respuesta no expone data, contamina la tabla Tenant + tabla Settings |
| P0-6 | `lib/db/marketplace/orders.db.ts:863-867` | **CommissionLedger.status="cleared"** | El status enum esperado es `pending|settled|paid|refunded` (ver `lib/db/commissions.db.ts:9`). Escribir `"cleared"` rompe el filtro `status:"settled"` del cron de settle y del `payoutSummaryByVendor` → vendor entregó pero la fila nunca aparece en payouts pendientes |

### P1 — bug funcional o pérdida silenciosa

| # | Archivo | Hallazgo |
|---|---|---|
| P1-1 | `lib/stripe-connect.ts:96` | `application_fee_amount` calculado a partir de `amount * rate / 100` pero amount está en céntimos → **comisión 100× menor**. Falta `Math.round((amount/100) * rate * 100 / 100)` o renombrar el contrato del param |
| P1-2 | `app/api/cron/settle-commissions/route.ts:30-49` | El cron busca **TODAS** las pending `<7d` cross-tenant en un único `updateMany` sin batching ni `tenantId` filter explícito. Si una tenancy sufre data drift (status null/legacy), el cron las marca `settled` ciegamente |
| P1-3 | `lib/db/marketplace/orders.db.ts:457-520` | `cancelOrderRestoreStock` envuelve `order.update + product.updateMany` en `$transaction`, pero la `CommissionLedger.refund` **NO** se dispara — `refundCommissionsByOrder` existe en `CommissionsDB` pero no se llama. Resultado: orden cancelada con stock revertido, comisión sigue `pending` → settle cron la cobra |
| P1-4 | `app/api/marketplace/stores/apply/route.ts:160-164` | Soft-pass identityVerified queda como string libre, no se persiste en `Store` ni en `VendorApplication`. Imposible filtrar luego "vendors con verificación pendiente" desde DB |
| P1-5 | `lib/db/commissions.db.ts:200-242` | `computeVendorTier` divide por `rate/100` para reconstruir ventas; si una fila histórica tiene `rate=0` la salta sin loggear, sub-contando ventas → tier degradado injustamente |
| P1-6 | `lib/db/marketplace/orders.db.ts:610` | `getVendorDashboard` cachea 60s sin invalidación tras escritura. Tras el primer pedido del día, el dashboard del vendor muestra cero ventas durante 60s |
| P1-7 | `app/api/marketplace/orders/route.ts:42-75` | GET de admin no incluye `Cache-Control: no-store`; respuestas con números de cliente enmascarados pueden quedar en CDN intermedios |
| P1-8 | `lib/integrations/sunat-ruc.ts:60` | Provider mock es default — **prod sin `SUNAT_RUC_PROVIDER` setea retorna ok sin hits** → vendors entran sin verificación real. Verificable con `process.env.NODE_ENV === "production"` |
| P1-9 | `app/api/marketplace/checkout/payment-proof/route.ts:50` | Bucket privado por default `order-proofs`; sin runtime check al boot que confirme `public=false`. Si alguien crea bucket sin marcar privado, captura Yape (PII) queda pública |
| P1-10 | `lib/db/vendor-applications.db.ts:371-385` | `provisionTenantStub` import dinámico fire-and-forget; si falla, no hay retry ni cola → vendor aprobado queda eternamente sin tenant. Falta entry en BullMQ |

### P2 — calidad / observabilidad

| # | Archivo | Hallazgo |
|---|---|---|
| P2-1 | `components/marketplace/MarketplaceCheckoutModal.tsx` (64.9 KB) | Componente monolítico; partir en pasos (Address/Payment/Confirm) |
| P2-2 | `components/marketplace/MarketplaceCart.tsx` (69.5 KB) | Mismo problema; alto riesgo de regression |
| P2-3 | `app/api/marketplace/stores/route.ts` (>700 LOC) | Lista de tiendas mezcla GET público + POST admin; partir en 2 endpoints |
| P2-4 | `lib/db/marketplace/orders.db.ts:583-585` | Búsqueda de tags `TIER_DISCOUNT_FAILED` por `notes.contains` — fragil si copy cambia; usar columna dedicada |
| P2-5 | `lib/stripe-connect.ts` | Sin tests; el cálculo de fee es trivial pero crítico |
| P2-6 | `app/marketplace/[slug]/page.tsx:760-766` | hoursJson via `$queryRaw` por schema drift; aplicar migration expand-contract |
| P2-7 | `app/api/marketplace/stores/apply/route.ts:90` | `isInvoiceable` solo aplica cuando `source!=="mock"`; mock + prod sin provider → bypass total |
| P2-8 | `lib/db/commissions.db.ts:264-280` | Idempotencia por `findFirst + create` (no atómica) — race window entre 2 calls paralelas sin unique index `(tenantId, orderId, type)` |
| P2-9 | `components/marketplace/MarketplaceFilters.tsx` (31.6 KB) | Lógica de filtros pesada — extraer a hook + memoizar |
| P2-10 | `app/api/marketplace/cart/save/route.ts` (85 LOC) | Carrito unificado se guarda server-side; falta TTL explícito + límite N items |

---

## 3. Reglas duras del agente (CLAUDE.md §4)

| Regla | Estado | Evidencia |
|---|---|---|
| 1. No `prisma.*` directo | PARCIAL | `MarketplaceOrdersDB` aún hace ~10 `prisma.*` (eslint-disabled con justificación). Migración pendiente a `CustomersDB` / `CouponsDB` |
| 2. `safeParse` Zod | OK | Todos los endpoints leídos usan `safeParse` |
| 3. `tenantId` 1er argumento | PARCIAL | `VendorApplicationsDB` excepción justificada (ADR-079 §2.3). `MarketplaceOrdersDB.createFromCart` deriva `tenantId` del slug — aceptable |
| 4. Sin `force-dynamic` Next 16 | OK | Storefront usa `"use cache"` + cacheLife/Tag |
| 5. Invalidar cache | DEUDA | `getVendorDashboard` no invalida (ver P1-6) |
| 6. **Totales server-side** | OK CON GAPS | Precios server-side OK; pero el doble motor de comisión (P0-1) y `type:"sale"` (P0-2) hacen que el monto persistido sea incorrecto vs. el reportado |
| 7. Fire-and-forget con `.catch` | OK | `triggerDeliveryOfferOnOrder`, `sendWhatsAppQueued`, `provisionTenantStub` con catch |
| 9. `requireAdmin` en rutas protegidas | OK | `GET /api/marketplace/orders` (admin/manager/cajero), `/stripe-connect/onboard` (admin) |
| 11. Raw SQL parametrizado | OK | `$queryRaw\`SELECT ... WHERE id = ${store.id}\`` usa Prisma tagged template (no interpolación) |

---

## 4. ADR-079 vs realidad

| Elemento del ADR | Implementación | Estado |
|---|---|---|
| 6 estados + state machine | `lib/state-machines/vendor-application-machine.ts` + `VendorApplicationsDB._applyAction` | OK |
| `@@unique(ruc)` | Schema + pre-check + catch P2002 | OK |
| Audit trail `VendorApplicationReview` | Append-only en tx | OK |
| Cache 30s + tags `vendor-applications:*` | `listPending / listByStatus` con `"use cache"` + `cacheLife` | OK |
| Rate limit STRICT en submit público | `applyRateLimit(req, "STRICT", "marketplace-apply")` | OK |
| `provisionTenantStub` retorna `stub-*` | Import dinámico fire-and-forget | OK |
| Banner UI que avisa "stub tenant" | No verificado en este audit (ver `app/superadmin/vendor-applications/`) | UNK |
| **ADR-080 (provisión real)** | NO IMPLEMENTADO | Bloqueante para go-live de marketplace público |

---

## 5. TD-058 (8 capas RENIEC/SUNAT) — verificación

| Capa | Esperado | Estado |
|---|---|---|
| 1. Integration helper | `lib/integrations/{reniec,sunat-ruc}.ts` | OK |
| 2. Onboarding bloqueante | `apply/route.ts:78-128` (RUC: bloquea si no apto; DNI: bloquea si no encontrado) | OK |
| 3. Manual check (superadmin) | `app/superadmin/vendor-applications/` + drawer | OK |
| 4. Cron diario `vendor-identity-recheck` | **NO existe en `app/api/cron/`** | **FALTANTE (P0-4)** |
| 5. Persistent notification | `lib/db/vendor-grace.db.ts` + dashboard | OK (depende cron) |
| 6. WhatsApp alert | `sendWhatsAppQueued` invocado en apply OK; no en cron | PARCIAL |
| 7. Email backup | Resend cliente OK; sin invocación en cron de re-verify | PARCIAL |
| 8. Self-service grace + override | `VendorGraceDB.set/clear` + UI dashboard | OK |

**Conclusión:** capas 1-3, 5, 8 viven. Capas 4, 6, 7 dependen del cron faltante. Dashboard `/superadmin/vendor-health` se renderiza correctamente pero **summary.lastRunAt** nunca se hidrata en prod.

---

## 6. Storefront `/marketplace/[slug]` — rediseño 2026-05-15

| Aspecto | Estado |
|---|---|
| Rappi-style mobile + scrollspy | OK (`StoreDetailClient` + `ChatBubbleLazy` con dynamic ssr:false) |
| Metadata SEO enriquecida (rating + tiempo entrega) | OK (líneas 86-100) |
| og:image dinámica `/api/og?title=...` | OK (línea 116) |
| JSON-LD `ItemList` | Verificado en cierre `2026-05-21` (commit `5a4e6dfe`); no inspeccionado en este audit |
| `React.cache` dedupe getBySlug + reviews | OK (líneas 19-26) |
| `hreflang` + `speakable` | Confirmado en commits `f5042b16`/`5a4e6dfe` |
| `Cache-Control` por defecto | OK (no `force-dynamic`) |

---

## 7. Stripe Connect / split payments

| Pieza | Existe | Enganchada al checkout |
|---|---|---|
| `createConnectedAccount` (Express) | SÍ | NO se llama en `apply/register` |
| Onboarding URL endpoint | SÍ (`/api/stripe-connect/onboard`) | OK con `requireAdmin` |
| Status endpoint | SÍ (`/api/stripe-connect/status`) | OK |
| `createSplitPayment` con `application_fee_amount` + `transfer_data` | SÍ | **NO se llama** desde `marketplace/orders/POST` |
| Modelo `Store.stripeAccountId` | UNK (no inspeccionado este audit) | — |
| Webhook payment_intent.succeeded → settle ledger | UNK | — |

**Conclusión:** infraestructura de Stripe Connect está lista pero el checkout marketplace **no la utiliza**. El flujo actual es: cliente paga manual (Yape proof) → admin aprueba → cron settle marca ledger → payout manual via `payoutSummaryByVendor`. No hay flujo Stripe end-to-end.

---

## 8. Top 10 mejoras críticas (orden ejecutable)

| # | Acción | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | **Eliminar el doble motor de comisión** — `createFromCart` debe invocar `CommissionsDB.recordMarketplaceCommissions` en lugar de escribir directo con `type:"sale"` (P0-1, P0-2) | Cierra divergencia financiera y restaura payoutSummary correcto | M (1 día + tests) |
| 2 | **Crear cron `/api/cron/vendor-reverify`** que itere `VendorApplication.status="tenant_provisioned"`, llame `verifyRuc/verifyDni`, escriba summary + alerts (P0-4) | Habilita 60% de TD-058 (capas 4, 6, 7) | M (1-2 días) |
| 3 | **Fix `CommissionLedger.status="cleared"` → `"settled"`** + migration de filas existentes (P0-6) | Restaura visibility en cron settle + payouts | S (4 h) |
| 4 | **Validar `_pathHash` en `verifyProofToken`** (P0-3) | Cierra reuse de tokens contra distintas capturas | XS (1 h) |
| 5 | **Bloquear `ensureTenant` auto-create** en GET público; mover a job admin (P0-5) | Cierra DoS de tabla Tenant | S (2 h) |
| 6 | **Fix `application_fee_amount` units** en `lib/stripe-connect.ts:84` (P1-1) | Imprescindible antes de cualquier go-live Stripe Connect | XS (30 min) |
| 7 | **Refund de comisiones en `cancelOrderRestoreStock`** — invocar `CommissionsDB.refundCommissionsByOrder` dentro de la tx (P1-3) | Cierra fuga "vendor cancela y aún le cobramos" | S (2 h) |
| 8 | **Invalidar cache de `getVendorDashboard`** tras `recordMarketplaceCommissions` y status changes (P1-6) | Vendor ve sus ventas en tiempo real | XS |
| 9 | **Guard de provider real en prod** — si `NODE_ENV==="production"` y `SUNAT_RUC_PROVIDER === "mock"`, throw en boot (`lib/env.ts`) (P1-8, P2-7) | Cierra bypass total de verificación | XS (30 min) |
| 10 | **Implementar ADR-080** — provisionTenant real con `AdminUser` + `StorePage` + StripeConnect account create + email + Sentry alerta si retry agotado (reemplaza fire-and-forget stub) | Único bloqueante de marketplace público real | L (3-5 días con migration-planner) |

---

## 9. Bloqueadores específicos para go-live marketplace

| Item | Bloqueante |
|---|---|
| Doble motor de comisión (P0-1) | Sí — reclamos vendor |
| `type:"sale"` vs enum (P0-2) | Sí — payouts subreportados |
| `cleared` vs `settled` (P0-6) | Sí — settle cron rompe |
| Cron vendor-reverify (P0-4) | Sí — TD-058 incompleto en prod |
| ADR-080 stub | Sí — vendors aprobados sin tenant real |
| Stripe Connect units (P1-1) | Sí — antes de cobrar real |
| proofToken pathHash (P0-3) | Alta — exploit conocido |

---

## 10. Métricas y observabilidad recomendadas

| Métrica | Fuente | Por qué |
|---|---|---|
| `commission_engine_divergence_pct` | diff entre `store.commission` y `CommissionsDB.computeVendorTier` por orden | mide P0-1 |
| `ledger_status_outliers_count` | count rows con status NOT IN (pending,settled,paid,refunded) | detecta P0-6 retroactivos |
| `vendor_reverify_cron_last_run_age_hours` | métrica desde dashboard | alerta >36h |
| `tenant_autocreated_count` | rows Tenant creados desde GET público | mide P0-5 |
| `stripe_connect_split_payment_count` | conteo de PaymentIntents con `transfer_data` | gauge progreso integración |
| `proofToken_pathhash_mismatch_count` | nuevo log key tras fix | confirma cierre P0-3 |

---

## 11. Conclusión

El marketplace **funciona** para el flujo Yape proof + admin manual + settle cron, pero tiene **3 P0 financieros** vivos que distorsionan la contabilidad de comisiones y **1 P0 de seguridad** (proofToken) explotable por un atacante con conocimiento interno. La infra Stripe Connect existe pero está dormida; el cron de re-verify vendor está documentado pero nunca se materializó como endpoint en `app/api/cron/`.

Si Brandon planea abrir el marketplace a vendors externos antes del 2026-06-12 (fin de trial de los 4 clientes confirmados, ver memoria `project_4_clientes_free_trial`), el orden mínimo de fixes es: **#1 → #3 → #6 → #2 → #10**. Sin esos 5, cualquier auditoría externa o reclamo legal de un vendor escala rápido.

**Archivos clave para próximas sesiones:**
- `/home/usuario/proyectos/Mercado/lib/db/marketplace/orders.db.ts` (líneas 234, 380-392, 863-867)
- `/home/usuario/proyectos/Mercado/lib/db/commissions.db.ts` (líneas 200-242, 264-280)
- `/home/usuario/proyectos/Mercado/lib/stripe-connect.ts` (línea 84)
- `/home/usuario/proyectos/Mercado/app/api/marketplace/checkout/payment-proof/route.ts` (líneas 96-122)
- `/home/usuario/proyectos/Mercado/app/api/cron/` (crear `vendor-reverify/route.ts`)
- `/home/usuario/proyectos/Mercado/lib/db/vendor-applications.db.ts` (líneas 371-385 — reemplazar stub)
