# Endpoints públicos sin autenticación

> **Última verificación:** 2026-05-05
> **Audiencia:** dev, security-review
> **Regla:** todo endpoint listado aquí debe tener al menos UNA mitigación
> activa (rate-limit, signature HMAC, token opaco firmado, captcha o
> shared secret) y un riesgo residual aceptado por escrito.

Cualquier endpoint nuevo en `app/api/**/route.ts` que **no** invoque
`requireAdmin / requireCustomer / requirePartner / requirePlatformAPI`
DEBE ser agregado a esta tabla en el mismo PR. El hook
`.claude/hooks/danger-zone-detect` falla el commit si detecta un nuevo
route.ts sin auth y sin entrada aquí.

---

## 1. Webhooks de proveedores externos

| Path | Método | Justificación | Mitigación | Riesgo residual |
|---|---|---|---|---|
| `/api/whatsapp/webhook` | POST, GET | Twilio/Meta entrega mensajes sin sesión | Validación HMAC `x-twilio-signature`; rate-limit por número origen | Si la firma se filtra, atacante puede inyectar mensajes sintéticos. Mitigación parcial: el conversation engine resuelve `tenantId` por `from` y rechaza si no existe |
| `/api/whatsapp/yape-capture` | POST | Subset del webhook anterior, ruta dedicada para fotos | Idem + UUID en path de storage (ADR-094) | Idem; además el pipeline de IA Vision puede ser cebado con imágenes adversariales (DoS de tokens) → mitigación: rate-limit por `MessageSid` |
| `/api/billing/webhook` | POST | Stripe entrega eventos sin sesión | `constructWebhookEvent` valida `Stripe-Signature` con secret; idempotencia atómica vía `event.id` (ADR-092) | Si `STRIPE_WEBHOOK_SECRET` se filtra, atacante puede activar planes. Detectable por `events.list` mismatch en reconciliación diaria |
| `/api/billing/mp-webhook` | POST | Mercado Pago IPN | `verifyMPWebhookSignature` (HMAC), anti-replay con `ts` <5min, fail-closed si falta secret, idempotencia ADR-092 | Si MP cambia formato de firma sin avisar, fail-closed cae en 503. Aceptable |

## 2. Endpoints firmados con token opaco

| Path | Método | Justificación | Mitigación | Riesgo residual |
|---|---|---|---|---|
| `/api/orders/[id]/tracking?token=...` | GET | Cliente recibe link por SMS/WhatsApp sin necesitar cuenta | `token` = HMAC-SHA256 de `(orderId, tenantId, expiresAt)` con secret; expira en 30 días; sólo lectura | Si el cliente reenvía el link, el destinatario ve la orden completa. Aceptado como UX requirement |
| `/api/delivery/tip/[orderId]` | POST | Cliente puede dar tip sin login | Token firmado en query (igual al anterior); rate-limit por `orderId`; monto validado contra `Order.total` | Replay attack del mismo token: aceptable porque el endpoint es idempotente por `orderId` (sólo se acepta el último tip) |
| `/api/delivery/rate` | POST | Cliente califica al delivery sin login | Token firmado por order; rate-limit por IP; sólo permite 1 rating por orden | Token leak permite calificar 1 vez. Bajo impacto |

## 3. Catálogo público (lectura)

| Path | Método | Justificación | Mitigación | Riesgo residual |
|---|---|---|---|---|
| `/api/products` (GET) | GET | Storefront público necesita listar productos | Rate-limit por IP; sólo retorna `tenantId` derivado del `Host` o slug; no expone costos ni stock interno | Scraping del catálogo. Aceptado: catálogo es público por diseño |
| `/api/product-search` | GET | Búsqueda en storefront | Idem | Idem |
| `/api/marketplace/catalog`, `marketplace/autocomplete`, `marketplace/featured-near-me`, `marketplace/top-today`, `marketplace/deals`, `marketplace/promo-banners`, `marketplace/live-stats`, `marketplace/ubigeo`, `marketplace/reverse-geocode`, `marketplace/compare`, `marketplace/customer-tier` | GET | Catálogo cross-store y datos agregados de marketplace | Rate-limit; sin secrets ni datos personales en payload | Scraping competitivo |
| `/api/products/share`, `products/co-purchased`, `products/ratings`, `products/stock-check` | GET | PDP pública | Rate-limit; `stock-check` retorna sólo `availability` (boolean), nunca cantidades | — |

## 4. AI / herramientas conversacionales (storefront público)

| Path | Método | Justificación | Mitigación | Riesgo residual |
|---|---|---|---|---|
| `/api/chat`, `/api/buleje-assistant`, `/api/chef-ia`, `/api/voice-order`, `/api/fridge-scan`, `/api/recommendations`, `/api/presupuesto`, `/api/price-comparison` | POST | Asistentes IA accesibles sin cuenta para conversión | Rate-limit estricto por IP (10 req/min); cap de tokens por request; circuit breaker `lib/circuit-breaker.ts`; budget de costo diario por tenant | DoS económico (token burn). Mitigado por daily budget + Sentry alert cuando se aproxima al cap |

## 5. Onboarding / capture de leads

