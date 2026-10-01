---
name: health-check
description: Dashboard unificado de salud del sistema. Muestra SLOs + crons + errores Sentry + deploy status en 1 tabla. Usar cuando Brandon diga "como esta prod", "health check", "estado del sistema", "que pasa en produccion".
user-invocable: true
model: sonnet
allowed-tools: Read, Bash, Grep, WebFetch
argument-hint: "[full|slo|crons|errors]"
---

# /health-check — Estado del sistema en 1 tabla

## Que hace

Consulta 4 fuentes y muestra todo en 1 vista:

```
/health-check full   → todo
/health-check slo    → solo SLOs
/health-check crons  → solo cron jobs
/health-check errors → solo errores Sentry
```

## Algoritmo

### 1. SLOs (via /api/superadmin/slo)
```bash
# O via Sentry MCP directo si disponible
curl -s localhost:3000/api/superadmin/slo
```
Extraer: dataSource, deployBlocked, tabla de SLOs con status emoji

### 2. Cron Health (via /api/superadmin/cron-health)
```bash
curl -s localhost:3000/api/superadmin/cron-health
```
Extraer: totalTracked, neverRun, failedLast24h, staleJobs

### 3. Errores Sentry (via MCP)
Usar `mcp__sentry__search_issues` org=buleje-sy project=bodega-san-martin
Query: "unresolved errors in last 24 hours"

### 4. Deploy Status (via Vercel)
```bash
npx vercel ls --limit 3 2>/dev/null
```
Extraer: ultimo deploy, estado, URL

## Formato de salida

```markdown
## Sistema de Salud — [timestamp]

### SLOs
| SLO | Target | Current | Budget | Status |
|-----|--------|---------|--------|--------|

### Cron Jobs (50 registrados)
| Metrica | Valor |
|---------|-------|
| Tracked | X/50 |
| Never run | [lista] |
| Failed 24h | [lista] |
| Stale >48h | [lista] |

### Errores Produccion (Sentry)
| # | Issue | Users | Last Seen |
|---|-------|-------|-----------|

### Deploy
| Deploy | Status | URL | Ago |
|--------|--------|-----|-----|
```

## Reglas
1. Si SLO tiene >90% burned → marcar 🔴 y decir "deploy bloqueado"
2. Si hay crons que nunca corrieron → listarlos como warning
3. Si hay 0 errores en Sentry → decir "produccion limpia"
4. Siempre mostrar timestamp de la consulta
