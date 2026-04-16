# MCP installation guide — 4 recomendados Nivel 1

Los MCPs van configurados por MÁQUINA (no por repo), normalmente en
`~/.claude/settings.json` o vía comando `claude mcp add`. Por eso este
archivo es una GUÍA para que Brandon los instale manualmente en su
terminal — Claude Code no puede instalarlos desde una sesión porque
necesitan credenciales y modifican config de usuario.

## Instalación paso a paso

Ejecutar en la terminal de Windows (bash) del usuario:

### 1. GitHub MCP (oficial Anthropic)

```bash
# Instalar via NPM
npm install -g @modelcontextprotocol/server-github

# O usar el comando de Claude Code (recomendado)
claude mcp add github --server-type stdio \
  --command npx \
  --args "-y" "@modelcontextprotocol/server-github"

# Requiere GitHub Personal Access Token con permisos:
# - repo (full control)
# - workflow (read/write)
# - read:org (opcional, para orgs)
# Crear en: https://github.com/settings/tokens/new

# Agregar el token:
claude mcp env github GITHUB_PERSONAL_ACCESS_TOKEN=<tu-token>
```

**Valor para el proyecto:**
- Crear/editar issues, PRs, releases desde Claude
- Revisar CI status, leer workflow runs
- Comentar en PRs de otros miembros
- Merge PRs (con confirmación)

### 2. Sentry MCP (oficial)

```bash
# Instalar
claude mcp add sentry --server-type stdio \
  --command npx \
  --args "-y" "@sentry/mcp-server"

# Token: crear en https://sentry.io/settings/auth-tokens/
# Scopes necesarios: project:read, event:read, org:read
claude mcp env sentry SENTRY_AUTH_TOKEN=<tu-token>
claude mcp env sentry SENTRY_ORG=<tu-slug-org>
claude mcp env sentry SENTRY_PROJECT=<tu-slug-proyecto>
```

**Valor para el proyecto:**
- Leer errores de producción sin copy-paste
- Linkear errores a commits que los introdujeron
- Auto-triage de nuevas excepciones
- Integra con el skill `production-sync` existente

### 3. Memory MCP (official modelcontextprotocol/servers)

```bash
# Instalar
claude mcp add memory --server-type stdio \
  --command npx \
  --args "-y" "@modelcontextprotocol/server-memory"

# Sin credenciales — todo local
# Reemplaza el sistema actual de memory/*.md con indexación semántica real
```

**Valor para el proyecto:**
- Memoria persistente con búsqueda semántica (no keyword)
- Reemplaza el frágil sistema de memory/*.md
- Recupera contexto de sesiones pasadas automáticamente

### 4. Sequential Thinking MCP (oficial)

```bash
# Instalar
claude mcp add sequential-thinking --server-type stdio \
  --command npx \
  --args "-y" "@modelcontextprotocol/server-sequential-thinking"

# Sin credenciales
```

**Valor para el proyecto:**
- Reasoning estructurado en pasos explícitos
- Mejora precisión en debugging de zonas de peligro (checkout/**, orders.db)
- Complementa al skill `systematic-debugging` existente

## Verificación post-instalación

```bash
# Listar todos los MCPs instalados
claude mcp list

# Debería mostrar los 4 nuevos + los que ya tenés:
# - github (nuevo)
# - sentry (nuevo)
# - memory (nuevo)
# - sequential-thinking (nuevo)
# - figma, context7, supabase, playwright, stripe, etc. (existentes)

# Test individual
claude mcp test github
claude mcp test sentry
```

## Próxima sesión — cómo usarlos

Una vez instalados, Claude Code los expone automáticamente. En la próxima sesión:

- `"Crea un issue para tracking de sub-proyecto #2"` → usa GitHub MCP
- `"Qué errores hay en prod en las últimas 24h?"` → usa Sentry MCP
- `"Qué aprendimos de las últimas 10 sesiones sobre checkout?"` → usa Memory MCP
- `"Pensá paso a paso el root cause de este deadlock"` → Sequential Thinking MCP

## Tiempo total estimado

| Paso | Tiempo |
|---|---|
| GitHub (incluye crear PAT) | 10 min |
| Sentry (incluye crear token) | 10 min |
| Memory (local, sin creds) | 3 min |
| Sequential Thinking (local, sin creds) | 3 min |
| Verificación | 5 min |
| **Total** | **~30 min** |

## Anti-patrones

- ❌ No pongas los tokens en `.claude/settings.json` del repo — van en `~/.claude/settings.json` (per-machine)
- ❌ No commitees `mcp-health-cache.json` (es state per-session)
- ❌ No instales GitHub MCP con un token con scope `admin:org` si no lo necesitás (riesgo alto)
- ❌ No invoques Memory MCP para cosas que CLAUDE.md ya cubre (es para lo no-documentado)

## Si algo falla

```bash
# Remover un MCP problemático
claude mcp remove <nombre>

# Ver logs de un MCP
claude mcp logs <nombre>

# Reset completo de un MCP
claude mcp remove <nombre> && claude mcp add <nombre> ...
```
