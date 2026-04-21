# Checklist de Cierre — Acciones Manuales Sprints S1-S5

**Fecha:** 2026-04-20
**Contexto:** Sprints S1-S5 cerraron 19 items P0/P1/P2 + 93 tests nuevos. Quedan 3 acciones que requieren tu mano (rotación de credenciales, configuración de GitHub UI, configuración Sentry).
**Tiempo total:** ~30 min

---

## Resumen — orden de ejecución

| # | Acción | Tiempo | Riesgo | Cuándo |
|---|---|---|---|---|
| 1 | Branch protection en master | 1 min | 0 | YA |
| 2 | Sentry webhook a Discord/Slack | 10 min | 0 | YA |
| 3 | Rotar `.env` + limpiar credenciales | 20 min | Alto si te equivocás | Antes del primer deploy con clientes reales |

---

## ⚡ Acción 1 — Branch protection en master (1 min, riesgo 0)

| Paso | Acción |
|---|---|
| 1 | Abrí https://github.com/Buleje/Mercado/settings/branches |
| 2 | Click **"Add branch protection rule"** |
| 3 | **Branch name pattern:** `master` |
| 4 | Marcá: ☑ Require a pull request before merging → **1 approval** |
| 5 | Marcá: ☑ Require status checks to pass before merging |
| 6 | Marcá: ☑ Require branches to be up to date before merging |
| 7 | En "Status checks that are required" agregá: `lint`, `tsc`, `test`, `build` |
| 8 | Marcá: ☑ Require conversation resolution before merging |
| 9 | **Save changes** |

**Verificación:** intentá `git push` directo a master desde local → debe fallar con `protected branch`.

---

## 🔔 Acción 2 — Sentry webhook (10 min, riesgo 0)

### Opción A — Discord

| Paso | Acción |
|---|---|
| 1 | Discord server → Settings → Integrations → Webhooks → **New Webhook** |
| 2 | Nombre: `Sentry Buleje` · Channel: `#alertas-prod` |
| 3 | **Copy Webhook URL** (formato: `https://discord.com/api/webhooks/...`) |
| 4 | Agregar `/slack` al final del URL (Discord acepta payload Slack) |
| 5 | Sentry → https://sentry.io/settings/buleje/projects/ → tu proyecto → **Alerts** → **Create Alert Rule** |
| 6 | Condición: `When an event is seen` + `The issue's level is equal to error` |
| 7 | Action: **Send a notification via webhook** → pegá el Discord URL con `/slack` |
| 8 | **Save Rule** |

### Opción B — Slack

| Paso | Acción |
|---|---|
| 1 | Sentry → **Settings** → **Integrations** → buscá **Slack** → **Add to Project** |
| 2 | Autorizá la app en tu workspace |
| 3 | Linkeá canal `#alertas-prod` |
| 4 | Settings → **Alerts** → New Rule → Action: **Send notification to Slack** → elegí canal |

**Verificación:** desde Sentry → Issue cualquiera → ⋯ → **Trigger Alert** → debe llegar mensaje al canal.

---

## 🔥 Acción 3 — Rotar `.env` + credenciales (20 min, riesgo ALTO)

⚠️ **Hacé backup primero:** `cp .env .env.backup-2026-04-20` (LOCAL, no commitees el backup)

### Paso 3.1 — Sacar `.env` del repo (5 min)

```bash
cd C:/dev/bodega-san-martin/bodega-san-martin

# Verificar si .env esta versionado
git ls-files | grep -E "^\.env$" || echo "OK no esta versionado"

# Si SI esta versionado, removerlo del index sin borrar local
git rm --cached .env

# Asegurar gitignore lo cubre
grep -qE "^\.env$" .gitignore || echo ".env" >> .gitignore
grep -qE "^\.env\.local$" .gitignore || echo ".env.local" >> .gitignore

git add .gitignore
git commit -m "chore(security): exclude .env files from git"
git push
```

### Paso 3.2 — Limpiar historia de git (OPCIONAL — solo si vas a hacer el repo público) (10 min)

⚠️ **DESTRUCTIVO** — reescribe historia. Coordiná con tu equipo si hay otros devs.

```bash
# Backup branch local primero
git branch backup-master-$(date +%Y%m%d) master

# Instalar git-filter-repo si no lo tenes
pip install git-filter-repo

# Limpiar todas las apariciones de .env en la historia
git filter-repo --path .env --invert-paths --force

# Force-push: necesitas desactivar branch protection temporal
# 1. GitHub Settings -> Branches -> editá la regla de master
# 2. Marcá temporalmente "Allow force pushes" (solo Buleje)
# 3. git push origin master --force
# 4. Reactivá la protección (desmarca "Allow force pushes")
```