| Path | Método | Justificación | Mitigación | Riesgo residual |
|---|---|---|---|---|
| `/api/onboarding` | POST | Crear tenant nuevo desde landing | Rate-limit por IP (3/h); validación Zod estricta; reCAPTCHA v3 en frontend (score >0.5) | Spam de tenants vacíos. Cron `cleanup-empty-tenants` los purga |
| `/api/contact`, `/api/newsletter`, `/api/invite`, `/api/referrals` | POST | Forms de marketing | Rate-limit + reCAPTCHA | Spam de emails |
| `/api/beta-feedback` | POST | Feedback anónimo en beta | Rate-limit; truncar a 5KB | — |
| `/api/visitor-welcome`, `/api/abandoned-cart` (read-only) | GET | Mensajes de welcome basados en cookies | Rate-limit; no expone PII | — |

## 6. Supplier / B2B (auth propia)

| Path | Método | Justificación | Mitigación | Riesgo residual |
|---|---|---|---|---|
| `/api/supplier/auth` | POST | Login del portal supplier | bcrypt + rate-limit (5 intentos / 15 min); lockout temporal | Credential stuffing — mitigado por lockout |
| `/api/supplier/register` | POST | Onboarding de proveedor | reCAPTCHA + email verification antes de acceso a rutas protegidas | Spam de registros |
| `/api/supplier/catalog`, `supplier/offers`, `supplier/alerts`, `supplier/dashboard`, `supplier/orders`, `supplier/rating` | varios | Endpoints del portal supplier | Cookie de sesión propia (`supplier-session`) verificada en `lib/auth/supplier-auth.ts`; los endpoints LISTADOS aquí están en transición — algunos aún sin guard | **PRIORIDAD ALTA — PR #pending**: completar `requireSupplier` en todos antes de release |

## 7. Infraestructura

| Path | Método | Justificación | Mitigación | Riesgo residual |
|---|---|---|---|---|
| `/api/health` | GET | Liveness/readiness para LB y UptimeRobot | Sin secrets ni datos en payload; sólo `{ ok: true, ts }` | Probe enumeration — irrelevante |
| `/api/cron/*` (10 endpoints) | GET, POST | Vercel Cron / GitHub Actions | Header `Authorization: Bearer ${CRON_SECRET}` validado en cada handler; fail-closed si falta | Si `CRON_SECRET` se filtra, atacante puede disparar jobs (cobros, notificaciones). Rotar trimestralmente |
| `/api/notifications/subscribe` | POST | Web Push subscription | Rate-limit por IP; sólo guarda subscription, no envía | Spam de subscriptions sin uso. Cron purga las que fallan 5 veces |
| `/api/api-keys` | GET, POST | Gestión de API keys de tenant | **NO PÚBLICO REAL** — falta `requireAdmin`. PR #pending P0 | IDOR/escalación |
| `/api/platform-brand` | GET | Branding white-label público | Sólo lee `PlatformBrand` (sin secrets) | — |
| `/api/reniec/lookup` | POST | DNI/RUC lookup oficial | Rate-limit estricto (10/h por IP); requiere `tenantId` válido en payload | Costo por request → mitigado por rate-limit y daily budget |

## 8. Marketplace (lectura/feedback)

| Path | Método | Justificación | Mitigación | Riesgo residual |
|---|---|---|---|---|
| `/api/marketplace/reviews` | GET, POST | Listar/crear reviews | GET: público; POST: requiere `customerToken` o reCAPTCHA + email verify | Reviews fake — modelo de revisión + flag en admin |
| `/api/marketplace/payment-proof` | POST | Cliente sube comprobante de Yape | Rate-limit + ADR-094 (UUID storage); validación de tamaño <5MB | Upload abuse — mitigado por size + rate-limit |
| `/api/marketplace/notifications`, `marketplace/activity-feed`, `marketplace/dashboard`, `marketplace/referral` | GET | Datos públicos de marketplace | Rate-limit | — |

## 9. Coupons / loyalty públicos

| Path | Método | Justificación | Mitigación | Riesgo residual |
|---|---|---|---|---|
| `/api/gift-cards/validate` | POST | Validar gift card al checkout | HMAC del code (ADR-077); rate-limit (10/min por IP) | Brute force de codes — mitigado por HMAC + rate-limit |
| `/api/gift-cards/purchase` | POST | Comprar gift card | Rate-limit; el cobro real va por checkout estándar | — |
| `/api/birthday-coupons`, `/api/customer-preferences`, `/api/shopping-lists`, `/api/shopping-feed`, `/api/stock-alerts`, `/api/reorder-alerts`, `/api/daily-digest`, `/api/email-automation` | varios | Lecturas/escrituras del customer | **MIXTO — algunos requieren `customerToken`, otros aún no.** Audit pendiente | IDOR sobre `customerId` si falta guard |

---

## Cómo agregar un endpoint público nuevo

1. Documentar en este archivo en la sección que corresponda.
2. Agregar mitigación obligatoria: rate-limit (`applyRateLimit`) o
   signature HMAC.
3. Si maneja PII: aplicar ADR-094 (signed URL).
4. Si dispara efectos económicos: aplicar ADR-092 (idempotencia).
5. PR review por security-review obligatoria.
