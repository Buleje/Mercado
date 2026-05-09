# Runbook: Supabase Postgres no responde

**Severity:** P0
**Owner:** SRE on-call (Brandon)
**SLA mitigacion:** 15 minutos para mitigacion parcial / 60 min recuperacion total

---

## Sintomas (como lo detectas)

- `/api/health` retorna HTTP 503 con `"status": "degraded"` y `"database": { "status": "error" }`
- Sentry recibe evento nivel `error`: `[health] DB check failed 3x in the last minute`
- Errores `P2024` (connection timeout) o `P1001` (no se puede conectar) en logs Vercel / Sentry
- Dashboard admin muestra pantalla en blanco o spinner infinito (queries bloqueadas)
- Circuit breaker `"prisma"` en estado `"open"` — visible en `/api/health` campo `circuitBreaker`
- Email de alerta automatica llega a superadmin (fires cada 15 min si DB sigue caida)

---

## Diagnostico inmediato (3 comandos clave)

```bash
# 1. Health check rapido — expected: {"status":"ok", "checks":{"database":{"status":"ok"}}}
#    Si retorna 503 con "degraded", la DB esta caida o el circuit breaker esta abierto
curl https://buleje.pe/api/health | jq '.checks.database'

# 2. Ver logs Vercel en tiempo real (requiere Vercel CLI con `vercel login`)
#    Buscar lineas: [health] DB check failed | P2024 | P1001 | connection refused
vercel logs --follow --app buleje 2>&1 | grep -E "P2024|P1001|DB check|prisma"

# 3. Verificar status publico de Supabase
#    Abrir en navegador: https://status.supabase.com
#    Si hay incidente activo en "Database" -> es problema de Supabase, no nuestro
curl -s https://status.supabase.com/api/v2/status.json | jq '.status.description'
```

---

## Mitigacion (en orden de menor a mayor riesgo)

### 1. [low risk] Verificar configuracion de env vars

El error mas comun es `DATABASE_URL` mal configurada o caducada. Verificar en Vercel Dashboard:

- `DATABASE_URL` debe tener `?pgbouncer=true` y apuntar al **Session Pooler** de Supabase
  - Puerto correcto: `5432` (Session Pooler), NO `5432` direct connection
  - URL formato: `postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres?pgbouncer=true`
- `DIRECT_URL` sin `pgbouncer` — solo se usa en migraciones, no afecta runtime

```bash
# Verificar que la URL actual del proyecto apunte al pooler correcto
# Hacer desde Vercel Dashboard > Settings > Environment Variables
# Tambien se puede listar con Vercel CLI:
vercel env ls --environment production 2>&1 | grep DATABASE_URL
```

### 2. [low risk] Esperar recuperacion automatica del circuit breaker

El circuit breaker `"prisma"` en `lib/circuit-breaker/breaker.ts` pasa de `open` a `half-open` automaticamente tras `resetTimeoutMs` (verificar config en `lib/circuit-breaker/registry.ts`). Si Supabase ya recupero, el breaker se cerrara en el siguiente ciclo de probe.

- Tiempo de espera tipico: 30-60 segundos
- Confirmar con: `curl https://buleje.pe/api/health | jq '.checks.database.circuitBreaker'`
- Si retorna `"half-open"` o `"closed"` con `"status":"ok"` -> recuperado

### 3. [low risk] Activar modo read-only via feature flag

Si la DB responde pero con escrituras fallando (ej. primary degradado, replica disponible):

```bash
# Activar feature flag READ_ONLY_MODE en lib/feature-flags.ts
# Esto bloquea mutaciones (POST/PUT/DELETE) y sirve datos desde cache Redis
# Editar en Vercel Dashboard > Environment Variables:
# FEATURE_READ_ONLY_MODE=true
# Luego hacer redeploy inmediato:
vercel deploy --prod --force
```

### 4. [medium risk] Forzar datos desde cache Redis

