# Dame los tokens y yo me encargo del resto

**Fecha:** 2026-04-06
**Estado:** 3 CLIs instalados localmente — solo faltan tokens para empezar a ejecutar

---

## Lo que YA está instalado en tu máquina

```bash
gh        2.89.0    (GitHub CLI)            ✅
vercel    50.39.0   (Vercel CLI)            ✅
doppler   3.75.3    (Doppler CLI)           ✅
```

Ejecuta esto para confirmar:
```bash
cd bodega-san-martin
bash scripts/cli-env.sh --check
```

---

## Por qué necesito tokens (y por qué es seguro)

Yo NO puedo "tomar control de tu máquina" como TeamViewer — eso sería un riesgo enorme y Claude no funciona así. La barrera de seguridad real es la **autenticación**: cada servicio (GitHub, Vercel, Doppler, Sentry) exige un token explícito.

Cuando tú generas un token y me lo pasas:
- **El token vive en `.env.local`** (que está en `.gitignore`)
- **Yo solo lo uso para hacer llamadas API** del servicio correspondiente
- **Tú puedes revocarlo en cualquier momento** desde el dashboard del servicio
- **Tiene scopes limitados** (le doy permisos solo a lo que necesito)

Esto es **mucho más seguro** que un acceso remoto a tu máquina.

---

## Los 4 tokens que necesito (total: ~10 minutos de tu tiempo)

### 1. GitHub Personal Access Token (2 min)

**Para qué:** arreglar el remote del repo raíz (`Brandon.git` no existe), verificar workflows, crear PRs.

#### Pasos
1. Ve a https://github.com/settings/tokens?type=beta
2. Click **"Generate new token"** (Fine-grained)
3. Configuración:
   - **Token name:** `claude-bsm-automation`
   - **Expiration:** 90 days (puedes renovar después)
   - **Repository access:** "Only select repositories" → elegir el repo raíz correcto + `Mercado`
   - **Permissions:**
     - Repository → **Contents**: Read and write
     - Repository → **Pull requests**: Read and write
     - Repository → **Actions**: Read
4. Click **"Generate token"** → copia el token (formato `github_pat_...`)
5. Pégalo en `.env.local`:
   ```env
   GITHUB_TOKEN=github_pat_...
   ```

Una vez tengas el token, dime "GitHub listo" y yo:
- Encuentro la URL correcta del repo raíz
- Arreglo el remote
- Pusheo los 2 commits stale
- Verifico que `release-please.yml` corrió OK
- Creo un PR para el branch `feature/admin-improvements-2026-03-22`

---

### 2. Vercel Token (1 min)

**Para qué:** activar Rolling Releases, ver deployments, configurar env vars, verificar logs.

> **Alternativa:** ya inicié el OAuth flow del MCP de Vercel. Si prefieres aprobar ese URL, no necesitas este token. Pero un token directo es más simple.

#### Pasos
1. Ve a https://vercel.com/account/tokens
2. Click **"Create Token"**
3. Configuración:
   - **Token Name:** `claude-bsm-automation`
   - **Scope:** tu usuario o el team donde vive el proyecto
   - **Expiration:** 90 days
4. Copia el token (formato `vercel_...` o un hash largo)
5. Pégalo en `.env.local`:
   ```env
   VERCEL_TOKEN=...
   ```

Una vez tengas el token, dime "Vercel listo" y yo:
- Activo Rolling Releases en el dashboard
- Verifico que el último deploy es exitoso
- Reviso env vars de producción
- Veo logs de las últimas funciones

---

### 3. Doppler Service Token (3 min)

**Para qué:** ejecutar las Fases 2-6 del plan de migración a Doppler (importar secrets, integrar con Vercel, actualizar CI).

#### Pasos
1. Ve a https://doppler.com → registrarte (gratis hasta 5 usuarios)
2. **Create new project** → nombre: `bodega-san-martin`
3. Doppler crea automáticamente 3 configs: `dev`, `stg`, `prd`
4. Ve a **Access** → **Service Tokens** → **Generate**
5. Configuración:
   - **Name:** `claude-bsm-automation`
   - **Config:** `dev` (más seguro empezar por dev)
   - **Access:** Read/Write
6. Copia el token (formato `dp.st.dev.XXXXXX`)
7. Pégalo en `.env.local`:
   ```env
   DOPPLER_TOKEN=dp.st.dev.XXXXXX
   ```

Una vez tengas el token, dime "Doppler listo" y yo:
- Importo `.env.local` actual al config `dev` de Doppler
- Verifico que los secrets se subieron OK
- Creo los configs `stg` y `prd` con valores rotados
- Conecto Doppler con Vercel (usando el VERCEL_TOKEN)
- Actualizo `.github/workflows/ci.yml` para usar Doppler
- Hago commit + push de los cambios

---

### 4. Sentry Auth Token (3 min)

**Para qué:** crear las 4 reglas de alerta usando el script ya existente (`scripts/setup-sentry-alerts.ts`, 480 líneas).

#### Pasos
1. Ve a https://sentry.io/settings/{tu-org}/developer-settings/new-internal/
2. **Create New Internal Integration**:
   - **Name:** `Claude BSM Automation`
   - **Permissions:**
     - Project: **Admin**
     - Alerts: **Admin**
     - Issue & Event: **Read**
3. Click **Save** → copia el token (formato `sntrys_...`)
4. Pégalo en `.env.local`:
   ```env
   SENTRY_AUTH_TOKEN=sntrys_...
   SENTRY_ORG=tu-org-slug
   SENTRY_PROJECT=bodega-san-martin
   ```

Una vez tengas las 3 vars, dime "Sentry listo" y yo:
- Ejecuto `npx tsx scripts/setup-sentry-alerts.ts --dry-run` para que veas qué se va a crear
- Si te parece bien, ejecuto sin `--dry-run` y se crean las 4 reglas
- Verifico en https://sentry.io/organizations/{org}/alerts/rules/

---

## Resumen rápido

| Servicio | Token name en .env.local | Mi comando para verificarlo |
|---|---|---|
| GitHub | `GITHUB_TOKEN` | `gh auth status` |
| Vercel | `VERCEL_TOKEN` | `vercel whoami` |
| Doppler | `DOPPLER_TOKEN` | `doppler me` |
| Sentry | `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | `npx tsx scripts/setup-sentry-alerts.ts --dry-run` |

## Cómo me los pasas

**Opción A:** Pega los tokens directamente en `.env.local` y dime "todo listo en .env.local"

**Opción B:** Pásamelos por chat (yo los meto al `.env.local` por ti)

**Opción C:** Genera todos los tokens primero, dime "tengo los 4 tokens listos, los pego ahora" y los pasas en el siguiente mensaje

---

## Después de los 4 tokens — qué hago de corrido

1. ✅ Arreglo el remote del repo raíz y pusheo los 2 commits stale
2. ✅ Activo Rolling Releases en Vercel
3. ✅ Creo las 4 reglas de Sentry
4. ✅ Importo secrets a Doppler dev
5. ✅ Conecto Doppler con Vercel
6. ✅ Actualizo CI workflow para usar Doppler
7. ✅ Verifico que release-please corrió en GitHub
8. ✅ Reporto status final con todos los checks verdes

**Tiempo estimado autónomo después de tener los tokens:** ~15 minutos.
**Tu tiempo total:** ~10 minutos generando tokens + 0 minutos viendo cómo trabajo.
