---
name: deploy-check
description: Verifica TODO antes de deploy en 1 comando. lint + tsc + test + build + SLOs + cron health. Usar antes de cada deploy o cuando Brandon diga "esta listo para deploy", "deploy check", "pre-deploy".
user-invocable: true
model: haiku
allowed-tools: Bash, Read, Grep
argument-hint: "[full|quick]"
---

# /deploy-check — Verificacion Pre-Deploy

## Modos
- `/deploy-check quick` — solo lint + tsc (30s)
- `/deploy-check full` — todo (2-3 min)
- `/deploy-check` — default: full

## Algoritmo

### Quick (lint + tsc)
```bash
cd bodega-san-martin
npm run lint && npx tsc --noEmit
```

### Full (todo)
```bash
cd bodega-san-martin

# 1. Codigo limpio
npm run lint
npx tsc --noEmit

# 2. Tests
npm run test

# 3. Build
npm run build

# 4. SLO check (si el servidor esta corriendo)
curl -s http://localhost:3000/api/superadmin/slo 2>/dev/null | head -5

# 5. Cron health check
curl -s http://localhost:3000/api/superadmin/cron-health 2>/dev/null | head -5
```

## Formato de salida

```markdown
## Deploy Check — [timestamp]

| Check | Status | Detalle |
|-------|--------|---------|
| Lint | PASS/FAIL | N warnings |
| TSC | PASS/FAIL | N errors |
| Tests | PASS/FAIL | N passed, N failed |
| Build | PASS/FAIL | duration |
| SLOs | PASS/BLOCKED | budget status |
| Crons | OK/WARNING | N failed last 24h |

**Veredicto: DEPLOY SAFE / DEPLOY BLOCKED**
```

## Reglas
1. Si CUALQUIER check falla → veredicto BLOCKED
2. Si SLO >90% burned → BLOCKED (regla 16 CLAUDE.md)
3. Si crons fallando → WARNING (no bloquea, pero reportar)
4. Reportar tiempo total de verificacion
