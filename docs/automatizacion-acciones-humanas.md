# Automatización de las Acciones Humanas via MCP / API

**Fecha:** 2026-04-06
**Objetivo:** Reemplazar las acciones manuales del checklist (Vercel/Sentry/Doppler/GitHub) por flujos que Claude pueda ejecutar autónomamente con los tokens correctos.

---

## 1. Vercel — Rolling Releases ✅ (MCP disponible)

### Estado actual
- `vercel.json` ya tiene `rollingRelease` configurado (10% → 50% → 100%)
- **Falta:** activar el toggle en Vercel dashboard

### Automatización via MCP

**MCP server:** `plugin:vercel:vercel` (https://mcp.vercel.com)

Claude ya inició el flujo OAuth. **Tu única acción:** abrir el URL que Claude te dio y aprobar.

Una vez aprobado, Claude puede:
- Listar proyectos y deployments
- Configurar Rolling Releases via API
- Ver logs y métricas
- Promover deployments a producción

### Cómo darle acceso

```
1. Cuando Claude inicie el OAuth, copia el URL que te muestra
2. Abre el URL en tu navegador
3. Aprueba el acceso
4. Avísale a Claude que ya autorizaste
```

Claude detectará automáticamente cuando los tools del MCP estén disponibles y los usará.

---

## 2. Sentry — Reglas de alerta ⚠️ (sin MCP nativo, usar API)

### Estado actual
- `lib/sentry-alerts.ts` tiene helpers programáticos
- `docs/sentry-alert-setup.md` documenta las 4 reglas a crear
- **Falta:** crear las reglas en sentry.io

### Automatización via Sentry REST API

**No hay MCP de Sentry**, pero la API REST permite crear reglas con un Internal Integration Token.

#### Setup (una sola vez, ~3 minutos)

1. Ve a https://sentry.io/settings/{tu-org}/developer-settings/new-internal/
2. Crea una nueva **Internal Integration**:
   - Nombre: `Claude Auto-Setup`
   - Permissions: `Project: Admin`, `Alerts: Admin`
3. Copia el **token** que genera (formato: `sntrys_...`)
4. Guárdalo en `.env.local`:
   ```env
   SENTRY_AUTH_TOKEN=sntrys_...
   SENTRY_ORG=tu-org-slug
   SENTRY_PROJECT=bodega-san-martin
   ```

#### Cómo Claude lo ejecuta

Una vez tengas las env vars, dile a Claude:

> "Crea las 4 reglas de alerta de Sentry usando el SENTRY_AUTH_TOKEN del .env.local"

Claude usará `Bash` con curl o `WebFetch` para llamar a:

```bash
POST https://sentry.io/api/0/projects/{org}/{project}/rules/
Authorization: Bearer $SENTRY_AUTH_TOKEN
```

Con el JSON de cada una de las 4 reglas (Error Rate, P95 Latency, New Exception, Failure Rate).

### Script generador (ya existe ✅)

`scripts/setup-sentry-alerts.ts` (480 líneas) — ya está listo. Soporta `--dry-run`.

Cómo ejecutarlo:
```bash
# Verificar primero qué se va a crear (sin tocar Sentry)
npx tsx scripts/setup-sentry-alerts.ts --dry-run

# Crear las reglas de verdad
npx tsx scripts/setup-sentry-alerts.ts
```

---

## 3. Doppler — Setup inicial ⚠️ (CLI install, OAuth requerido)

### Estado actual
- Plan completo en `docs/doppler.md`
- **Falta:** crear cuenta + login + import secrets

### Automatización parcial

#### Lo que Claude PUEDE hacer

1. **Instalar el CLI**:
   ```bash
   npm install -g @dopplerhq/cli
   # o
   scoop install doppler
   ```
   Claude ejecuta esto con `Bash`.

2. **Una vez tengas un Service Token**, Claude puede:
   - Importar secretos desde `.env.local` con `doppler secrets upload`
   - Configurar la integración con Vercel (via Vercel MCP)
   - Actualizar el workflow de CI con el token

#### Lo que SOLO tú puedes hacer (5 minutos)

1. Crear cuenta en https://doppler.com (con email)
2. Crear el proyecto `bodega-san-martin`
3. **Generar un Service Token** (Read/Write para `dev`)
4. Pasarle el token a Claude:
   ```env
   DOPPLER_TOKEN=dp.st.dev.XXXXXX
   ```

Después, Claude puede ejecutar el resto del flujo (Fases 2-6 del `docs/doppler.md`) sin tu intervención.

---

## 4. GitHub — Verificar release-please + arreglar remote ⚠️ (gh CLI)

### Estado actual
- Repo raíz tiene un remote roto (`Brandon.git` no existe)
- `release-please.yml` ya está configurado, falta verificar que corra

### Automatización via gh CLI

#### Setup (una sola vez, 2 minutos)

```bash
# Windows (Scoop)
scoop install gh

# O descarga directa
# https://cli.github.com/
```

Después:
```bash
gh auth login
# Sigue el flujo: GitHub.com → HTTPS → autorizar via browser
```

#### Cómo Claude lo usa

Una vez instalado y autenticado, Claude puede:

```bash
# Verificar workflows
gh run list --workflow=release-please.yml

# Ver detalles de un PR
gh pr view 123

# Crear PRs automáticos
gh pr create --title "..." --body "..."

# Listar repos del usuario para encontrar el correcto
gh repo list Buleje
```

### Para arreglar el remote del raíz

Cuando Claude tenga `gh` disponible, puede ejecutar:
```bash
gh repo list Buleje --limit 100
```

Y encontrar el repo correcto para hacer:
```bash
git remote set-url origin https://github.com/Buleje/<nombre>.git
```

---

## 5. Probar /admin manualmente — Playwright MCP ⚠️ (instalado pero desconectado)

### Estado actual
- Hay un Playwright MCP instalado pero **se desconectó** durante la sesión
- El refactor del admin tiene 5 hooks + 5 componentes nuevos sin tests E2E

### Automatización via Playwright MCP

Si reconectas el Playwright MCP, Claude puede:
- Navegar a http://localhost:3000/admin
- Tomar screenshots del estado actual
- Hacer click en cada tab del sidebar
- Verificar que cargan sin errores en console
- Cerrar sesión y volver a entrar
- Probar el modal de "Gestionar módulos"
- Probar el flujo de "Limpiar datos"

### Cómo reconectar

```bash
# Verificar el estado del MCP
claude mcp list

# Reconectar si está desconectado
claude mcp reconnect playwright

# O reiniciar Claude Code para que recargue todos los MCPs
```

Una vez reconectado, dile a Claude:

> "Levanta `npm run dev` en background y prueba el panel admin con Playwright: navega a localhost:3000/admin, toma screenshots de cada tab y reporta cualquier error en la console"

---

## Resumen — Qué necesita Claude para automatizarlo todo

| Acción | Quién la hace | Tiempo humano |
|---|---|---|
| 1. Vercel Rolling Releases | Claude (después que apruebes el OAuth) | 30 seg (un click) |
| 2. Sentry alertas | Claude (con SENTRY_AUTH_TOKEN en .env.local) | 3 min (crear token) |
| 3. Doppler Fase 1 | Tú (crear cuenta) + Claude (resto) | 5 min |
| 4. GitHub workflows | Claude (con gh CLI instalado y `gh auth login` hecho) | 2 min (instalar + auth) |
| 5. Probar /admin con Playwright | Claude (con Playwright MCP reconectado) | 1 min (reconectar MCP) |
| **Total para liberar todo** | — | **~12 minutos humanos** |

Después de esos 12 minutos, Claude puede ejecutar todo el resto autónomamente.

---

## Tabla de credenciales que Claude necesita

Guarda estos en `.env.local` (o donde gestiones secretos):

```env
# Sentry (genera Internal Integration Token)
SENTRY_AUTH_TOKEN=sntrys_...
SENTRY_ORG=tu-org
SENTRY_PROJECT=bodega-san-martin

# Doppler (después de crear cuenta y proyecto)
DOPPLER_TOKEN=dp.st.dev.XXXXXX

# Vercel (la MCP maneja el OAuth — no necesitas token)

# GitHub (gh CLI maneja auth — no necesitas token)
```

Cuando los tengas listos, dile a Claude:

> "Ya configuré los tokens. Ejecuta el setup de Sentry, Doppler y GitHub."

Y Claude se encargará del resto.
