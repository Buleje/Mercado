# 🎚️ Toggles Humanos — Ola 1 (2026-04-09)

Cosas que Brandon tiene que activar personalmente. Yo (Claude) dejo los scripts/comandos listos — él solo aprieta los botones.

Total: **3 toggles** · Tiempo estimado: **30 minutos** · Bloquean: observabilidad + reliability de Ola 1.

---

## 🟢 Toggle 1 — Upstash Redis (gratis)

**Qué hace:** cache compartido para rate limiting, sesiones, background jobs. Sin esto el rate limiter vive en memoria y se pierde entre deploys.

**Qué tienes que hacer:**

1. Ir a https://console.upstash.com/ → login con GitHub
2. Crear base de datos nueva → nombre: `bodega-ratelimit` → región: `us-east-1` (más cercana a Supabase y Vercel) → tier: **Free** (10k commands/día)
3. Copiar estas 2 variables del dashboard:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Pegarlas en `.env.local` (dev) y en Vercel → Settings → Environment Variables (prod + preview)

**Validación:** correr `npm run dev` y hacer 11 requests seguidos a `/api/orders` con el mismo token. La 11va debe dar 429. Si sigue dejando pasar = Redis no conectó.

**Rollback:** borrar las 2 vars del `.env.local`. El rate limiter cae al fallback in-memory automáticamente.

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
