# Runbook: Stripe Webhook Failing

## Detección
- **Patrón Sentry:** `StripeSignatureVerificationError` OR webhook endpoint returning 5xx
- **Stripe Dashboard:** Webhook failures >5% en últimas 2 horas
- **Severidad:** P1 — Pagos procesados pero no confirmados en la app
- **SLO afectado:** `checkout_success_rate` (target 99.5%)
- **MTTR objetivo:** <20 minutos

## Diagnóstico
```bash
# 1. Verificar si el webhook endpoint responde
curl -s -w "%{http_code}" -X POST https://mercado.vercel.app/api/webhooks/stripe

# 2. Verificar STRIPE_WEBHOOK_SECRET está configurado
# vercel env ls | grep STRIPE_WEBHOOK

# 3. Verificar logs del endpoint
vercel logs --output json --limit 30 | grep -i "webhook\|stripe\|signature"

# 4. Verificar Stripe Dashboard
# https://dashboard.stripe.com/webhooks
# Ver: últimos intentos, response codes, payload
```

## Mitigación inmediata
```bash
# 1. Los pagos de Stripe están PROCESADOS (el dinero llegó)
# Solo falta actualizar el estado en nuestra DB

# 2. Si es signature verification:
# Verificar que STRIPE_WEBHOOK_SECRET no rotó sin actualizar env
# vercel env pull (actualizar)

# 3. Si es timeout del endpoint:
# Verificar que el handler es rápido (no queries lentas)

# 4. Stripe reintenta automáticamente hasta 3 días
# No hay pérdida de datos, solo delay en confirmación
```

## Resolución
1. Si rotaron el webhook secret → actualizar en Vercel env vars
2. Si el endpoint está lento → optimizar handler (fire-and-forget para audit)
3. Si cambió la firma → verificar versión de stripe SDK
4. Reconciliación manual: comparar pagos en Stripe vs órdenes en DB

## Prevención
- Webhook secret en Vercel env vars (nunca hardcoded)
- Handler webhook < 5s de ejecución
- Fire-and-forget para tareas secundarias (logs, notificaciones)
- Script de reconciliación semanal: Stripe charges vs DB orders

## Owner
- **Principal:** integration-specialist
- **Fallback:** backend-platform-engineer
- **Escalación:** Brandon (WhatsApp)
