# Doppler — Gestión de Secretos

**Estado:** 🟡 En progreso — plan documentado, ejecución pendiente
**Última actualización:** 2026-04-06
**Reemplaza a:** `doppler-migration.md`, `doppler-migration-guide.md`, `doppler-migration-status.md` (consolidados aquí)

---

## Por qué Doppler

| Problema actual | Cómo lo resuelve Doppler |
|---|---|
| Secrets duplicados en `.env.local` + Vercel dashboard | Una sola fuente de verdad |
| Sin rotación programada | Rotación automática + audit log |
| Sin auditoría de quién vio qué secret | Audit log completo |
| Sin diferenciación clara entre dev / stg / prd | Configs separados con permisos por rol |
| CI/CD con valores dummy en `ci.yml` | Service Token inyecta secrets reales |

---

## Plan de migración (checklist ejecutable)

### Fase 1 — Setup inicial (acciones humanas)

- [ ] Crear cuenta en https://doppler.com (plan **Team gratis** hasta 5 usuarios)
- [ ] Crear proyecto `bodega-san-martin`
- [ ] Crear 3 configs: `dev`, `stg`, `prd`
- [ ] Instalar Doppler CLI local:
  ```bash
  # Windows (Scoop)
  scoop install doppler

  # Alternativa universal
  npm install -g @dopplerhq/cli
  ```
- [ ] Autenticar CLI: `doppler login`

### Fase 2 — Importar secretos

- [ ] **Dev**: subir `.env.local` actual
  ```bash
  cd bodega-san-martin
  doppler setup --project bodega-san-martin --config dev
  doppler secrets upload .env.local
  doppler secrets   # verificar
  ```

- [ ] **Stg**: copiar de dev y rotar variables sensibles
  - `DATABASE_URL` → URL de Supabase staging
  - `DIRECT_URL` → URL direct de Supabase staging
  - `AUTH_SECRET` → nuevo secreto: `openssl rand -hex 32`
  - `STRIPE_SECRET_KEY` → `sk_test_...`
  - `SENTRY_DSN` → DSN del proyecto Sentry staging

- [ ] **Prd**: NO reusar secretos de dev/stg
  - `DATABASE_URL` → Supabase pooler production
  - `DIRECT_URL` → Supabase direct production
  - `AUTH_SECRET` → 64 chars: `openssl rand -hex 64`
  - `STRIPE_SECRET_KEY` → `sk_live_...`
  - `STRIPE_WEBHOOK_SECRET` → del dashboard Stripe en vivo
  - `CRON_SECRET` → nuevo: `openssl rand -hex 32`
  - `REDIS_URL` → Upstash production
  - `SENTRY_DSN` → DSN production
  - `WHATSAPP_API_TOKEN` → token real Meta Business
  - `SMTP_USER`, `SMTP_PASS` → credenciales del relay

### Matriz de variables por entorno

| Variable | dev | stg | prd |
|---|---|---|---|
| `DATABASE_URL` | local/Supabase pooler dev | Supabase staging | Supabase prod |
| `DIRECT_URL` | local/Supabase direct dev | Supabase direct staging | Supabase direct prod |
| `AUTH_SECRET` | dev-secret-32 | rotated-32 | rotated-64 |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | local | stg | prd |
| `SENTRY_DSN` | — | dsn-stg | dsn-prod |
| `REDIS_URL` | — | upstash stg | upstash prd |
| `CRON_SECRET` | — | rotated | rotated |
| `WHATSAPP_API_TOKEN` | — | sandbox | live |
| `SMTP_USER` / `SMTP_PASS` | — | stg relay | live relay |

### Fase 3 — Integración con Vercel

- [ ] En Doppler dashboard: **Integrations** → **Vercel** → **Connect**
- [ ] Autenticar con la cuenta Vercel que tiene `bodega-san-martin`
- [ ] Mapeo de configs:
  - `prd` → Vercel **Production**
  - `stg` → Vercel **Preview**
  - `dev` → Vercel **Development** (opcional, solo para `vercel dev`)
- [ ] Verificar sync inicial en Vercel: **Settings** → **Environment Variables** debe mostrar el ícono de Doppler
- [ ] Hacer redeploy manual de Preview y revisar logs buscando errores de env var faltante
- [ ] **No eliminar** las variables manuales de Vercel hasta haber verificado 48h en Preview

