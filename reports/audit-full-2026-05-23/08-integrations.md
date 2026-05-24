# Auditoría de Integraciones Externas — Buleje
**Fecha:** 2026-05-23 | **Auditor:** Integration Specialist | **Rama:** prod

---

## Resumen ejecutivo

| Severidad | Cantidad |
|-----------|----------|
| P0 (bloqueante producción) | 3 |
| P1 (riesgo alto, corregir esta semana) | 4 |
| P2 (mejora importante, próximo sprint) | 5 |

---

## Tabla maestra de integraciones

| # | Integración | Archivo principal | Circuit Breaker | Retry | Error sin romper UX | Logging estructurado | Fallback | Webhook verify |
|---|-------------|-------------------|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Stripe** | `lib/stripe.ts` + `app/api/billing/webhook/route.ts` | No | Si (StripeWebhookQueue + cron replay) | Si | Si (`logger.*`) | Si (enqueue + 200 a Stripe) | **Si** (HMAC `constructWebhookEvent` + freshness 5min + rate-limit STRICT) |
| 2 | **Mercado Pago** | `lib/mercadopago.ts` + `app/api/billing/mp-webhook/route.ts` | No | No (directo, sin cron dedicado para pagos simples) | Si (200 en errores) | Si | Parcial (lock idempotencia pero sin dead-letter queue) | **Si** (HMAC `verifyMPWebhookSignature` + freshness 5min) |
| 3 | **WhatsApp (notificaciones)** | `lib/whatsapp.ts` | **Si** (`whatsappBreaker` via `getBreaker`) | Si (3 intentos, backoff 2s×attempt) | Si (fire-and-forget) | Si | Si (BullMQ queue → directo) | — (salida, no entrante) |
| 4 | **WhatsApp (webhook entrante)** | `app/api/webhooks/whatsapp/route.ts` | No | — | Si | Si | No (503 si falta token) | **Si** (X-Hub-Signature-256 HMAC + rate-limit STRICT) |
| 5 | **Resend (email)** | `lib/email/resend.ts` | No | No | Si (`.catch(() => {})`) | Parcial (solo en `sendWelcomeTenant`) | Si (noopClient si falta KEY) | — |
| 6 | **Web Push (VAPID)** | `lib/notifications/web-push.ts` | No | No | Si (`.catch(() => {})`) | No | Si (silencio si falta VAPID) | — |
| 7 | **SUNAT / Nubefact** | `lib/integrations/sunat.ts` + `lib/sunat/nubefact-client.ts` | No | **Si** (3 intentos exponential en nubefact-client + cron sunat-retry) | Si (retorna `status: "retrying"`) | Si | Si (estado "retrying" + cron) | **Si** (token por tenant) |
| 8 | **RENIEC** | `lib/integrations/reniec.ts` | No | No | **Parcial** (soft-pass en fallo) | Si (`logger.warn`) | **Si** (soft-pass + manual superadmin) | — |
| 9 | **Supabase (conexión DB)** | `lib/supabase/server.ts` + `lib/supabase/client.ts` | No (a nivel cliente) | Si (Prisma + pgBouncer) | — (infra) | Parcial | No (fail-fast si falta URL/KEY) | — |
| 10 | **Sentry** | `lib/sentry-alerts.ts` | — | — (SDK propio) | Si (SDK nunca lanza) | Si (nivel fatal, tags, extra) | Si (SDK buffer local) | — |
| 11 | **PostHog** | `lib/analytics/posthog.ts` | — | — (SDK propio) | Si (noopClient + try/catch) | Si | Si (noopClient si falta KEY) | — |
| 12 | **Upstash Redis** | `lib/rate-limit.ts` | No | No | Si (fallback a Map in-memory) | Si (logger.error en prod) | **Si** (Map in-memory automático) | — |
| 13 | **AI providers** | `lib/claude-router.ts` + `lib/ai/circuit-breaker.ts` | **Si** (por tokens/tenant) | No (a nivel router) | Parcial | Si | No (no hay fallback provider) | — |

---

## Hallazgos por severidad

### P0 — Bloqueantes