Si Redis esta disponible y DB no, las queries que pasan por `lib/cache.ts` retornan datos cacheados. Verificar que el TTL de cache sea aceptable para la operacion:

- `/api/products` — cache 5 min (aceptable en degradacion)
- `/api/orders` — sin cache (datos criticos, NO servir stale)

Para extender TTL de emergencia del cache existente, no hay accion manual — esperar que el cache natural se sirva durante la ventana de outage.

### 5. [medium risk] Reiniciar pgBouncer en Supabase

Si los logs muestran errores de pool exhausto (`connection pool exhausted`, `remaining connection slots reserved`):

1. Ir a [Supabase Dashboard](https://supabase.com/dashboard) > tu proyecto > Database > Connection Pooling
2. Verificar "Pool Mode" = `Session` para runtime, `Transaction` no es compatible con Prisma 7
3. Supabase no expone restart manual de pgBouncer — escalar a soporte Supabase Pro (ver Escalation)

### 6. [high risk — last resort] Redeploy de emergencia en Vercel

Si el problema es que el servidor Next.js quedo en estado corrupto (no la DB en si):

```bash
# Forzar nuevo deployment limpio — interrumpe trafico 2-3 minutos
vercel deploy --prod --force

# Verificar que el nuevo deployment este activo:
vercel inspect --prod 2>&1 | grep "Ready"
```

**ADVERTENCIA:** Hacer esto SOLO si `/api/health` muestra error pero Supabase status.supabase.com esta verde. Si el problema es de Supabase, un redeploy no ayuda.

---

## Escalation

| Tiempo sin resolver | Accion |
|---|---|
| 5 min | Verificar manualmente [status.supabase.com](https://status.supabase.com) y [vercel.com/incidents](https://www.vercel.com/incidents) |
| 15 min | Abrir ticket Supabase Pro Support: [support.supabase.com](https://supabase.com/dashboard/support/new) — adjuntar Project Ref y logs de Sentry |
| 30 min | Notificar a usuarios activos via WhatsApp (Twilio) o banner de mantenimiento en `/` |
| 60 min | Evaluar failover manual a replica de Supabase si esta configurada |

**Contactos clave:**
- Supabase Pro Support: [supabase.com/dashboard/support/new](https://supabase.com/dashboard/support/new) — incluir Project Reference ID
- Vercel Support (si el problema es de hosting): [vercel.com/help](https://vercel.com/help)

---

## Post-incident

- [ ] Archivar snapshot de Sentry (issues del incidente, timeline)
- [ ] Bajar logs de Vercel del periodo afectado: `vercel logs --since <ISO-timestamp> --until <ISO-timestamp>`
- [ ] Exportar metricas PostHog de sesiones afectadas (buscar eventos `api_error` con `status: 503`)
- [ ] Si el fix requiere cambio arquitectural (ej. agregar replica, cambiar pool config) -> crear ADR en `docs/adr/`
- [ ] Actualizar este runbook con el RCA (root cause analysis)
- [ ] Verificar que `lib/env.ts` valide correctamente `DATABASE_URL` en startup para evitar deploys con URL corrupta

---

## Archivos relevantes

| Archivo | Rol |
|---|---|
| `app/api/health/route.ts` | Endpoint de health check, circuit breaker del DB, alertas Sentry automaticas |
| `app/api/health/deep/route.ts` | Health check profundo (mas checks) |
| `lib/circuit-breaker/breaker.ts` | Logica del circuit breaker (CLOSED → OPEN → HALF_OPEN) |
| `lib/circuit-breaker/registry.ts` | Configuracion de breakers registrados (`prisma`, etc.) |
| `lib/prisma.ts` | Instancia singleton de Prisma con `adapter-pg` |
| `lib/cache.ts` | Cache sobre Redis — fallback durante DB outage |
| `lib/env.ts` | Valida `DATABASE_URL` en startup |
