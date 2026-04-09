---
name: session-recap
description: |
  Resume la sesión actual y propone qué codificar como skill/hook/agent
  nuevo. Usar cuando Brandon diga "cerrá la sesión", "qué hicimos hoy",
  "resumen de la sesión", "session recap", "recap", "qué aprendimos".
  Este skill es el DISPARADOR del loop `self-improvement` — primero
  resume, después pregunta si quiere correr el compound loop.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Bash, Grep, Glob
argument-hint: "[short | full | since-last-commit]"
model: sonnet
---

# Session Recap — resume y propone

Skill corto que cierra una sesión con un recap estructurado + propuesta
de cosas a codificar como mejoras permanentes del sistema.

## Cuándo usarlo

- Al terminar una jornada de trabajo
- Antes de cerrar Claude Code
- Cuando Brandon quiere "cerrar el día con un resumen"
- Como prerequisito del skill `self-improvement` (recap primero, self-improve después)

## Proceso — 5 pasos

### Paso 1 — Recolectar métricas de la sesión

```bash
# Git commits de la sesión (asumimos "sesión" = últimas 6 horas)
git log --since="6 hours ago" --oneline

# Archivos tocados
git diff HEAD~5 HEAD --stat 2>/dev/null || git diff HEAD~1 HEAD --stat

# Tests: último resultado
tail -5 .husky/.last-test-run.log 2>/dev/null
test -f .husky/.last-test-run.FAILED && echo "❌ Tests rotos" || echo "✅ Tests OK"

# Branch actual
git branch --show-current
```

### Paso 2 — Identificar temas trabajados

Leer los commit messages + diff stats y categorizar por:

- 🐛 Bugs corregidos
- ✨ Features nuevas
- ♻️ Refactors
- 📝 Docs / ADRs
- 🧪 Tests nuevos
- 🔧 Config / infra
- 🎨 UI / UX

### Paso 3 — Detectar patrones candidatos a codificar

Si hay 2+ ítems de la misma categoría → candidato a skill/hook.

Ejemplos:

| Pattern de la sesión | Candidato |
|---|---|
| Hice 3 refactors de `lib/db/*.db.ts` | Skill `db-class-refactor-safe` |
| Bloqueé `rm -rf` 2 veces manualmente | Hook `pre-bash-guard` (ya existe ✅) |
| Brandon preguntó 2 veces "¿cómo deployo a Vercel?" | Skill `deploy-vercel` más visible |
| Hice el mismo commit-message pattern 5 veces | Template en `.claude/templates/commit-messages.md` |

### Paso 4 — Generar el reporte recap

Formato obligatorio:

```markdown
## 📊 Session Recap — [fecha]

### ⏱️ Números de la sesión
- Duración: ~X horas
- Commits: N
- Archivos tocados: N (+X insertions, -Y deletions)
- Tests finales: [emoji] [N/M]
- Branch: [nombre]

### 🎯 Temas trabajados
1. [Tema 1] — [1 frase simple]
2. [Tema 2] — [1 frase simple]
...

### 🏆 Logros
- ...
- ...

### 🐛 Bugs encontrados y corregidos
- ...

### 🚨 Deuda nueva detectada
- ...

### 💡 Candidatos a codificar como mejora permanente
1. 🆕 Skill: [nombre] — [razón]
2. 🪝 Hook: [evento] — [razón]
3. 📝 ADR: [título] — [razón]

### 🎬 ¿Querés correr `/self-improvement` sobre esta sesión?
Si sí, las propuestas de arriba pasan a candidatos formales
con diff de aplicación + formulario de aprobación.
```

### Paso 5 — Invitar al loop self-improvement

Si el usuario responde "sí" al final del recap, invocar el skill
`self-improvement` con los candidatos pre-cargados. El self-improvement
hace el trabajo formal de generar diffs, branches y EVOLUTION_LOG entry.

## Variantes

- `/session-recap short` — máximo 10 líneas, solo lo crítico
- `/session-recap full` — versión extendida con análisis de cada commit individual
- `/session-recap since-last-commit` — solo desde el último commit (útil si la sesión tiene muchos commits)

## Reglas

1. **Nunca inventar métricas** — si git log no muestra nada, decirlo.
2. **Lenguaje simple Feynman** — Brandon lee esto cansado al final del día.
3. **Máximo 5 candidatos** de mejora — más de 5 es paralysis by analysis.
4. **Referenciar entries previas del EVOLUTION_LOG** si aplica — compound.
5. **Invitar al loop** al final, no ejecutarlo automático.