### Fase 4 — Integración con GitHub Actions

- [ ] Crear Service Token en Doppler:
  - **Access** → **Service Tokens** → **Generate**
  - Scope: `bodega-san-martin` / `prd`
  - Permisos: **Read Only**
- [ ] En GitHub repo: **Settings** → **Secrets** → **Actions** → **New repository secret**
  - Nombre: `DOPPLER_TOKEN`
  - Valor: el token (formato `dp.st.XXXXXX`)
- [ ] Actualizar `.github/workflows/ci.yml`:
  ```yaml
  - name: Install Doppler CLI
    uses: dopplerhq/cli-action@v3

  - name: Run build with Doppler secrets
    env:
      DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
    run: doppler run -- npm run build
  ```
  - Eliminar los valores dummy actuales (`DATABASE_URL` placeholder)
- [ ] Verificar que CI pase con secretos de Doppler

### Fase 5 — Limpieza local

- [ ] Backup de `.env.local`:
  ```bash
  mv .env.local .env.local.backup
  echo ".env.local.backup" >> .gitignore
  ```
- [ ] Verificar que `.env.example` esté completo y al día (sin valores reales)
- [ ] Actualizar `package.json` con scripts Doppler-aware:
  ```json
  {
    "scripts": {
      "dev": "next dev --turbo",
      "dev:doppler": "doppler run -- next dev --turbo",
      "build:doppler": "doppler run -- next build"
    }
  }
  ```
- [ ] Actualizar `CLAUDE.md`: reemplazar la sección "Variables de entorno mínimas" por un link a este doc
- [ ] Revocar secretos rotados en los servicios originales (Stripe live, Supabase, WhatsApp API)

### Fase 6 — Monitoreo continuo

- [ ] Configurar audit log alerts en Doppler
  - Alertas cuando alguien accede a `prd` secrets
  - Alertas cuando se edita una variable crítica
- [ ] Calendar reminder cada 6 meses para rotar:
  - `AUTH_SECRET`
  - `CRON_SECRET`
  - `STRIPE_WEBHOOK_SECRET`
  - Tokens de integraciones externas

---

## Uso día a día (post-migración)

### Desarrollo local

```bash
# En lugar de: npm run dev
doppler run -- npm run dev

# O con el alias:
npm run dev:doppler
```

### Rotar un secreto

```bash
# Rotar AUTH_SECRET en producción
doppler secrets set AUTH_SECRET="$(openssl rand -hex 64)" \
  --project bodega-san-martin --config prd
```

Doppler sincroniza automáticamente el nuevo valor a Vercel y triggerea un redeploy.

### Ver secretos del entorno actual

```bash
doppler secrets --project bodega-san-martin --config dev
```

---

## Bloqueos actuales

| Bloqueo | Quién lo desbloquea | Impacto si no se resuelve |
|---|---|---|
| Crear cuenta Doppler | Brandon (humano) | Nada avanza |
| Acceso admin a Vercel project | Brandon | No se puede integrar Vercel |
| Acceso admin a GitHub repo | Brandon | No se puede actualizar CI |
| Credenciales actuales (Stripe live, SMTP, WhatsApp) | Brandon | No se puede rotar |

---

## Plan de rollback

Si Doppler falla en producción:
1. **Antes de empezar:** exportar las variables actuales de Vercel a un archivo seguro fuera del repo
2. Si Doppler falla en producción: revertir a las variables manuales en Vercel
3. Desactivar la integración Doppler → Vercel
4. Re-deploy con las variables originales
5. Investigar el problema offline

**Regla de oro:** NO eliminar variables manuales en Vercel hasta haber verificado que Doppler funciona en Preview durante al menos 48 horas.

---

## Estado actual del proyecto

- ✅ Plan documentado (este archivo)
- ❌ Doppler CLI no instalado
- ❌ Cuenta Doppler no creada
- ❌ Integración Vercel no configurada
- ❌ Secretos aún en `.env.local` + Vercel env vars

## Próximo paso inmediato

👉 **Crear cuenta en https://doppler.com y crear el proyecto `bodega-san-martin`.** Todo lo demás se puede automatizar con el CLI después.
