---
name: pr-describer
description: Genera automáticamente el body de un Pull Request a partir de los commits del branch actual. Agrupa los cambios por tipo (feat, fix, refactor, etc.), resume el impacto, genera checklist de testing y footer. Usar cuando Brandon diga "pr description", "describeme el pr", "prepara pr", o antes de hacer gh pr create.
user-invocable: true
model: sonnet
context: fork
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Agent, TaskCreate, TaskUpdate
---

# /pr-describer — Auto-generador de PR descriptions

Cuando un branch tiene N commits listos para merge, este skill extrae los commits,
los agrupa por tipo de Conventional Commit, y genera un PR body profesional.

## Flujo

1. **Detectar base branch** (`main` o `master`)
2. **Extraer commits** del branch actual (`git log base..HEAD --oneline`)
3. **Parsear** los Conventional Commits (type, scope, subject)
4. **Agrupar** por tipo en secciones markdown
5. **Detectar breaking changes** (footer `BREAKING CHANGE:` o `!` en type)
6. **Generar checklist de testing** basado en los tipos (feat → manual test, fix → regression, refactor → no regressions)
7. **Incluir estadísticas** (archivos cambiados, LOC delta, tests afectados)
8. **Output**: body en markdown listo para `gh pr create`

## Estructura del output

```markdown
## Summary
<1-3 bullets con el "qué" general del PR>

## Changes by type

### Features
- feat(scope): description (commit-sha-short)

### Fixes
- fix(scope): description (commit-sha-short)

### Refactors / Performance / Docs / Tests / Chores
(secciones condicionales — solo si hay commits de ese tipo)

## Breaking changes
(solo si hay commits con ! o BREAKING CHANGE: footer)

## Stats
- Archivos: N modificados, M agregados, K eliminados
- LOC: +X / -Y
- Tests: lista de archivos __tests__ tocados

## Test plan
- [ ] Unit tests pasan: `npm test`
- [ ] TypeScript compila: `npx tsc --noEmit`
- [ ] Lint pasa: `npm run lint`
- [ ] (condicional por tipo)

🤖 Generated with Claude Code
```

## Reglas

1. **NO inventes commits** — solo reportá lo que hay en `git log`
2. **Scopes en negrita** en cada item para escaneabilidad
3. **Breaking changes en sección separada y destacada**
4. **Máximo 5 bullets en Summary** — si hay más, el PR es muy grande y conviene sugerir split
5. **No incluir commits de docs:** triviales en Summary (solo en su sección)

## Invocación

```
/pr-describer                    # usa branch actual vs main
/pr-describer --base develop     # vs otro branch
/pr-describer --include-docs     # incluye commits docs en Summary (default: solo su sección)
```

## Ejecución paso a paso

```bash
# 1. Detectar base
BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
BASE=${BASE:-main}

# 2. Extraer commits
git log "${BASE}..HEAD" --pretty='format:%h|%s|%b' --no-merges

# 3. Parsear y agrupar (el skill hace esto con Claude)

# 4. Stats
git diff --stat "${BASE}..HEAD"

# 5. Output markdown
```

## Anti-patrones

- ❌ Generar PR body antes de que los commits estén hechos
- ❌ Incluir commits de otros branches (los merges sí, si son relevantes)
- ❌ Reescribir los subjects de los commits ("arreglando estilo") — usá los reales
- ❌ Incluir Co-Authored-By tags en el PR body (van en los commits, no acá)
