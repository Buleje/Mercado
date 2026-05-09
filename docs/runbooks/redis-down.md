# Runbook: Upstash Redis caido

**Severity:** P1
**Owner:** SRE on-call (Brandon)
**SLA mitigacion:** 10 minutos (sistema sobrevive sin Redis gracias a fallbacks)

---

## Sintomas (como lo detectas)

- Rate limiting deja de funcionar: endpoints aceptan requests sin limite (logs muestran `[rate-limit] upstash unavailable, using in-memory fallback`)
- Queues BullMQ stuck: jobs en `lib/queue/queues.ts` no se procesan, `npm run queue:workers` muestra conexion rechazada
- Cache miss en todas las rutas: respuestas lentas (cada query va directo a DB), latencia sube 200-500ms
- Sentry registra errores de tipo `ECONNREFUSED` o `ERR_CONNECTION_TIMED_OUT` con origen `upstash.io`
- Circuit breaker de Redis (si configurado) en estado `"open"`
- `/api/health/deep` muestra degradacion en componente `redis`

---

## Diagnostico inmediato (3 comandos clave)

```bash
# 1. Verificar status publico de Upstash
#    Expected: {"page":{"description":"All Systems Operational"},...}
#    Si hay incidente -> esperar recuperacion de Upstash
curl -s https://status.upstash.com/api/v2/status.json | jq '.status.description'

# 2. Probar conectividad REST de Upstash directamente
#    Reemplazar <UPSTASH_REDIS_REST_URL> y <UPSTASH_REDIS_REST_TOKEN> con los valores de .env
#    Expected: {"result":"PONG"}
#    Si retorna error de red -> Upstash caido. Si retorna 401 -> token incorrecto
curl -s "<UPSTASH_REDIS_REST_URL>/ping" \
  -H "Authorization: Bearer <UPSTASH_REDIS_REST_TOKEN>" | jq '.'

# 3. Ver si el fallback in-memory esta activo en logs Vercel
#    Expected en degradacion: "[rate-limit] upstash unavailable, using in-memory fallback"
#    Si no aparece: el sistema puede estar fallando hard en lugar de degradar gracefully
vercel logs --follow --app buleje 2>&1 | grep -E "upstash|redis|rate-limit|queue|BullMQ" | tail -30
```

---

## Mitigacion (en orden de menor a mayor riesgo)

### 1. [low risk] Confirmar que el fallback in-memory esta activo

`lib/rate-limit.ts` tiene logica de fallback automatica: si `UPSTASH_REDIS_REST_URL` no responde, usa un `Map` en memoria por proceso. Esto significa:

- Rate limiting sigue funcionando pero **por instancia Vercel** (no distribuido)
- Es aceptable para P1 — no es un fallo de seguridad, solo reduce precision del rate limit
- Confirmar en logs: mensaje `using in-memory fallback`

Si el fallback esta activo, el sistema es funcional. Monitorear hasta que Upstash se recupere.

### 2. [low risk] Deshabilitar rate limit en rutas no criticas

Si el fallback in-memory genera problemas de memoria (instancias Vercel con muchos requests):

```bash
# Activar feature flag para saltear rate limit en rutas publicas (no-auth)
# En Vercel Dashboard > Environment Variables:
# DISABLE_PUBLIC_RATE_LIMIT=true
# Redeploy inmediato:
vercel deploy --prod --force
```

**IMPORTANTE:** Mantener rate limit activo en rutas de autenticacion (`/api/auth/*`) aunque sea con fallback in-memory. Nunca deshabilitar rate limit en login/register.

### 3. [low risk] Detener queue workers para evitar errores en cascada

Los workers de BullMQ (`lib/queue/workers.ts`) van a intentar reconectarse a Redis repetidamente generando ruido en logs. Si Upstash esta caido:

```bash
# Si los workers corren como proceso separado (npm run queue:workers):
# Detenerlos manualmente hasta que Redis vuelva
# Los jobs no se pierden — BullMQ persiste en Redis, pero si Redis cayo, los jobs
# que estaban en cola ANTES del outage pueden perderse segun la configuracion de persistencia

# Verificar cuantos jobs estaban pendientes ANTES del outage en Upstash Dashboard:
# https://console.upstash.com -> tu database -> Data Browser -> keys con prefijo "bull:"
```

