# Runbook: Redis Down

## Detección
- **Patrón Sentry:** `ECONNREFUSED` OR `Redis connection timeout` in `lib/cache`
- **Severidad:** P1 — Cache miss = DB sobrecargada, rate limiting inactivo
- **SLO afectado:** `api_p99_latency` (target <500ms)
- **MTTR objetivo:** <15 minutos

## Diagnóstico
```bash
# 1. Verificar si Upstash Redis responde
curl -s "$UPSTASH_REDIS_REST_URL/ping" -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" || echo "Redis no responde"

# 2. Verificar latencia de la app sin cache
curl -s -w "%{time_total}s" https://mercado.vercel.app/api/products?limit=10

# 3. Verificar si rate limiting está funcionando
# Sin Redis, applyRateLimit() debería tener fallback permisivo

# 4. Verificar status de Upstash
# https://status.upstash.com/
```

## Mitigación inmediata
```bash
# 1. La app DEBE funcionar sin Redis (graceful degradation)
# Cache miss → va directo a DB (más lento pero funciona)
# Rate limit → fallback permisivo (acepta todo)

# 2. Verificar que el fallback está activo
curl -s -w "%{http_code}" https://mercado.vercel.app/api/health

# 3. Si la DB se sobrecarga por cache miss masivo
# Activar modo lectura-pesada: solo queries esenciales
```

## Resolución
1. Si es Upstash → verificar plan y status page
2. Si es config → verificar UPSTASH_REDIS_REST_URL en env vars
3. Si es red → verificar DNS y conectividad
4. Cuando Redis vuelva → cache se repopula automáticamente (no requiere acción)

## Prevención
- Cache siempre con fallback a DB (nunca throw en cache miss)
- Rate limiting con fallback permisivo
- Health check incluye Redis status
- Alertas de latencia >2x baseline

## Owner
- **Principal:** database-engineer
- **Fallback:** performance-engineer
- **Escalación:** Brandon (WhatsApp)
