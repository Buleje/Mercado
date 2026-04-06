# Migración a Doppler — Estado y Próximos Pasos

**Fecha:** 2026-04-06
**Guía original:** `docs/doppler-migration-guide.md`
**Estado global:** 🟡 En progreso — plan documentado, ejecución pendiente

---

## Checklist ejecutable

### Setup inicial (acciones humanas requeridas)

- [ ] **Crear cuenta Doppler** en https://doppler.com — usar correo de trabajo
  - _Requiere: acceso a email + ~5 min_
  - _Plan sugerido: Team (gratis hasta 5 usuarios)_

- [ ] **Crear proyecto `bodega-san-martin` en Doppler**
  - _Dentro del workspace recién creado → New Project_
  - _Nombre exacto: `bodega-san-martin` (con guiones)_

- [ ] **Crear 3 configs**: `dev`, `stg`, `prd`
  - _Doppler crea `dev` por defecto. Agregar `stg` y `prd` → New Config (Environment)_

- [ ] **Instalar Doppler CLI local**
  ```bash
  # Windows (Scoop)
  scoop install doppler

  # Alternativa universal (requiere Node 20+)
  npm install -g @dopplerhq/cli
  ```

- [ ] **Autenticar CLI**
  ```bash
  doppler login
  ```

### Importación de secretos (por entorno)

- [ ] **Dev**: subir `.env.local` actual
  ```bash
  cd bodega-san-martin
  doppler setup --project bodega-san-martin --config dev
  doppler secrets upload .env.local
  ```

- [ ] **Verificar que los secretos subieron**
  ```bash
  doppler secrets
  ```

- [ ] **Stg**: crear desde Dashboard Doppler
  - _Copiar de dev, cambiar:_
    - `DATABASE_URL` → URL de Supabase staging
    - `DIRECT_URL` → URL direct de Supabase staging
    - `AUTH_SECRET` → secreto distinto (mín 32 chars, generar con `openssl rand -hex 32`)
    - `STRIPE_SECRET_KEY` → sigue siendo `sk_test_...` pero cuenta distinta si la hay
    - `SENTRY_DSN` → DSN del proyecto Sentry staging

- [ ] **Prd**: crear desde Dashboard Doppler con rotación de secretos
  - _NO reusar secretos de dev/stg_
  - _Rotar AUTH_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CRON_SECRET_
  - _Variables críticas:_
    - `DATABASE_URL` → Supabase pooler production
    - `DIRECT_URL` → Supabase direct production
    - `AUTH_SECRET` → NUEVO secreto de 64 chars (`openssl rand -hex 64`)
    - `STRIPE_SECRET_KEY` → `sk_live_...`
    - `STRIPE_WEBHOOK_SECRET` → del dashboard Stripe en vivo
    - `CRON_SECRET` → nuevo secreto (`openssl rand -hex 32`)
    - `REDIS_URL` → Upstash production
    - `SENTRY_DSN` → DSN production
    - `WHATSAPP_API_TOKEN` → token real de Meta Business
    - `SMTP_USER`, `SMTP_PASS` → credenciales del relay

### Integración con Vercel

- [ ] **Conectar Doppler → Vercel**
  1. En Doppler dashboard: `Integrations` → `Vercel` → `Connect`
  2. Autenticar con la cuenta Vercel que tiene `bodega-san-martin`
  3. Seleccionar el proyecto Vercel
  4. **Mapeo de configs:**
     - `prd` → Vercel **Production**
     - `stg` → Vercel **Preview**
     - `dev` → Vercel **Development** (opcional, solo para `vercel dev` local)

- [ ] **Verificar sync inicial**
  1. En Vercel dashboard: `Settings` → `Environment Variables`
  2. Confirmar que aparezcan las variables sincronizadas (ícono de Doppler)
  3. **IMPORTANTE**: no deben quedar variables duplicadas (Vercel + Doppler). Si existen, eliminar las de Vercel manualmente DESPUÉS de confirmar que Doppler las pushea correctamente.

- [ ] **Redeploy de verificación**
  1. Hacer un redeploy manual de Preview
  2. Verificar que build y runtime tengan acceso a los secretos
  3. Revisar logs de Vercel buscando errores de env var faltante

### Integración con GitHub Actions