### 4. [medium risk] Verificar y rotar credenciales de Upstash

Si el error es `401 Unauthorized` (no un outage de Upstash sino credenciales revocadas):

1. Ir a [Upstash Console](https://console.upstash.com) > tu database > Details
2. Copiar `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` actualizados
3. Actualizar en Vercel Dashboard > Settings > Environment Variables
4. Redeploy:
   ```bash
   vercel deploy --prod --force
   ```

### 5. [medium risk] Limpiar cache corrupto en Upstash

Si Upstash recupera pero las keys de cache retornan datos corruptos (ej. tipos incorrectos tras un schema change):

```bash
# PELIGROSO: esto borra TODO el cache, aumentara carga en DB temporalmente
# Ejecutar SOLO si los datos cacheados estan definitivamente corruptos
# Upstash Console -> Data Browser -> FLUSHALL (boton en UI)
# O via REST:
curl -X POST "<UPSTASH_REDIS_REST_URL>/flushall" \
  -H "Authorization: Bearer <UPSTASH_REDIS_REST_TOKEN>"
```

**Consecuencia:** 2-5 minutos de alta latencia mientras el cache se reconstruye desde DB.

### 6. [high risk — last resort] Redeploy sin Redis

Si Upstash tiene un outage extendido (>2 horas) y se necesita reducir errores en logs:

```bash
# Remover temporalmente las env vars de Upstash para forzar modo in-memory total
# Vercel Dashboard > Settings > Environment Variables:
# - Poner UPSTASH_REDIS_REST_URL="" (string vacio fuerza fallback in-memory)
# - NO borrar la variable, solo vaciarla para poder restaurarla facilmente

vercel deploy --prod --force
```

**Consecuencia:** rate limit in-memory solamente, no hay cache compartido entre instancias, queues detenidas. Sistema funcional pero degradado.

---

## Escalation

| Tiempo sin resolver | Accion |
|---|---|
| 5 min | Verificar [status.upstash.com](https://status.upstash.com) — si hay incidente activo, solo esperar |
| 10 min | Si no hay incidente Upstash, abrir ticket: [Upstash Support](https://upstash.com/docs/common/help/support) |
| 20 min | Activar modo in-memory completo (step 6 arriba) para estabilizar |
| 60 min | Si outage continua, evaluar migrar a Redis alternativo (ej. Railway Redis) — requiere ADR |

**Contactos:**
- Upstash Support: [support en Discord de Upstash](https://upstash.com/discord) o email `support@upstash.com`
- Incluir: Region del database, nombre del proyecto, error exacto con timestamp

---

## Post-incident

- [ ] Archivar logs Sentry del periodo (filtrar por `upstash OR redis OR rate-limit`)
- [ ] Revisar PostHog: eventos `api_slow` o `api_error` durante la ventana del incidente
- [ ] Verificar que los jobs de BullMQ que estaban pendientes se procesaron correctamente tras recuperacion
- [ ] Si jobs se perdieron: revisar que operaciones criticas necesitan fallback de persistencia alternativo
- [ ] Evaluar si es necesario un circuit breaker dedicado para Redis en `lib/circuit-breaker/registry.ts`
- [ ] Si el outage fue >30 min, crear ADR sobre estrategia de cache sin Redis

---

## Archivos relevantes

| Archivo | Rol |
|---|---|
| `lib/rate-limit.ts` | Rate limiter con fallback in-memory automatico si Upstash no responde |
| `lib/rate-limit/store.ts` | Store de rate limit — abstraccion Redis/memoria |
| `lib/cache.ts` | Cache principal sobre Upstash Redis |
| `lib/queue/queues.ts` | Definicion de colas BullMQ (conecta a Redis) |
| `lib/circuit-breaker/registry.ts` | Registry de circuit breakers — agregar uno para Redis si no existe |
| `lib/env.ts` | Valida `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` en startup |
| `proxy.ts` | Middleware que llama a rate limiter distribuido — primer punto de falla visible |
