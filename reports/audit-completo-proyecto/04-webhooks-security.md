# Audit Webhooks + Integraciones Externas — 2026-05-17

**Alcance:** `app/api/webhooks/**`, `app/api/billing/webhook*/**`, `app/api/whatsapp/**`, `lib/whatsapp/**`, `lib/billing/**`, `lib/queue/**`, `lib/{stripe,mercadopago}.ts`

**Riesgo general:** 🟢 Verde con 2 P0 Alto (rate-limit ausente) y 5 medios.

## Resumen ejecutivo

Webhooks defensivamente bien hechos: firma HMAC en los 4 endpoints (Stripe, MP, Meta legacy, Meta concierge), `timingSafeEqual`, fail-closed sin secret en prod, anti-replay (Stripe 1h + MP 5min). Idempotencia atómica con `P2002` en `stripeWebhookQueue`. SSRF mitigado con allowlist de hosts (Twilio + Meta CDN) y `redirect:"error"`. Prompt injection: `processSafeInput` + `messages[]` separado (no string interpolation).

Únicos endpoints **sin rate-limit son el webhook de Stripe** y el legacy `/api/webhooks/whatsapp` — vector de DoS billing-related.

## Hallazgos

| ID | Sev | Archivo:Línea | Categoría | Issue |
|---|---|---|---|---|
| **P0-W1** | Alto | `app/api/billing/webhook/route.ts:17` | DoS / cost | **Sin `applyRateLimit`** en webhook Stripe. POST 1000 req/s sin firma válida — cada uno consume Prisma `create` + HMAC. Stripe paga retries, vos pagás compute. |
| **P0-W2** | Alto | `app/api/webhooks/whatsapp/route.ts:25-74` | Surface attack | Endpoint **legacy** que duplica `/api/whatsapp/webhook`. Tiene firma HMAC pero **sin rate-limit** y mantiene router keyword paralelo que puede divergir. Marcar deprecated (410) o eliminar. |
| **P1-W3** | Medio | `app/api/billing/mp-webhook/route.ts:163,299,467` | PII leak | `logger.info` con `tenantSlug` + `dataId` (MP payment ID) sin redactar. Ley 29733 PE — correlaciona con monto y email en panel MP. Aplicar `phone.slice(-6)` patrón. |
| **P1-W4** | Medio | `app/api/whatsapp/webhook/route.ts:174` | Misconfig | Si `WHATSAPP_APP_SECRET` falta en dev, acepta cualquier POST. No validado en `lib/env.ts` REQUIRED. Agregar con `productionOnly:true`. |
| **P1-W5** | Medio | `lib/stripe.ts:10` | Fallback peligroso | `STRIPE_SECRET_KEY ?? "sk_test_placeholder"`. En prod sin var, APIs lanzan auth errors silenciosos en runtime vs fail-fast en startup. Eliminar fallback. |
| **P2-W6** | Bajo | `app/api/billing/mp-webhook/route.ts:363` | Fallback peligroso | `Bearer ${MERCADOPAGO_ACCESS_TOKEN ?? ""}` — manda `Bearer ` vacío si falta. Throw o 503. |
| **P2-W7** | Bajo | `lib/mercadopago.ts:187` | Estilo | `require("crypto")` con eslint-disable. Migrar a import estático. |
| **P2-W8** | Bajo | `package.json` deps | OWASP A06 | `npm audit`: 11 vulns (0 critical/high, 5 moderate, 6 low). Todas dev/build, no runtime prod. `npm update postcss next prisma`. |
| **P3-W9** | Info | `app/api/whatsapp/concierge/route.ts:281` | Hardening | Fallback `effectiveTenantId ?? "main"` — el `webhook/route.ts` ya lo corrigió pero concierge sigue. Meta con phone_number_id no registrado atribuye a `main`. |

## Lo que SÍ está blindado (validado)

| Control | Evidencia |
|---|---|
| Firma Stripe | `lib/stripe.ts:107` constructEvent oficial |
| Firma MP + anti-replay 5min | `lib/mercadopago.ts:171-201` timingSafeEqual |
| Firma Meta + timing-safe | webhook + concierge HMAC-SHA256 |
| Firma Twilio HMAC-SHA1 | yape-capture:303-340 URL+sortedParams |
| Idempotencia atómica Stripe/MP | UNIQUE constraint → P2002 = duplicate |
| Anti-replay Stripe 1h | event.created vs Date.now |
| Cross-tenant claim Stripe | valida stripeCustomerId match |
| SSRF allowlist | Twilio + Meta CDN sets, redirect:"error" |
| Magic bytes validation | JPEG/PNG signature antes de Vision |
| Cap defensivo Yape S/5000 | evita approvals corruptos |
| AI cost guard | aiCostGuard.canSpend antes de LLM |
| Prompt injection mitigation | messages[] separados + processSafeInput |
| Tool-call sin auto-mutation | concierge usa fetch(/api/orders) con checks propios |
| Test endpoint prod-disabled | hard NODE_ENV check |
| HARD-FAIL AUTH_SECRET | lib/env.ts throw si falta |

## Acciones inmediatas

1. `applyRateLimit(req, "STRICT", "stripe-webhook")` + `whatsapp-legacy` — 10 min
2. Decisión `/api/webhooks/whatsapp` legacy: eliminar o 410 — 5 min + Meta dashboard
3. Redactar PII en `mp-webhook` logs (helper slice) — 15 min
4. `npm update postcss next prisma` — cerrar 5 moderate
