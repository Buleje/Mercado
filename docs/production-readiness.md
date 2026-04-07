# Production Readiness Checklist — Bodega San Martín

## Pre-deploy (one-time setup)

### Vercel Configuration
- [ ] Proyecto vinculado con `vercel link`
- [ ] Framework preset: Next.js
- [ ] Build command: `npx prisma generate && npm run build`
- [ ] Node.js version: 20+

### GitHub Secrets (para CI/CD)
- [ ] `VERCEL_TOKEN` — Token de Vercel (Settings → Tokens)
- [ ] `VERCEL_ORG_ID` — ID de tu organización Vercel
- [ ] `VERCEL_PROJECT_ID` — ID del proyecto (en .vercel/project.json)
- [ ] `GITHUB_TOKEN` — Automático, verificar permisos write

### Environment Variables (Vercel)
#### Requeridas
- [ ] `DATABASE_URL` — Supabase connection pooler
- [ ] `DIRECT_URL` — Supabase direct connection (migraciones)
- [ ] `AUTH_SECRET` — JWT secret (mín. 32 chars, generar con `openssl rand -base64 32`)
- [ ] `NEXT_PUBLIC_BASE_URL` — URL de producción

#### Recomendadas
- [ ] `REDIS_URL` — Upstash Redis (activa colas BullMQ + cache distribuido)
- [ ] `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — Monitoreo de errores
- [ ] `SENTRY_AUTH_TOKEN` — Para source maps y alertas API

#### Opcionales
- [ ] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — Pagos con tarjeta
- [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — OAuth Google
- [ ] `SMTP_USER` + `SMTP_PASS` — Email transaccional
- [ ] `WHATSAPP_API_TOKEN` — Notificaciones WhatsApp
- [ ] `CRON_SECRET` — Autenticación de cron jobs
- [ ] `VAPID_*` — Web push notifications

### Post-deploy Verificaciones
- [ ] `npm run redis:verify` — Redis conectado
- [ ] `npm run sentry:setup-alerts` — 4 alertas configuradas
- [ ] Visitar `/api/admin/health` — Status "ok" en todos los checks
- [ ] Crear un pedido de prueba — Checkout flow completo
- [ ] Verificar Tab "Colas" en admin — Stats visibles
- [ ] Verificar Rolling Releases — Deploy con canary stages

### Monitoreo Continuo
- [ ] Sentry dashboard sin errores nuevos
- [ ] Vercel Analytics activo
- [ ] Microsoft Clarity session replays
- [ ] Cron jobs ejecutándose (verificar en Vercel dashboard)
