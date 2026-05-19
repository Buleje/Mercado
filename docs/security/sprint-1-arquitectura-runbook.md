# Sprint 1 Arquitectura — Runbook acción manual

> **Brandon 2026-05-18**. Lo que se puede hacer en código YA está commiteado
> (crons staggered). Los 2 ítems abajo requieren config externa en dashboards.

## ✅ 1. REDIS_URL — Upstash (1h, $0/mes gratis tier)

**Por qué**: el código tiene `MemoryStore` + `RedisStore` con fallback. Sin
`REDIS_URL` en producción, **cada instancia warm de Vercel Fluid Compute
tiene su propia copia del cache** — `invalidate("key")` solo limpia 1
instancia. Resultado: stock viejo, precios viejos, sesiones inconsistentes
cuando hay 2+ instancias activas.

### Pasos

1. Ir a https://console.upstash.com → Sign up (gratis con GitHub)
2. **Create Database**:
   - Name: `buleje-prod-cache`
   - Type: **Regional** (más barato que Global, suficiente para LATAM)
   - Region: `us-east-1` (más cerca de Vercel default)
   - Eviction: `allkeys-lru`
3. Copy connection details:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Buleje usa también `REDIS_URL` (compatible con `ioredis`):
   - Copy "Redis URL" (formato `rediss://default:TOKEN@host:port`)
5. **Vercel dashboard** → Project Buleje → Settings → Environment Variables:
   - `REDIS_URL` = (el rediss:// URL)
   - `UPSTASH_REDIS_REST_URL` = (el https:// URL)
   - `UPSTASH_REDIS_REST_TOKEN` = (el token)
   - Aplicar a: **Production + Preview**
6. Re-deploy (Vercel detecta cambio de env vars).

### Verificación

```bash
# Logs deberían mostrar:
# [cache] Using RedisStore (REDIS_URL set)
# en lugar de:
# [cache] MemoryStore — REDIS_URL not set

# Test manual desde el panel /superadmin (cualquier query cacheada):
# Hacer una acción → ver que se actualiza inmediatamente en otra pestaña/instancia.
```

### Coste

- **Free tier**: 10,000 commands/day · 256MB · suficiente para 50-100 tenants
- **Pay-as-you-go**: ~$0.20 por 100k commands. A 200 tenants ≈ $5/mes

---

## ✅ 2. Supabase Hobby → Pro ($25/mes)

**Por qué**: Supabase Hobby tiene **60 conexiones max al pool**. El código
configura `max=5` por cliente Prisma. Con 5 instancias warm de Vercel
Fluid Compute = 25 conns ya usadas. A 30+ tenants con tráfico simultáneo,
empiezan los `Timed out fetching a new connection`.

Supabase Pro tiene **200 conexiones** = suficiente para 100-200 tenants.

### Pasos

1. https://supabase.com/dashboard/project/[TU-PROJECT]/settings/billing
2. Plan **Pro** ($25/mes incluido):
   - 200 conns (vs 60 hobby)
   - 8GB DB (vs 500MB)
   - 100GB egress (vs 5GB)
   - Daily backups + 7 días retención
   - Soporte email
3. Confirmar upgrade.
4. Verificar dashboard → Database → **Connection pooling** → max-clients = 200

### Alerta proactiva

Settings → Reports → **Database → Conn count**:
- Crear alerta: trigger cuando `> 140 conns` (70% de 200)
- Notificar a Brandon WhatsApp o email
- Acción cuando dispare: subir a Team plan ($599/mes con 500 conns) o
  reducir `prisma.ts max` a 3 e introducir read replica.

---

## ✅ 3. Crons staggered (YA HECHO en código)

`vercel.json` actualizado en commit Sprint 1. 41 schedules cambiados para
distribuirse en minutos 0, 7, 13, 21, 29, 37, 43, 51 dentro del mismo
hour-slot. Antes 5 crons disparaban a `0 9 * * *` simultáneamente → spike
de pool DB. Ahora se reparten en 5 minutos distintos.

---

## TODO bloqueante para Brandon

| # | Acción | Tiempo | Costo |
|---|---|---|---|
| 1 | Crear Upstash Redis (free tier) + setear `REDIS_URL` en Vercel | 30min | $0 |
| 2 | Upgrade Supabase Hobby → Pro | 5min | $25/mes |
| 3 | Crear alerta Supabase 70% pool | 10min | $0 |
| 4 | Re-deploy Vercel para que tomen las env vars | 2min | $0 |

**Score arquitectural esperado tras Sprint 1: 6.1/10 → 7.5/10**.