- [ ] **Crear Service Token en Doppler**
  1. `Access` → `Service Tokens` → `Generate`
  2. Scope: `bodega-san-martin` / `prd` (y otro para `stg`)
  3. Permisos: solo lectura (Read Only)
  4. Copiar el token (formato `dp.st.XXXXXX`)

- [ ] **Agregar secret en GitHub**
  1. GitHub repo → `Settings` → `Secrets` → `Actions` → `New repository secret`
  2. Nombre: `DOPPLER_TOKEN`
  3. Valor: el token de servicio recién creado

- [ ] **Actualizar `.github/workflows/ci.yml`** para usar Doppler
  ```yaml
  - name: Install Doppler CLI
    uses: dopplerhq/cli-action@v3

  - name: Run build with Doppler secrets
    env:
      DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
    run: doppler run -- npm run build
  ```
  - _Los valores dummy actuales en `ci.yml` (DATABASE_URL placeholder) pueden eliminarse porque Doppler los inyectará._

- [ ] **Verificar CI pasa con secretos de Doppler**

### Limpieza post-migración

- [ ] **Mover `.env.local` actual a backup**
  ```bash
  mv .env.local .env.local.backup
  echo ".env.local.backup" >> .gitignore
  ```

- [ ] **Crear/actualizar `.env.example`** con la lista de variables (SIN valores reales)
  - _Ya existe probablemente — verificar que esté completo_

- [ ] **Desarrollo local usa Doppler**
  ```bash
  # En lugar de `npm run dev`:
  doppler run -- npm run dev

  # O definir alias en package.json:
  # "dev:doppler": "doppler run -- next dev --turbo"
  ```

- [ ] **Actualizar `package.json` con scripts Doppler-aware**
  ```json
  {
    "scripts": {
      "dev": "next dev --turbo",
      "dev:doppler": "doppler run -- next dev --turbo",
      "build:doppler": "doppler run -- next build"
    }
  }
  ```

- [ ] **Actualizar `CLAUDE.md`** quitando la sección "Variables de entorno mínimas (`.env.local`)" y reemplazando por link a Doppler.

- [ ] **Revocar cualquier secreto rotado** en los servicios originales:
  - Stripe dashboard → rotar keys old
  - Supabase → rotar DATABASE_URL password si cambió
  - WhatsApp API → regenerar token

### Monitoreo continuo

- [ ] **Configurar audit log alerts en Doppler**
  - Alertas cuando alguien accede a `prd` secrets
  - Alerta cuando se edita una variable crítica

- [ ] **Rotación programada** (mínimo cada 6 meses):
  - `AUTH_SECRET`
  - `CRON_SECRET`
  - `STRIPE_WEBHOOK_SECRET`
  - Tokens de integraciones externas

---

## Dependencias bloqueantes que debes resolver

| Bloqueo | Quién lo desbloquea | Impacto |
|---|---|---|
| Crear cuenta Doppler | Tú (humano) | Nada avanza sin esto |
| Acceso admin a Vercel project | Tú | Sin esto no se puede integrar |
| Acceso admin a GitHub repo | Tú | Sin esto no se actualiza CI |
| Credenciales actuales de Stripe live, SMTP, WhatsApp | Tú | Sin esto no se puede rotar |

---

## Plan de rollback

Si Doppler falla en producción:
1. En Vercel: revertir a las variables manuales (guardar un export antes de empezar)
2. Desactivar la integración Doppler → Vercel
3. Re-deploy con las variables originales
4. Investigar el problema offline

**Importante:** NO eliminar las variables manuales de Vercel hasta haber verificado que Doppler funciona en Preview durante al menos 48h.

---

## Estado actual según repo

- ✅ Guía original `docs/doppler-migration-guide.md` existe (40 líneas, alto nivel)
- ✅ Este checklist ejecutable agregado
- ❌ Doppler CLI no instalado (basado en prompts del sistema)
- ❌ Cuenta Doppler no creada (asumido)
- ❌ Integración Vercel no configurada
- ❌ Secretos aún en `.env.local` + Vercel env vars

## Próximo paso inmediato

👉 **Crear cuenta en https://doppler.com y crear proyecto `bodega-san-martin`.** Todo lo demás se puede automatizar con el CLI después.
