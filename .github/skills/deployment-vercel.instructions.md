---
applyTo: "**/vercel.json,**/next.config*"
---

# Deployment — Vercel

## vercel.json actual (configuración clave)

```json
{
  "framework": "nextjs",
  "buildCommand": "npx prisma generate && npm run build",
  "installCommand": "npm ci",
  "functions": {
    "app/api/**": { "maxDuration": 30 }
  },
  "crons": [
    { "path": "/api/stock-alerts", "schedule": "0 8 * * *" },
    { "path": "/api/birthday-coupons", "schedule": "0 7 * * *" },
    { "path": "/api/daily-digest", "schedule": "0 21 * * *" },
    { "path": "/api/reorder-alerts", "schedule": "0 6 * * *" },
    { "path": "/api/email-automation", "schedule": "0 10 * * *" },
    { "path": "/api/cron/reminders", "schedule": "0 9 * * *" },
    { "path": "/api/cron/trial-expiry", "schedule": "0 3 * * *" },
    { "path": "/api/billing/webhook-replay", "schedule": "0 4 * * *" },
    { "path": "/api/cron/superadmin-alerts", "schedule": "0 8 * * *" }
  ]
}
```

## Variables de entorno requeridas (Vercel dashboard)

```bash
# Base de datos (Supabase)
DATABASE_URL=postgresql://...?pgbouncer=true  # Session pooler — runtime
DIRECT_URL=postgresql://...                    # Sin pgBouncer — migraciones

# Autenticación
AUTH_SECRET=<min 32 chars — HMAC-SHA256>

# Email
SMTP_USER=tu@gmail.com
SMTP_PASS=app-password

# AI
GROQ_API_KEY=gsk_...

# Push notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...

# Pagos
STRIPE_SECRET_KEY=sk_live_... (o sk_test_... para dev)

# Multi-tenant
ROOT_DOMAIN=bodegasaas.com  # Subdominio raíz
```

## Deploy checklist

```bash
# Antes del deploy:
cd bodega-san-martin
npm run lint        # 1. Sin errores ESLint
npm run build       # 2. Build exitoso (con npx prisma generate incluido)
npm run test        # 3. Tests pasan

# Variables de entorno:
# - Todas las env vars en Vercel Dashboard → Settings → Environment Variables
# - DATABASE_URL y DIRECT_URL son DISTINTAS (pooler vs direct)
# - NUNCA commitear .env.local

# Crons en producción:
# - Verificar CRON_SECRET header en cada endpoint de cron
# - Crons solo corren en producción (no en preview deployments)
```

## Comando de build personalizado

```json
"buildCommand": "npx prisma generate && npm run build"
```
`prisma generate` debe ir ANTES de `npm run build` — regenera el cliente Prisma para la arquitectura del servidor de Vercel.

## Flujo CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci.yml — ya configurado
# Corre: lint + build + test en cada PR
# Auto-deploy a Vercel en merge a main
```

## Gotchas

- **`DATABASE_URL` con pgBouncer** — agregar `?pgbouncer=true` o `?connection_limit=1` al connection string
- **`DIRECT_URL` sin pgBouncer** — requerido para `prisma migrate` y no para runtime
- **`prisma generate` en buildCommand** — obligatorio o el build falla (cliente no generado para la plataforma)
- **Crons en Vercel** — solo disponibles en plan Pro o superior
- **`maxDuration: 30`** — máximo en plan Hobby; plan Pro soporta hasta 300s; plan Enterprise 900s

## Anti-patrones

- NO commitear `.env.local` — está en .gitignore (verificar)
- NO usar `DATABASE_URL` (pgBouncer) para migraciones — usa DIRECT_URL
- NO hardcodear API keys en el código
- NO olvidar `CRON_SECRET` verification en endpoints de cron
