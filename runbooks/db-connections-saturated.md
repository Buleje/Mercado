# Runbook: DB Connections Saturated

## Detección
- **Patrón Sentry:** `PrismaClientKnownRequestError` AND `connection pool timeout` spike
- **Severidad:** P0 — Toda la app se degrada
- **SLO afectado:** `api_p99_latency` (target <500ms)
- **MTTR objetivo:** <10 minutos

## Diagnóstico
```bash
# 1. Verificar conexiones activas
psql "$DIRECT_URL" -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"
# Esperado: active < 20, idle < 50

# 2. Verificar queries lentas (>5s)
psql "$DIRECT_URL" -c "SELECT pid, now()-query_start AS duration, query FROM pg_stat_activity WHERE state='active' AND now()-query_start > interval '5 seconds' ORDER BY duration DESC LIMIT 5;"

# 3. Verificar si hay locks
psql "$DIRECT_URL" -c "SELECT blocked_locks.pid AS blocked_pid, blocking_locks.pid AS blocking_pid FROM pg_locks blocked_locks JOIN pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype WHERE NOT blocked_locks.granted LIMIT 5;"

# 4. Vercel function concurrency
vercel logs --output json --limit 20 | grep -i "timeout\|ETIMEDOUT"
```

## Mitigación inmediata
```bash
# 1. Matar queries lentas (>30s)
psql "$DIRECT_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='active' AND now()-query_start > interval '30 seconds' AND pid <> pg_backend_pid();"

# 2. Si hay locks → matar proceso bloqueante
# psql "$DIRECT_URL" -c "SELECT pg_terminate_backend(blocking_pid);"

# 3. Verificar que el pool se recupera
sleep 10
curl -s -w "%{http_code}" https://mercado.vercel.app/api/health
```

## Resolución
1. Identificar query problemática (N+1, missing index, full table scan)
2. Agregar índice o optimizar query
3. Si es concurrencia → revisar connection pool size en DATABASE_URL
4. Si es Supabase → verificar plan y límites

## Prevención
- Database-engineer debe auditar queries lentas semanalmente
- Índices documentados en ADRs
- Connection pool size en monitoring

## Owner
- **Principal:** database-engineer
- **Fallback:** backend-platform-engineer
- **Escalación:** Brandon (WhatsApp)
