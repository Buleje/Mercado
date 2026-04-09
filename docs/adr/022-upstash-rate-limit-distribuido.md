# ADR 022 — Rate limiting distribuido con Upstash Redis REST

**Status:** Accepted
**Date:** 2026-04-09
**Closes:** Hallazgo #1 de `docs/research/cross-cutting-improvements-2026-04-09.md`
**Related:** ADR 014 (middleware module split)

## Contexto

Antes de esta ADR, el rate limiter del middleware (`lib/middleware-utils.ts` L51-110) usaba un `Map` en memoria por proceso:

```ts
export const rlStore = new Map<string, RateLimitEntry>();
// ...
export function checkRateLimit(req: NextRequest): NextResponse | null {
  // uses rlStore
}
```

Ese diseño es seguro en un único servidor de Node pero **rompe en Vercel** por la forma en que escala el runtime:

- Cada réplica (edge o lambda) tiene su propio heap → cada una tiene su propio `Map`.
- Con 10 réplicas calientes simultáneamente, un atacante con una sola IP puede emitir **~600 req/min** (10 × 60) aunque el límite configurado sea 60 req/min.
- El timer de cleanup (`setInterval`) se resetea en cada cold start, así que el store tampoco respeta la ventana de 60s de forma determinista.
- No hay coordinación ninguna entre réplicas: es un vector de DoS **real y explotable**, no teórico.

El CROSS-CUTTING-SCOUT de la auditoría 2026-04-09 lo marcó como P0 (Seguridad — Rate limit).

## Decisión

Migrar `checkRateLimit()` en `lib/middleware-utils.ts` a un rate limiter distribuido usando **Upstash Redis REST** a través de `@upstash/ratelimit`:

1. **Nuevo módulo `createDistributedRateLimiter()`** en `lib/rate-limit.ts` que devuelve una interfaz async (`check(identifier): Promise<boolean>`).
2. **Implementación primaria:** `@upstash/ratelimit` con `Ratelimit.slidingWindow(maxRequests, windowMs)` y prefijo `bsm:rl:*` para aislamiento multi-tenant del cluster Upstash.
3. **Fallback in-memory** cuando `UPSTASH_REDIS_REST_URL` o `UPSTASH_REDIS_REST_TOKEN` no están definidos. El fallback usa un `Map` namespaced por `config.key`. En `NODE_ENV=production` la ausencia se loggea con `logger.error` una vez por instancia (en dev con `logger.warn`).
4. **`lib/middleware-utils.ts#checkRateLimit`** se convierte en async. `proxy.ts` paso 5 hace `await checkRateLimit(request)`.
5. **Fail-open en outage:** si Upstash tira excepción (network, 5xx), el limiter devuelve `true` (permite la request) y loggea el error a nivel `error`. Bloqueamos ataques, pero NO bloqueamos el sitio si el proveedor cae.
6. **API legacy preservada:** los route handlers que usan el `createRateLimiter` sync y `applyRateLimit(req, "STRICT", "prefix")` siguen funcionando igual. El barrier global está en el middleware; los route handlers son smoothers por instancia.

### Configuración

Env vars nuevas (opcionales):

```env
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
```

Se obtienen en https://console.upstash.com/ (tier gratis: 10k comandos/día, más que suficiente para v1 de Bodega San Martín).

`lib/env.ts` valida opcionalmente en `validateEnv()` — en producción, si faltan, loggea warning pero **no lanza**, porque queremos que deploys existentes sigan booteando mientras el humano aprieta el toggle.

### Edge compatibility

- `@upstash/ratelimit` v2 y `@upstash/redis` v1 son edge-nativos por diseño (usan `fetch`, no `ioredis` / `net`).
- El middleware `proxy.ts` corre en el edge runtime de Next.js 16, sin node-specific imports.

## Consecuencias

### Positivas

- Cierra una vulnerabilidad DoS real: a partir del merge, el rate limit es **verdaderamente 60 req/min por IP** sin importar cuántas réplicas tenga el proyecto en Vercel.
- Cero coordinación manual entre réplicas — Upstash es el source of truth.
- Fallback defensivo: dev sin Upstash sigue funcionando.
- `@upstash/ratelimit` trae sliding-window y token-bucket listos, eliminando bugs propios del contador manual (p. ej. doble decremento entre cleanup y check).
- El API actual de los route handlers no se rompe — migración invisible para ellos.

### Negativas

- Dependencia nueva en un servicio externo (Upstash). Mitigación: free tier + fail-open + fallback in-memory documentado.
- +2 paquetes npm (`@upstash/ratelimit`, `@upstash/redis`). Peso combinado: ~35 KB minified (aceptable en edge).
- Costo ≥ $0/mes hasta 10k comandos/día. Si se excede (muy improbable en v1), el tier "Pay as you go" cobra $0.2/100k comandos.
- Latencia adicional: ~5-15ms por request rate-limiteada (fetch Upstash). Se compensa porque el middleware ya incluye múltiples fetchs (session verify, platform session, etc.).

### Rollback

Si Upstash se prueba inviable:
1. Borrar `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` del entorno.
2. El fallback in-memory se activa automáticamente (con warning en logs).
3. Vuelves al estado pre-ADR, sin deploy nuevo.

Rollback de código: revertir el commit que introdujo ADR-022 mantiene la forma async pero elimina la dependencia.

## Alternativas consideradas

| Opción | Descartada porque |
|---|---|
| **Vercel KV** | Tiene free tier pero mucho más limitado (30k commands/mes vs 10k commands/día en Upstash). Para rate-limit que puede hacer muchos reads/writes por segundo, se agota rápido. |
| **Cloudflare Workers KV** | No somos Cloudflare, somos Vercel. Montar un worker solo para rate limit duplica infraestructura. |
| **Redis vía TCP con ioredis** | No edge-compatible. Hoy `lib/cache.ts` lo usa en el runtime de Node pero el middleware corre edge. Además `ioredis` requiere `node:net`, que no existe en edge workers. |
| **DB sequential-scan en Postgres** | Latencia 50-200ms por check + presión enorme sobre Supabase pooler. No es rate-limit, es una DoS interna. |
| **Algolia / otro proveedor SaaS** | Sobreingeniería: solo necesitamos un contador atómico con TTL. |
| **Dejar como está y aceptar el riesgo** | Es una vulnerabilidad P0 — no es aceptable. |

## Validación

- Unit tests en `__tests__/rate-limit.test.ts` (fallback in-memory + mocked Upstash SDK + fail-open).
- Unit tests en `__tests__/middleware-utils.test.ts` actualizados a async, verifican 60 reqs → 61ava bloqueada.
- Humano debe correr el toggle documentado en `docs/toggles-humanos-ola1.md#toggle-1`:
  1. Crear DB en Upstash console (free tier).
  2. Pegar `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` en `.env.local` y Vercel.
  3. 11 requests a `/api/orders` con mismo IP → 11ava debe dar 429.

## Comandos

```bash
npm install                              # instala @upstash/ratelimit + @upstash/redis
npx tsc --noEmit                         # verificar tipos
npm run test -- __tests__/rate-limit.test.ts
npm run test -- __tests__/middleware-utils.test.ts
```

## Referencias

- https://upstash.com/docs/redis/sdks/ratelimit-ts
- https://github.com/upstash/ratelimit
- `docs/research/cross-cutting-improvements-2026-04-09.md` — hallazgo #1
- `docs/toggles-humanos-ola1.md` — Toggle 1 (Upstash Redis)