| ID | Integración | Hallazgo | Impacto |
|----|-------------|----------|---------|
| P0-INT-01 | **Mercado Pago** | `createMPSubscription`, `cancelMPSubscription`, `getMPSubscriptionStatus` usan `fetch` directo sin timeout ni circuit breaker. Si MP API se demora >30s, el serverless expira con 504 sin cleanup. | Usuario pierde checkout; sin retry; sin alerta. |
| P0-INT-02 | **Resend** | `sendOrderConfirmation` y `sendFiadoReminder` no tienen retry. Si Resend devuelve 429 o 5xx el email se pierde silenciosamente sin registro en DB ni alerta Sentry. | Pérdida silenciosa de emails transaccionales críticos. |
| P0-INT-03 | **AI providers** | `lib/ai/circuit-breaker.ts` cubre gasto por tokens/tenant pero NO cubre fallos de red del provider. Si Anthropic/OpenAI cae, cada llamada AI espera hasta timeout sin proteger el response del usuario. | Cascading failures en WhatsApp concierge, descripciones, recomendaciones. |

### P1 — Riesgo alto

| ID | Integración | Hallazgo | Impacto |
|----|-------------|----------|---------|
| P1-INT-01 | **Web Push** | Sin retry, sin logging de errores (catch silencioso), no purga subs expiradas (HTTP 410). Subs muertas se acumulan en DB indefinidamente. | Notificaciones perdidas; DB crece con suscripciones inválidas. |
| P1-INT-02 | **RENIEC** | `verifyDni` hace soft-pass (`ok: true`) si el provider externo falla. Cualquier DNI de 8 dígitos pasa aunque RENIEC esté caído. Viola el objetivo de TD-058. | Vendedores con identidad no verificada en onboarding. |
| P1-INT-03 | **SUNAT** | `consultarEstado` llama `SunatDB.listInvoices(tenantId, { limit: 200 })` dos veces para buscar por serie+número. Sin índice específico es O(N) sobre todos los comprobantes del tenant. | Latencia alta en admin de facturación bajo volumen. |
| P1-INT-04 | **WhatsApp webhook** | Respuestas hardcodeadas a `https://buleje.pe/tienda` ignorando el tenantId del mensaje entrante. En multi-tenant, todo mensaje apunta al tenant raíz. | Respuesta incorrecta para vendors/tenants distintos a main. |

### P2 — Mejoras importantes

| ID | Integración | Hallazgo | Impacto |
|----|-------------|----------|---------|
| P2-INT-01 | **Stripe** | `constructWebhookEvent` usa `?? ""` si falta `STRIPE_WEBHOOK_SECRET`. HMAC calculado con string vacío acepta cualquier cuerpo. `lib/env.ts` debería exigir esta var. | Riesgo de aceptar webhooks falsos si la var no está seteada. |
| P2-INT-02 | **Mercado Pago** | No existe cron de retry para pagos MP simples fallidos (solo existe replay de suscripciones). Pagos aprobados con error en `processMPPaymentApproved` no se reintentan. | Plan no activado sin intervención manual. |
| P2-INT-03 | **Resend** | Cast `as unknown as EmailClient` ciega a TypeScript. Si Resend cambia su API, el build no falla. | Ruptura silenciosa en producción por actualización de SDK. |
| P2-INT-04 | **Supabase** | `pgbouncer=true&connection_limit=1` no se valida en startup. Si alguien cambia `DATABASE_URL` sin el parámetro, Prisma abre N conexiones por instancia. | Agotamiento de pool en Supabase bajo carga de Vercel auto-scaling. |
| P2-INT-05 | **AI router** | Model IDs hardcodeados (`claude-haiku-4-5-20251001`, etc.) sin env var override. Al deprecar un modelo, todas las rutas AI fallan sin cambio de código. | Falla total de features AI en deprecación de modelos. |

---

## Top 10 endurecimientos sugeridos

