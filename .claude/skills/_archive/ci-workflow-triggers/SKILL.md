---
name: ci-workflow-triggers
description: Diagnosticar por qué CI no corre en un PR — branch triggers, paths filters, engine mismatch, npm cache portable, coverage thresholds vs baseline
user-invocable: true
model: sonnet
allowed-tools: Read, Grep, Glob, Bash
argument-hint: "[PR# | branch | 'check-all']"
---

# CI Workflow Triggers — Skill

**Cuándo usar:** cuando un PR muestra CI checks que no aparecen / quedan "pending" / fallan por install antes de los tests reales.

## Checklist de diagnóstico (en orden)

### 1. ¿El workflow se dispara para esta branch?

```bash
grep -A3 "^on:" .github/workflows/ci.yml | head -8
```

Si dice `branches: [master, main]` y tu PR es a `prod` → el workflow NO corre. Solución:
```yaml
on:
  push:        { branches: [master, main, prod] }
  pull_request: { branches: [master, main, prod] }
```

En este repo `prod` es la branch activa de deploy (master abandonado 716+ commits atrás — ver `feedback_pr_to_prod_not_master.md`).

### 2. ¿Engine mismatch en `npm ci`?

Log típico:
```
npm error code EBADENGINE
npm error notsup Required: {"node":">=24.15.0"}
npm error notsup Actual:   {"node":"v20.20.2"}
```

`package.json` exige Node 24+ pero el workflow usa Node 20. Fix:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 24   # NO 20
```

Workflows a revisar (sed bulk):
```bash
sed -i 's/node-version: 20$/node-version: 24/g' .github/workflows/*.yml
```

### 3. ¿`.npmrc` con cache path absoluto a tu máquina?

```
npm error EACCES: permission denied, mkdir '/home/usuario'
```

El `.npmrc` del repo tiene:
```
cache=/home/usuario/.npm-cache
```

GitHub Actions runner no tiene `/home/usuario` → EACCES. Fix: mover esa línea a `~/.npmrc` del usuario local, no del repo.

### 4. ¿Coverage thresholds vs baseline real?

Log típico:
```
ERROR: Coverage for lines (7.67%) does not meet global threshold (85%)
```

Vitest config tiene thresholds aspiracionales (85/75/80/85) pero el codebase tiene ~7% real. Cada PR rompe sin haber introducido regresión. Fix:

```ts
// vitest.config.ts
thresholds: {
  statements: 7,  // = baseline real + 0.5pp
  branches: 5,
  functions: 4,
  lines: 7,
},
```

Y el step "Enforce coverage thresholds" en `ci.yml` alineado:
```yaml
run: npx vitest run --coverage --coverage.thresholds.lines=7 --coverage.thresholds.statements=7 ...
```

Roadmap: subir 5pp por trimestre.

### 5. ¿Solo Chromatic se saltea?

Chromatic `chromatic.yml` filtra por paths:
```yaml
pull_request:
  paths:
    - 'components/**'
    - 'packages/design-system/**'
```

Si tu PR solo toca `.github/`, `lib/`, `app/api/` → Chromatic NO corre. Es esperado, no es bug.

## Patrón de aplicación

1. `gh pr checks <N>` → identifica qué check falla / no aparece
2. Para "no aparece": grep triggers (#1, #5)
3. Para "fail" inmediato: revisar primer fail en log (#2 → #3 → #4 cascade)
4. Commits chiquitos por categoría, no batch mixto

## Referencias internas

- Commit `718e50e4`: agregar prod a triggers
- Commit `577485d4`: node 20→24 bulk
- Commit `0da223ee`: npm cache portable
- Commit `b8bd20d5`: coverage thresholds baseline
- Memoria: [[feedback_pr_to_prod_not_master]] [[project_session_2026-05-27_p0_audit]]
