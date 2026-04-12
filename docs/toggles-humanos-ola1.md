# 🎚️ Toggles Humanos — Ola 1 (2026-04-09)

Cosas que Brandon tiene que activar personalmente. Yo (Claude) dejo los scripts/comandos listos — él solo aprieta los botones.

Total: **3 toggles** · Tiempo estimado: **30 minutos** · Bloquean: observabilidad + reliability de Ola 1.

---

## 🟢 Toggle 1 — Upstash Redis (gratis)

**Qué hace:** rate limiting distribuido entre todas las réplicas de Vercel (edge + lambdas). Sin esto el rate limiter vive en un `Map` por proceso, así que 10 réplicas = 10 × 60 req/min reales pese al límite configurado de 60. Ver `docs/adr/022-upstash-rate-limit-distribuido.md`.

**Pre-requisito (una vez):** correr `npm install` después de `git pull` para instalar `@upstash/ratelimit` y `@upstash/redis` (ya están en `package.json`).

**Qué tienes que hacer:**

1. Ir a https://console.upstash.com/ → login con GitHub
2. Crear base de datos nueva → nombre: `bodega-ratelimit` → región: `us-east-1` (más cercana a Supabase y Vercel) → tier: **Free** (10k commands/día)
3. En la pestaña **REST API**, copiar estas 2 variables del dashboard:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Pegarlas en `.env.local` (dev) y en Vercel → Settings → Environment Variables (prod + preview)

**Dónde viven los secrets en el código:**

- Se leen desde `lib/rate-limit.ts` → `createDistributedRateLimiter()` → `getRedisClient()`.
- `lib/middleware-utils.ts#checkRateLimit` es async y las usa en cada request `/api/*`.
- `lib/env.ts` loggea un warning en producción si faltan (NO throw — fallback sigue vivo).

**Validación:** correr `npm run dev` y hacer 11 requests seguidas a `/api/orders` con el mismo token. La 11ava debe dar 429. Si sigue dejando pasar = Upstash no conectó → revisar logs, deberían decir `"[rate-limit] Upstash Redis env vars missing"` si fallback activo.

**Rollback:** borrar las 2 vars del `.env.local` (y de Vercel si es necesario). El rate limiter cae al fallback in-memory automáticamente con un warning visible en logs (`logger.error` en producción, `logger.warn` en dev).

---

## 🟡 Toggle 2 — Sentry alerts (ya está en código, falta activarlo)

**Qué hace:** Sentry ya captura errores. Falta configurar **alertas** automáticas que nos avisen por email cuando hay un spike.

**Qué tienes que hacer:**

1. Obtener el Sentry API token:
   - Sentry → Settings → Account → API → Auth Tokens → Create New Token
   - Scopes mínimos: `project:read`, `project:write`, `alerts:write`
   - Pegar en `.env.local` como `SENTRY_API_TOKEN=...`
2. Correr el script que deja armado TODO automático:
   ```bash
   cd bodega-san-martin
   npm run sentry:setup-alerts
   ```
3. Verificar en Sentry → Alerts que aparezcan estas 3 reglas:
   - `[bodega] Error rate > 5%`
   - `[bodega] New issue with impact > 100 users`
   - `[bodega] Slow transaction p95 > 3s`

**Validación:** correr `npm run sentry:setup-alerts -- --dry-run` antes. Si pasa dry-run, correr sin `--dry-run`.

**Rollback:** las alertas se pueden borrar a mano desde el UI de Sentry en 30 segundos.

---

## 🔵 Toggle 3 — Doppler Fase 1 (reemplazo de .env)

**Qué hace:** centralizar secrets en Doppler en vez de `.env.local` + Vercel dashboard por separado. Resuelve el problema de "dónde vive la verdad de cada secret".

**Qué tienes que hacer (fase 1 — solo dev):**

1. Ir a https://dashboard.doppler.com/ → sign up con GitHub (gratis para 5 users / 3 proyectos)
2. Crear proyecto `bodega-san-martin` con 3 configs: `dev`, `stg_preview`, `prd`
3. Instalar Doppler CLI (una sola vez):
   - Windows: `scoop install doppler` o descargar .exe de releases
   - Mac: `brew install dopplerhq/cli/doppler`
4. Autenticar:
   ```bash
   doppler login
   doppler setup --project bodega-san-martin --config dev
   ```
5. Importar los secrets actuales:
   ```bash
   doppler secrets upload .env.local
   ```
6. Probar que funciona:
   ```bash
   doppler run -- npm run dev
   ```
   Si arranca el dev server sin tocar `.env.local`, fase 1 está viva.

**Validación:** renombrar `.env.local` → `.env.local.bak` temporalmente, correr `doppler run -- npm run dev`. Si todo funciona = Doppler está sirviendo secrets. Restaurar el backup después.

**Rollback:** `mv .env.local.bak .env.local` y seguir usando `npm run dev` a secas. Doppler queda instalado pero no activo.

---

## 📋 Checklist de Brandon

Marca cada uno cuando lo termines:

- [ ] Toggle 1 — Upstash Redis conectado + rate limiter 429 funciona
- [ ] Toggle 2 — Sentry alerts creadas + visible en Sentry → Alerts
- [ ] Toggle 3 — Doppler dev config + `doppler run -- npm run dev` arranca

Cuando los 3 estén marcados → avisarme y corro los tests de validación automáticos de Ola 1.

---

## ⚠️ Si algo falla

- **Upstash:** probablemente la región no es la correcta. Borrar la DB y crear una nueva en `us-east-1`.
- **Sentry:** si `npm run sentry:setup-alerts` falla, verificar que `SENTRY_API_TOKEN` tiene los 3 scopes listados. Reemitir token si es necesario.
- **Doppler:** si `doppler login` no abre navegador, usar `doppler login --no-browser` y copiar el token manualmente.

---

**Creado:** 2026-04-09 como parte de Ola 1 Work Item E — Preparar activación humana.
**Referencia:** `~/.claude/projects/C--Users-Usuario/memory/project_sprint_roadmap.md`