| Prioridad | Acción | Archivos | Estimado |
|-----------|--------|----------|----------|
| 1 | Agregar `AbortController` timeout 8s + `getBreaker("mercadopago")` en todos los `fetch` directos de MP (`createMPSubscription`, `cancelMPSubscription`, `getMPSubscriptionStatus`) | `lib/mercadopago.ts` | 1h |
| 2 | Crear `lib/email/send-with-retry.ts`: wrapper sobre `resend.emails.send` con 3 reintentos exponential + `logger.error` + `reportCriticalError` a Sentry si los 3 fallan | `lib/email/resend.ts`, nuevo archivo | 2h |
| 3 | Wrappear llamadas AI en `lib/ai/` con `getBreaker("anthropic")` y `getBreaker("openai")`; retornar respuesta cached o error descriptivo cuando el circuito está abierto | `lib/ai/*.ts`, nuevo `lib/ai/providers.ts` | 3h |
| 4 | Cambiar `verifyDni` soft-pass a hard-fail controlado: si el provider cae, retornar `{ ok: false, source: "provider_unavailable" }` y que el caller encole verificación en BullMQ | `lib/integrations/reniec.ts`, ruta onboarding | 2h |
| 5 | En `sendPushNotification`: capturar HTTP 410 (suscripción expirada) y marcar sub como inactiva en DB; agregar `logger.warn` para todos los fallos | `lib/notifications/web-push.ts` | 1h |
| 6 | Agregar `STRIPE_WEBHOOK_SECRET` (formato `whsec_`) a vars críticas en `lib/env.ts` con fail-fast en startup | `lib/env.ts` | 30min |
| 7 | Crear cron `mp-payment-retry` equivalente al `webhook-replay` de Stripe: reintentar filas `StripeWebhookQueue` con prefijo `mp_` sin `processedAt` y mayores a 5min | `app/api/cron/mp-payment-retry/route.ts` | 2h |
| 8 | Reemplazar doble `listInvoices(200)` en `consultarEstado` por query directa `SunatDB.findBySerieNumero(tenantId, serie, numero)` con índice compuesto `(tenantId, series, number)` | `lib/integrations/sunat.ts`, `lib/db/sunat.db.ts` | 1h |
| 9 | En webhook WhatsApp legacy: resolver `tenantId` desde el número destino del mensaje (campo `to` del body de Meta) para construir URLs correctas por tenant | `app/api/webhooks/whatsapp/route.ts` | 2h |
| 10 | Externalizar model IDs de `claude-router.ts` a env vars con defaults (`ANTHROPIC_HAIKU_MODEL`, etc.); detectar HTTP 404 del provider y `reportCriticalError` | `lib/claude-router.ts` | 1h |

---

## Estado de mecanismos de resiliencia

| Mecanismo | Implementado | Usado en | Ausente en |
|-----------|:---:|----------|------------|
| Circuit Breaker (`lib/circuit-breaker/`) | Si | WhatsApp notificaciones, AI orchestrator, AI cost control | SUNAT, RENIEC, Resend, MP, Web Push, AI providers directo |
| Retry con backoff | Si | Stripe (cron replay), SUNAT (nubefact-client 3x + cron), WhatsApp (3x) | Resend, Web Push, MP Preapproval fetch |
| Idempotency key | Si | Stripe (UNIQUE stripeId), MP (UNIQUE mp_dataId), SUNAT (orderId) | Email, WhatsApp notificaciones |
| Dead-letter queue | Si | Stripe (StripeWebhookQueue + Sentry a 6 intentos) | MP pagos simples, SUNAT (solo "retrying" en DB) |
| Rate limit distribuido (Upstash) | Si | Stripe webhook, MP webhook, WhatsApp webhook, SUNAT (10/min/tenant) | RENIEC, Resend, Web Push |
| Firma de webhook | Si | Stripe (HMAC), MP (HMAC + freshness 5min), WhatsApp (X-Hub-Signature-256) | Nubefact (token por tenant, no HMAC de firma) |
| Fail-fast en startup | Si | `lib/env.ts` valida vars críticas | `STRIPE_WEBHOOK_SECRET` no está en lista (P2-INT-01) |

---

*Solo lectura — sin modificaciones al codebase. Generado: 2026-05-23.*
