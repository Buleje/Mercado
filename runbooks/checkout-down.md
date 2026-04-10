# Runbook: Checkout Down

## Detección
- **Patrón Sentry:** `transaction:"/api/checkout/*" AND http.status_code:5xx` spike >5 en 5 min
- **Severidad:** P0 — Pérdida directa de ingresos
- **SLO afectado:** `checkout_success_rate` (target 99.5%)
- **MTTR objetivo:** <15 minutos

## Diagnóstico
```bash
# 1. Verificar si el endpoint responde
curl -s -w "%{http_code} %{time_total}s" https://mercado.vercel.app/api/checkout/confirm

# 2. Verificar logs de Vercel
vercel logs --output json --limit 50 2>/dev/null | grep -i "checkout\|500\|error"

# 3. Verificar DB connections
# Si DIRECT_URL disponible:
psql "$DIRECT_URL" -c "SELECT count(*) FROM pg_stat_activity WHERE state='active';"

# 4. Verificar Stripe webhook status
curl -s https://mercado.vercel.app/api/health | grep -i stripe
```

## Mitigación inmediata
```bash
# 1. Si es problema de Stripe → activar flag de bypass Stripe
# /flag checkout_stripe_bypass on

# 2. Si es problema de DB → verificar pooler
# vercel env ls | grep DATABASE_URL

# 3. Si es timeout → escalar timeout en vercel.json
# Verificar si hay queries lentas bloqueando

# 4. Rollback si el último deploy causó el problema
# vercel rollback
```

## Resolución
1. Identificar root cause en logs de Sentry/Vercel
2. Si es código → branch fix, test, deploy con canary
3. Si es infra → contactar Supabase/Vercel support
4. Post-mortem obligatorio en `logs/runbooks/`

## Prevención
- Eval harness checkout (10 evals) debe correr pre-deploy
- Canary deploy obligatorio para cambios en checkout
- ADR si se cambia arquitectura de pagos

## Owner
- **Principal:** checkout-specialist
- **Fallback:** backend-platform-engineer
- **Escalación:** Brandon (WhatsApp)