### Paso 3.3 — ROTAR credenciales (15 min)

🔴 **CRÍTICO:** aunque NO limpies historia, las credenciales que estaban en el `.env` ya quedaron expuestas en cualquier clone previo. **Rotá igual.**

| Servicio | Dashboard | Acción |
|---|---|---|
| **Supabase DB** | https://supabase.com/dashboard/project/_/settings/database | Reset DB password → genera nueva → copiá nueva connection string |
| **Supabase Service Role** | Settings → API → Reveal & **Regenerate** service_role key | Nueva key |
| **Groq API** | https://console.groq.com/keys | Revoke vieja → Create new key |
| **Stripe** (si usás) | https://dashboard.stripe.com/apikeys | Roll Secret key |
| **Mercado Pago** | https://www.mercadopago.com.pe/developers/panel/credentials | Generar nuevas credentials (production + sandbox) |
| **AUTH_SECRET** | Local: `openssl rand -base64 32` | Genera nuevo string |
| **CRON_SECRET** | Local: `openssl rand -base64 32` | Genera nuevo string |

### Paso 3.4 — Actualizar Vercel env vars (5 min)

Para cada credencial nueva del paso 3.3:

```bash
# Via CLI (mas rapido que UI)
vercel env rm DATABASE_URL production
echo "postgresql://nueva-password..." | vercel env add DATABASE_URL production

# Repeti para cada variable: DIRECT_URL, AUTH_SECRET, GROQ_API_KEY,
# STRIPE_SECRET_KEY, MERCADOPAGO_ACCESS_TOKEN, CRON_SECRET, etc.
```

O por UI: https://vercel.com/<tu-team>/bodega-san-martin/settings/environment-variables

### Paso 3.5 — Trigger redeploy

```bash
vercel --prod
# O hace commit dummy que dispare deploy automatico
```

### Verificación final

```bash
# 1. .env NO debe estar en git
git ls-files | grep -E "^\.env$" && echo "FAIL" || echo "OK"

# 2. Produccion responde con las nuevas credenciales
curl -s -o /dev/null -w "%{http_code}\n" https://www.buleje.pe/api/health
# Esperado: 200

# 3. Crons no fallan
vercel logs --prod --since 1h | grep -i "cron\|error" | head -10
```

---

## 🆘 Troubleshooting

| Síntoma | Solución |
|---|---|
| Vercel deploy falla `DATABASE_URL invalid` | Verificá que la URL en Vercel env vars sea exactamente la nueva (sin saltos de línea, sin espacios al inicio/fin) |
| App responde 500 en `/api/*` | Probablemente `AUTH_SECRET` cambió → todas las sesiones invalidadas. Esperable; usuarios deben re-loguearse |
| Cron jobs fallan | Si rotaste `CRON_SECRET`, actualizalo en Vercel env. Verificá `vercel.json` apunte al header correcto (`Authorization: Bearer $CRON_SECRET`) |
| `git push --force` rechazado | Branch protection activa. Desactivala temporal (paso 3.2), force-push, reactivala |
| Mercado Pago webhook firma falla | El nuevo `MERCADOPAGO_WEBHOOK_SECRET` debe configurarse también en el dashboard MP (no solo en .env) |
| Supabase service role no funciona | Algunos endpoints `/api/admin/*` usan la service role. Verificá `SUPABASE_SERVICE_ROLE_KEY` en Vercel env |

---

## Estado post-cierre esperado

Cuando termines las 3 acciones:

| Item Master Plan | Estado final |
|---|---|
| P0 #1 `.env` rotation | ✅ Cerrado |
| P1 #15 Branch protection | ✅ Cerrado |
| P2 #26 Sentry webhooks | ✅ Cerrado |
| **Total Master Plan cerrado** | **22/30 items (73%)** |

Items restantes que NO requieren tu mano (próximos sprints opcionales):
- P1 #5 Yape disabled UI (necesita /checkout-squad)
- P2 #17 Bundle analyzer (`npm install` nuevo dep)
- P2 #18 Framer-motion audit (sprint propio)
- P2 #21 axe-core a11y (`npm install` nuevo dep)
- P2 #27 FinOps cron report (sprint propio)
- P3 #29 Capacitor mobile (cuando >1000 users)
- P3 #30 OpenTelemetry dev local (nice-to-have)

---

## Referencias

- `docs/MASTER-PLAN-MEJORAS-2026.md` — plan completo de 30 items
- `docs/CSRF_MIGRATION.md` — patrón CSRF que ya está aplicado
- `lib/csrf.ts` — helper CSRF (ya en producción)
- `lib/cron-auth.ts` — helper CRON_SECRET (ya en producción)
- `proxy.ts` — middleware central de seguridad (ya enforce CSRF + rate limit)
